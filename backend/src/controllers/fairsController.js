import { query } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

export async function listFairs(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push('f.is_published = true');
    } else if (req.user.role === 'teacher') {
      conditions.push(`(f.is_published = true OR f.owner_id = $${idx++})`);
      params.push(req.user.id);
    } // admin sees all

    if (search) {
      conditions.push(`(f.title ILIKE $${idx} OR f.description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS count FROM fairs_projectfair f ${whereClause}`, params);
    const total = countRes.rows[0].count;

    const listQuery = `
      SELECT f.id, f.title, f.description, f.starts_at, f.ends_at, f.is_published,
             f.owner_id AS owner, u.username AS owner_username
      FROM fairs_projectfair f
      JOIN accounts_user u ON f.owner_id = u.id
      ${whereClause}
      ORDER BY f.starts_at ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    res.json(paginate(req, total, dataRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function createFair(req, res, next) {
  try {
    const { title, description, starts_at, ends_at, is_published = false } = req.body;
    const errors = {};

    if (!title || !title.trim()) errors.title = ['Este campo é obrigatório.'];
    if (!description || !description.trim()) errors.description = ['Este campo é obrigatório.'];
    if (!starts_at) errors.starts_at = ['Este campo é obrigatório.'];
    if (!ends_at) errors.ends_at = ['Este campo é obrigatório.'];

    if (starts_at && ends_at) {
      const s = new Date(starts_at).getTime();
      const e = new Date(ends_at).getTime();
      if (e <= s) {
        errors.ends_at = ['O encerramento deve ser posterior ao início.'];
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const result = await query(
      `INSERT INTO fairs_projectfair (title, description, starts_at, ends_at, is_published, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, starts_at, ends_at, is_published, owner_id AS owner`,
      [title.trim(), description.trim(), new Date(starts_at), new Date(ends_at), Boolean(is_published), req.user.id]
    );

    res.status(201).json({
      ...result.rows[0],
      owner_username: req.user.username,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFair(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT f.id, f.title, f.description, f.starts_at, f.ends_at, f.is_published,
              f.owner_id AS owner, u.username AS owner_username
       FROM fairs_projectfair f
       JOIN accounts_user u ON f.owner_id = u.id
       WHERE f.id = $1`,
      [id]
    );

    const fair = result.rows[0];
    if (!fair) throw new NotFoundError('Feira não encontrada.');

    if (req.user.role === 'student' && !fair.is_published) {
      throw new NotFoundError('Feira não encontrada.');
    }

    res.json(fair);
  } catch (err) {
    next(err);
  }
}

export async function updateFair(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id, starts_at, ends_at FROM fairs_projectfair WHERE id = $1', [id]);
    const fair = existing.rows[0];
    if (!fair) throw new NotFoundError('Feira não encontrada.');

    if (req.user.role !== 'administrator' && fair.owner_id !== req.user.id) {
      throw new PermissionError('Somente a organização da feira pode alterá-la.');
    }

    const { title, description, starts_at, ends_at, is_published } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    const s = starts_at ? new Date(starts_at) : fair.starts_at;
    const e = ends_at ? new Date(ends_at) : fair.ends_at;
    if (e <= s) {
      throw new ValidationError('Os dados enviados são inválidos.', { ends_at: ['O encerramento deve ser posterior ao início.'] });
    }

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
    if (starts_at !== undefined) { updates.push(`starts_at = $${idx++}`); values.push(new Date(starts_at)); }
    if (ends_at !== undefined) { updates.push(`ends_at = $${idx++}`); values.push(new Date(ends_at)); }
    if (is_published !== undefined) { updates.push(`is_published = $${idx++}`); values.push(Boolean(is_published)); }

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE fairs_projectfair SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    const updatedRes = await query(
      `SELECT f.id, f.title, f.description, f.starts_at, f.ends_at, f.is_published,
              f.owner_id AS owner, u.username AS owner_username
       FROM fairs_projectfair f
       JOIN accounts_user u ON f.owner_id = u.id
       WHERE f.id = $1`,
      [id]
    );

    res.json(updatedRes.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteFair(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM fairs_projectfair WHERE id = $1', [id]);
    const fair = existing.rows[0];
    if (!fair) throw new NotFoundError('Feira não encontrada.');

    if (req.user.role !== 'administrator' && fair.owner_id !== req.user.id) {
      throw new PermissionError('Somente a organização da feira pode removê-la.');
    }

    await query('DELETE FROM fairs_projectfair WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Fair Entries
export async function listFairEntries(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'administrator') {
      // All
    } else if (req.user.role === 'teacher') {
      conditions.push(`f.owner_id = $${idx++}`);
      params.push(req.user.id);
    } else {
      conditions.push(`fe.submitted_by_id = $${idx++}`);
      params.push(req.user.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::int AS count
       FROM fairs_fairentry fe
       JOIN fairs_projectfair f ON fe.fair_id = f.id
       ${whereClause}`,
      params
    );
    const total = countRes.rows[0].count;

    const listQuery = `
      SELECT
        fe.id, fe.fair_id AS fair, fe.project_id AS project, p.title AS project_title,
        fe.submitted_by_id AS submitted_by, u.username AS submitter_username,
        fe.status, fe.submitted_at
      FROM fairs_fairentry fe
      JOIN fairs_projectfair f ON fe.fair_id = f.id
      JOIN projects_project p ON fe.project_id = p.id
      JOIN accounts_user u ON fe.submitted_by_id = u.id
      ${whereClause}
      ORDER BY fe.submitted_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    res.json(paginate(req, total, dataRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function createFairEntry(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Somente alunos podem inscrever projetos.');
    }

    const { fair: fairId, project: projectId } = req.body;
    if (!fairId || !projectId) {
      throw new ValidationError('Os dados enviados são inválidos.');
    }

    const [fairRes, projRes] = await Promise.all([
      query('SELECT id, title, starts_at, ends_at, is_published, owner_id FROM fairs_projectfair WHERE id = $1', [parseInt(fairId, 10)]),
      query('SELECT id, title, owner_id FROM projects_project WHERE id = $1', [parseInt(projectId, 10)]),
    ]);

    const fair = fairRes.rows[0];
    const project = projRes.rows[0];

    if (!fair) throw new NotFoundError('Feira não encontrada.');
    if (!project) throw new NotFoundError('Projeto não encontrado.');

    if (project.owner_id !== req.user.id) {
      throw new ValidationError('Só é possível inscrever seu próprio projeto.', {
        project: ['Só é possível inscrever seu próprio projeto.'],
      });
    }

    const now = new Date();
    if (!fair.is_published || new Date(fair.starts_at) > now || new Date(fair.ends_at) < now) {
      throw new ValidationError('As inscrições desta feira não estão abertas.', {
        fair: ['As inscrições desta feira não estão abertas.'],
      });
    }

    const existing = await query('SELECT id FROM fairs_fairentry WHERE fair_id = $1 AND project_id = $2', [fair.id, project.id]);
    if (existing.rows.length > 0) {
      throw new ValidationError('Este projeto já está inscrito nesta feira.');
    }

    const insertRes = await query(
      `INSERT INTO fairs_fairentry (fair_id, project_id, submitted_by_id, status, submitted_at)
       VALUES ($1, $2, $3, 'submitted', $4)
       RETURNING id, fair_id AS fair, project_id AS project, submitted_by_id AS submitted_by, status, submitted_at`,
      [fair.id, project.id, req.user.id, now]
    );

    await query(
      `INSERT INTO notifications_notification (recipient_id, title, message, url, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        fair.owner_id,
        'Nova inscrição na feira',
        `Um projeto foi inscrito em “${fair.title}”.`,
        '/feira',
        now,
      ]
    );

    res.status(201).json({
      ...insertRes.rows[0],
      project_title: project.title,
      submitter_username: req.user.username,
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectDirectFairEntryUpdate(req, res, next) {
  return next(new PermissionError('Uma inscrição não pode ser alterada pelo participante.'));
}

export async function reviewFairEntry(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const entryRes = await query(
      `SELECT fe.id, fe.status, fe.submitted_by_id, fe.project_id, f.owner_id AS fair_owner_id, p.title AS project_title
       FROM fairs_fairentry fe
       JOIN fairs_projectfair f ON fe.fair_id = f.id
       JOIN projects_project p ON fe.project_id = p.id
       WHERE fe.id = $1`,
      [id]
    );
    const entry = entryRes.rows[0];
    if (!entry) throw new NotFoundError('Inscrição não encontrada.');

    if (req.user.role !== 'administrator' && entry.fair_owner_id !== req.user.id) {
      throw new PermissionError('Somente a organização da feira pode avaliar inscrições.');
    }

    const { status: newStatus } = req.body;
    if (!['selected', 'not_selected'].includes(newStatus)) {
      return res.status(400).json({ status: ['Escolha um resultado válido.'] });
    }

    const now = new Date();
    const updated = await query(
      `UPDATE fairs_fairentry SET status = $1 WHERE id = $2
       RETURNING id, fair_id AS fair, project_id AS project, submitted_by_id AS submitted_by, status, submitted_at`,
      [newStatus, id]
    );

    await query(
      `INSERT INTO notifications_notification (recipient_id, title, message, url, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.submitted_by_id,
        'Resultado da feira',
        `A inscrição do projeto “${entry.project_title}” foi atualizada.`,
        '/feira',
        now,
      ]
    );

    const userRes = await query('SELECT username FROM accounts_user WHERE id = $1', [entry.submitted_by_id]);
    res.json({
      ...updated.rows[0],
      project_title: entry.project_title,
      submitter_username: userRes.rows[0]?.username,
    });
  } catch (err) {
    next(err);
  }
}

