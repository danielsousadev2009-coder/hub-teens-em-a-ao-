import { query, withTransaction } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { ApiError, ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

export async function listCategories(req, res, next) {
  try {
    const result = await query('SELECT id, name, description FROM ideas_ideacategory ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req, res, next) {
  try {
    const { name, description = '' } = req.body;
    if (!name || !name.trim()) {
      throw new ValidationError('O nome da categoria é obrigatório.', { name: ['Este campo é obrigatório.'] });
    }

    const trimmed = name.trim();
    const existing = await query('SELECT id FROM ideas_ideacategory WHERE LOWER(name) = LOWER($1)', [trimmed]);
    if (existing.rows.length > 0) {
      throw new ValidationError('Esta categoria já existe.', { name: ['Categoria já existe.'] });
    }

    const result = await query(
      'INSERT INTO ideas_ideacategory (name, description) VALUES ($1, $2) RETURNING id, name, description',
      [trimmed, description.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function attachGoalsAndCommentsCount(ideas) {
  if (ideas.length === 0) return ideas;
  const ideaIds = ideas.map((i) => i.id);

  const [goalsRes, commentsRes] = await Promise.all([
    query(
      'SELECT idea_id, sustainablegoal_id FROM ideas_idea_goals WHERE idea_id = ANY($1)',
      [ideaIds]
    ),
    query(
      'SELECT idea_id, COUNT(*)::int AS count FROM ideas_ideacomment WHERE idea_id = ANY($1) GROUP BY idea_id',
      [ideaIds]
    ),
  ]);

  const goalsMap = new Map();
  for (const g of goalsRes.rows) {
    if (!goalsMap.has(g.idea_id)) goalsMap.set(g.idea_id, []);
    goalsMap.get(g.idea_id).push(g.sustainablegoal_id);
  }

  const commentsMap = new Map();
  for (const c of commentsRes.rows) {
    commentsMap.set(c.idea_id, c.count);
  }

  return ideas.map((idea) => ({
    ...idea,
    goals: goalsMap.get(idea.id) || [],
    comments_count: commentsMap.get(idea.id) || 0,
  }));
}

export async function listIdeas(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';
    const ordering = req.query.ordering ? String(req.query.ordering).trim() : '-created_at';

    const conditions = [];
    const params = [];
    let idx = 1;

    // Permissions: student only sees own ideas
    if (req.user.role === 'student') {
      conditions.push(`i.owner_id = $${idx++}`);
      params.push(req.user.id);
    }

    if (search) {
      conditions.push(`(i.title ILIKE $${idx} OR i.description ILIKE $${idx} OR c.name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM ideas_idea i
      LEFT JOIN ideas_ideacategory c ON i.category_id = c.id
      ${whereClause}
    `;
    const countRes = await query(countQuery, params);
    const total = countRes.rows[0].count;

    let orderClause = 'ORDER BY i.created_at DESC';
    if (ordering === 'created_at') orderClause = 'ORDER BY i.created_at ASC';
    else if (ordering === '-created_at') orderClause = 'ORDER BY i.created_at DESC';
    else if (ordering === 'title') orderClause = 'ORDER BY i.title ASC';
    else if (ordering === '-title') orderClause = 'ORDER BY i.title DESC';
    else if (ordering === 'updated_at') orderClause = 'ORDER BY i.updated_at ASC';
    else if (ordering === '-updated_at') orderClause = 'ORDER BY i.updated_at DESC';

    const listQuery = `
      SELECT
        i.id, i.title, i.description, i.status, i.created_at, i.updated_at,
        i.category_id AS category, i.owner_id AS owner,
        u.username AS owner_username
      FROM ideas_idea i
      LEFT JOIN ideas_ideacategory c ON i.category_id = c.id
      JOIN accounts_user u ON i.owner_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    const ideasWithMeta = await attachGoalsAndCommentsCount(dataRes.rows);

    res.json(paginate(req, total, ideasWithMeta));
  } catch (err) {
    next(err);
  }
}

export async function createIdea(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Apenas alunos podem publicar ideias.');
    }

    const { title, description, category, goals = [] } = req.body;
    const errors = {};

    if (!title || !title.trim()) errors.title = ['Este campo é obrigatório.'];
    if (!description || !description.trim()) errors.description = ['Este campo é obrigatório.'];

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const created = await withTransaction(async (client) => {
      const now = new Date();
      const insertRes = await client.query(
        `INSERT INTO ideas_idea (title, description, category_id, owner_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'published', $5, $5)
         RETURNING id, title, description, category_id AS category, owner_id AS owner, status, created_at, updated_at`,
        [title.trim(), description.trim(), category || null, req.user.id, now]
      );
      const idea = insertRes.rows[0];

      if (Array.isArray(goals) && goals.length > 0) {
        for (const goalId of goals) {
          await client.query(
            'INSERT INTO ideas_idea_goals (idea_id, sustainablegoal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [idea.id, parseInt(goalId, 10)]
          );
        }
      }
      return idea;
    });

    const [enriched] = await attachGoalsAndCommentsCount([
      { ...created, owner_username: req.user.username },
    ]);
    res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function getIdea(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT i.id, i.title, i.description, i.status, i.created_at, i.updated_at,
              i.category_id AS category, i.owner_id AS owner, u.username AS owner_username
       FROM ideas_idea i
       JOIN accounts_user u ON i.owner_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    const idea = result.rows[0];
    if (!idea) throw new NotFoundError('Ideia não encontrada.');

    if (req.user.role === 'student' && idea.owner !== req.user.id) {
      throw new NotFoundError('Ideia não encontrada.');
    }

    const [enriched] = await attachGoalsAndCommentsCount([idea]);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function updateIdea(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM ideas_idea WHERE id = $1', [id]);
    const idea = existing.rows[0];
    if (!idea) throw new NotFoundError('Ideia não encontrada.');

    if (req.user.role !== 'administrator' && idea.owner_id !== req.user.id) {
      throw new PermissionError('Somente o autor ou administrador pode editar a ideia.');
    }

    const { title, description, category, goals } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (typeof title === 'string') {
      updates.push(`title = $${idx++}`);
      values.push(title.trim());
    }
    if (typeof description === 'string') {
      updates.push(`description = $${idx++}`);
      values.push(description.trim());
    }
    if (category !== undefined) {
      updates.push(`category_id = $${idx++}`);
      values.push(category || null);
    }

    updates.push(`updated_at = $${idx++}`);
    values.push(new Date());

    values.push(id);
    await query(`UPDATE ideas_idea SET ${updates.join(', ')} WHERE id = $${idx}`, values);

    if (Array.isArray(goals)) {
      await query('DELETE FROM ideas_idea_goals WHERE idea_id = $1', [id]);
      for (const goalId of goals) {
        await query(
          'INSERT INTO ideas_idea_goals (idea_id, sustainablegoal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, parseInt(goalId, 10)]
        );
      }
    }

    const updatedRes = await query(
      `SELECT i.id, i.title, i.description, i.status, i.created_at, i.updated_at,
              i.category_id AS category, i.owner_id AS owner, u.username AS owner_username
       FROM ideas_idea i
       JOIN accounts_user u ON i.owner_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    const [enriched] = await attachGoalsAndCommentsCount(updatedRes.rows);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function deleteIdea(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM ideas_idea WHERE id = $1', [id]);
    const idea = existing.rows[0];
    if (!idea) throw new NotFoundError('Ideia não encontrada.');

    if (req.user.role !== 'administrator' && idea.owner_id !== req.user.id) {
      throw new NotFoundError('Ideia não encontrada.');
    }

    await query('DELETE FROM ideas_idea WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function moderateIdea(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { status: newStatus } = req.body;
    const allowed = ['approved', 'needs_revision', 'archived'];

    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        status: ['Escolha um status de moderação válido.'],
      });
    }

    const updated = await query(
      `UPDATE ideas_idea SET status = $1, updated_at = $2 WHERE id = $3
       RETURNING id, title, description, category_id AS category, owner_id AS owner, status, created_at, updated_at`,
      [newStatus, new Date(), id]
    );

    if (updated.rows.length === 0) throw new NotFoundError('Ideia não encontrada.');

    const userRes = await query('SELECT username FROM accounts_user WHERE id = $1', [updated.rows[0].owner]);
    const [enriched] = await attachGoalsAndCommentsCount([
      { ...updated.rows[0], owner_username: userRes.rows[0]?.username },
    ]);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function listIdeaComments(req, res, next) {
  try {
    const ideaId = parseInt(req.params.ideaId, 10);
    const ideaRes = await query('SELECT id, owner_id, status FROM ideas_idea WHERE id = $1', [ideaId]);
    const idea = ideaRes.rows[0];

    if (!idea || (req.user.role === 'student' && idea.owner_id !== req.user.id)) {
      return res.status(404).json({ detail: 'Ideia não encontrada.' });
    }

    const commentsRes = await query(
      `SELECT c.id, c.idea_id AS idea, c.body, c.created_at, c.author_id AS author, u.username AS author_username
       FROM ideas_ideacomment c
       JOIN accounts_user u ON c.author_id = u.id
       WHERE c.idea_id = $1
       ORDER BY c.created_at ASC`,
      [ideaId]
    );

    res.json(commentsRes.rows);
  } catch (err) {
    next(err);
  }
}

export async function createIdeaComment(req, res, next) {
  try {
    const ideaId = parseInt(req.params.ideaId, 10);
    const ideaRes = await query('SELECT id, owner_id, status FROM ideas_idea WHERE id = $1', [ideaId]);
    const idea = ideaRes.rows[0];

    if (!idea || (req.user.role === 'student' && idea.owner_id !== req.user.id)) {
      return res.status(404).json({ detail: 'Ideia não encontrada.' });
    }

    if (!['published', 'approved'].includes(idea.status)) {
      return res.status(404).json({ detail: 'Esta ideia ainda não está disponível para comentários.' });
    }

    const { body } = req.body;
    if (!body || !body.trim()) {
      throw new ValidationError('O comentário não pode estar vazio.', { body: ['Este campo é obrigatório.'] });
    }

    const insertRes = await query(
      `INSERT INTO ideas_ideacomment (idea_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, idea_id AS idea, body, author_id AS author, created_at`,
      [ideaId, req.user.id, body.trim(), new Date()]
    );

    res.status(201).json({
      ...insertRes.rows[0],
      author_username: req.user.username,
    });
  } catch (err) {
    next(err);
  }
}

