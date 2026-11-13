import crypto from 'crypto';
import path from 'path';
import { query } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { isStorageConfigured, validateImageFile, uploadToSupabase, getSignedUrl } from '../utils/storage.js';
import { ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

async function attachSignedUrls(articles) {
  return Promise.all(
    articles.map(async (article) => {
      let imageUrl = null;
      if (article.image) {
        try {
          imageUrl = await getSignedUrl(article.image);
        } catch {
          imageUrl = article.image;
        }
      }
      return {
        ...article,
        image: imageUrl,
      };
    })
  );
}

export async function listArticles(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';
    const ordering = req.query.ordering ? String(req.query.ordering).trim() : '-created_at';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push(`m.author_id = $${idx++}`);
      params.push(req.user.id);
    }

    if (search) {
      conditions.push(`(m.title ILIKE $${idx} OR m.body ILIKE $${idx} OR m.category ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS count FROM youth_media_youtharticle m ${whereClause}`, params);
    const total = countRes.rows[0].count;

    let orderClause = 'ORDER BY m.created_at DESC';
    if (ordering === 'created_at') orderClause = 'ORDER BY m.created_at ASC';
    else if (ordering === '-created_at') orderClause = 'ORDER BY m.created_at DESC';
    else if (ordering === 'title') orderClause = 'ORDER BY m.title ASC';
    else if (ordering === '-title') orderClause = 'ORDER BY m.title DESC';

    const listQuery = `
      SELECT m.id, m.title, m.body, m.category, m.image, m.status, m.created_at, m.moderated_at,
             m.author_id AS author, u.username AS author_username
      FROM youth_media_youtharticle m
      JOIN accounts_user u ON m.author_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    const enriched = await attachSignedUrls(dataRes.rows);

    res.json(paginate(req, total, enriched));
  } catch (err) {
    next(err);
  }
}

export async function createArticle(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Somente alunos podem enviar conteúdo para a Mídia Jovem.');
    }

    const { title, body, category = '' } = req.body;
    const errors = {};

    if (!title || !title.trim()) errors.title = ['Este campo é obrigatório.'];
    if (!body || !body.trim()) errors.body = ['Este campo é obrigatório.'];

    let imagePath = '';
    if (req.file) {
      if (!isStorageConfigured()) {
        errors.image = ['O envio de imagens requer a configuração do Supabase Storage no backend.'];
      } else {
        validateImageFile(req.file);
        const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
        const uuid = crypto.randomUUID().replace(/-/g, '');
        imagePath = `youth-media/${req.user.id}/${uuid}${ext}`;
        await uploadToSupabase(imagePath, req.file.buffer, req.file.mimetype);
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const now = new Date();
    const insertRes = await query(
      `INSERT INTO youth_media_youtharticle (title, body, category, image, status, author_id, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING id, title, body, category, image, status, author_id AS author, created_at, moderated_at`,
      [title.trim(), body.trim(), String(category || '').trim(), imagePath, req.user.id, now]
    );

    const [enriched] = await attachSignedUrls([
      { ...insertRes.rows[0], author_username: req.user.username },
    ]);
    res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function getArticle(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT m.id, m.title, m.body, m.category, m.image, m.status, m.created_at, m.moderated_at,
              m.author_id AS author, u.username AS author_username
       FROM youth_media_youtharticle m
       JOIN accounts_user u ON m.author_id = u.id
       WHERE m.id = $1`,
      [id]
    );

    const article = result.rows[0];
    if (!article) throw new NotFoundError('Artigo não encontrado.');

    if (req.user.role === 'student' && article.author !== req.user.id) {
      throw new NotFoundError('Artigo não encontrado.');
    }

    const [enriched] = await attachSignedUrls([article]);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function updateArticle(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, author_id, status FROM youth_media_youtharticle WHERE id = $1', [id]);
    const article = existing.rows[0];
    if (!article) throw new NotFoundError('Artigo não encontrado.');

    if (req.user.role !== 'administrator' && article.author_id !== req.user.id) {
      throw new PermissionError('Você só pode editar seu próprio conteúdo.');
    }

    if (article.status === 'published') {
      throw new PermissionError('Conteúdo publicado não pode ser editado diretamente.');
    }

    const { title, body, category } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (body !== undefined) { updates.push(`body = $${idx++}`); values.push(body.trim()); }
    if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category.trim()); }

    if (req.file) {
      validateImageFile(req.file);
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const uuid = crypto.randomUUID().replace(/-/g, '');
      const newImagePath = `youth-media/${article.author_id}/${uuid}${ext}`;
      await uploadToSupabase(newImagePath, req.file.buffer, req.file.mimetype);
      updates.push(`image = $${idx++}`);
      values.push(newImagePath);
    }

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE youth_media_youtharticle SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    const updatedRes = await query(
      `SELECT m.id, m.title, m.body, m.category, m.image, m.status, m.created_at, m.moderated_at,
              m.author_id AS author, u.username AS author_username
       FROM youth_media_youtharticle m
       JOIN accounts_user u ON m.author_id = u.id
       WHERE m.id = $1`,
      [id]
    );

    const [enriched] = await attachSignedUrls(updatedRes.rows);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function deleteArticle(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, author_id FROM youth_media_youtharticle WHERE id = $1', [id]);
    const article = existing.rows[0];
    if (!article) throw new NotFoundError('Artigo não encontrado.');

    if (req.user.role !== 'administrator' && article.author_id !== req.user.id) {
      throw new PermissionError('Você só pode remover seu próprio conteúdo.');
    }

    await query('DELETE FROM youth_media_youtharticle WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function moderateArticle(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, author_id FROM youth_media_youtharticle WHERE id = $1', [id]);
    const article = existing.rows[0];
    if (!article) throw new NotFoundError('Artigo não encontrado.');

    const { status: newStatus } = req.body;
    if (!['published', 'rejected'].includes(newStatus)) {
      return res.status(400).json({ status: ['Status de moderação inválido.'] });
    }

    const now = new Date();
    const updated = await query(
      `UPDATE youth_media_youtharticle
       SET status = $1, moderated_at = $2
       WHERE id = $3
       RETURNING id, title, body, category, image, status, author_id AS author, created_at, moderated_at`,
      [newStatus, now, id]
    );

    await query(
      `INSERT INTO notifications_notification (recipient_id, title, message, url, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        article.author_id,
        'Conteúdo moderado',
        newStatus === 'published'
          ? 'Seu conteúdo foi publicado.'
          : 'Seu conteúdo não foi aprovado para publicação.',
        '/midia-jovem',
        now,
      ]
    );

    const userRes = await query('SELECT username FROM accounts_user WHERE id = $1', [article.author_id]);
    const [enriched] = await attachSignedUrls([
      { ...updated.rows[0], author_username: userRes.rows[0]?.username },
    ]);

    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

