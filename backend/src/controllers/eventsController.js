import { query } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

export async function listEvents(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';
    const ordering = req.query.ordering ? String(req.query.ordering).trim() : 'starts_at';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push('e.is_published = true');
    } else if (req.user.role === 'teacher') {
      conditions.push(`(e.is_published = true OR e.owner_id = $${idx++})`);
      params.push(req.user.id);
    } // admin sees all

    if (search) {
      conditions.push(`(e.title ILIKE $${idx} OR e.description ILIKE $${idx} OR e.location ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS count FROM events_event e ${whereClause}`, params);
    const total = countRes.rows[0].count;

    let orderClause = 'ORDER BY e.starts_at ASC';
    if (ordering === 'starts_at') orderClause = 'ORDER BY e.starts_at ASC';
    else if (ordering === '-starts_at') orderClause = 'ORDER BY e.starts_at DESC';
    else if (ordering === 'title') orderClause = 'ORDER BY e.title ASC';
    else if (ordering === '-title') orderClause = 'ORDER BY e.title DESC';

    const listQuery = `
      SELECT
        e.id, e.title, e.description, e.location, e.starts_at, e.ends_at, e.is_published,
        e.owner_id AS owner, u.username AS owner_username,
        (SELECT COUNT(*)::int FROM events_eventregistration r WHERE r.event_id = e.id) AS registrations_count
      FROM events_event e
      JOIN accounts_user u ON e.owner_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    res.json(paginate(req, total, dataRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    const { title, description, location = '', starts_at, ends_at, is_published = false } = req.body;
    const errors = {};

    if (!title || !title.trim()) errors.title = ['Este campo é obrigatório.'];
    if (!description || !description.trim()) errors.description = ['Este campo é obrigatório.'];
    if (!starts_at) errors.starts_at = ['Este campo é obrigatório.'];
    if (!ends_at) errors.ends_at = ['Este campo é obrigatório.'];

    if (starts_at && ends_at) {
      const s = new Date(starts_at).getTime();
      const e = new Date(ends_at).getTime();
      if (e <= s) {
        errors.ends_at = ['O término deve ser posterior ao início.'];
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const result = await query(
      `INSERT INTO events_event (title, description, location, starts_at, ends_at, is_published, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, description, location, starts_at, ends_at, is_published, owner_id AS owner`,
      [title.trim(), description.trim(), String(location || '').trim(), new Date(starts_at), new Date(ends_at), Boolean(is_published), req.user.id]
    );

    res.status(201).json({
      ...result.rows[0],
      owner_username: req.user.username,
      registrations_count: 0,
    });
  } catch (err) {
    next(err);
  }
}

export async function getEvent(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT
        e.id, e.title, e.description, e.location, e.starts_at, e.ends_at, e.is_published,
        e.owner_id AS owner, u.username AS owner_username,
        (SELECT COUNT(*)::int FROM events_eventregistration r WHERE r.event_id = e.id) AS registrations_count
      FROM events_event e
      JOIN accounts_user u ON e.owner_id = u.id
      WHERE e.id = $1`,
      [id]
    );

    const event = result.rows[0];
    if (!event) throw new NotFoundError('Evento não encontrado.');

    if (req.user.role === 'student' && !event.is_published) {
      throw new NotFoundError('Evento não encontrado.');
    }

    res.json(event);
  } catch (err) {
    next(err);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id, starts_at, ends_at FROM events_event WHERE id = $1', [id]);
    const event = existing.rows[0];
    if (!event) throw new NotFoundError('Evento não encontrado.');

    if (req.user.role !== 'administrator' && event.owner_id !== req.user.id) {
      throw new PermissionError('Somente a pessoa responsável pode alterar o evento.');
    }

    const { title, description, location, starts_at, ends_at, is_published } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    const s = starts_at ? new Date(starts_at) : event.starts_at;
    const e = ends_at ? new Date(ends_at) : event.ends_at;
    if (e <= s) {
      throw new ValidationError('Os dados enviados são inválidos.', { ends_at: ['O término deve ser posterior ao início.'] });
    }

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
    if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location.trim()); }
    if (starts_at !== undefined) { updates.push(`starts_at = $${idx++}`); values.push(new Date(starts_at)); }
    if (ends_at !== undefined) { updates.push(`ends_at = $${idx++}`); values.push(new Date(ends_at)); }
    if (is_published !== undefined) { updates.push(`is_published = $${idx++}`); values.push(Boolean(is_published)); }

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE events_event SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    const updatedRes = await query(
      `SELECT
        e.id, e.title, e.description, e.location, e.starts_at, e.ends_at, e.is_published,
        e.owner_id AS owner, u.username AS owner_username,
        (SELECT COUNT(*)::int FROM events_eventregistration r WHERE r.event_id = e.id) AS registrations_count
      FROM events_event e
      JOIN accounts_user u ON e.owner_id = u.id
      WHERE e.id = $1`,
      [id]
    );

    res.json(updatedRes.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteEvent(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM events_event WHERE id = $1', [id]);
    const event = existing.rows[0];
    if (!event) throw new NotFoundError('Evento não encontrado.');

    if (req.user.role !== 'administrator' && event.owner_id !== req.user.id) {
      throw new PermissionError('Somente a pessoa responsável pode remover o evento.');
    }

    await query('DELETE FROM events_event WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Event Registrations
export async function listEventRegistrations(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const countRes = await query(
      'SELECT COUNT(*)::int AS count FROM events_eventregistration WHERE student_id = $1',
      [req.user.id]
    );
    const total = countRes.rows[0].count;

    const listRes = await query(
      `SELECT er.id, er.event_id AS event, e.title AS event_title, er.student_id AS student, er.registered_at
       FROM events_eventregistration er
       JOIN events_event e ON er.event_id = e.id
       WHERE er.student_id = $1
       ORDER BY er.registered_at DESC, er.id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    res.json(paginate(req, total, listRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function createEventRegistration(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Somente alunos podem se inscrever em eventos.');
    }

    const { event: eventId } = req.body;
    if (!eventId) {
      throw new ValidationError('Os dados enviados são inválidos.', { event: ['Este campo é obrigatório.'] });
    }

    const evRes = await query('SELECT id, title, ends_at, is_published FROM events_event WHERE id = $1', [parseInt(eventId, 10)]);
    const event = evRes.rows[0];
    if (!event) throw new NotFoundError('Evento não encontrado.');

    if (!event.is_published || new Date(event.ends_at) <= new Date()) {
      throw new ValidationError('As inscrições para este evento não estão abertas.');
    }

    const existing = await query(
      'SELECT id, event_id AS event, student_id AS student, registered_at FROM events_eventregistration WHERE event_id = $1 AND student_id = $2',
      [event.id, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        ...existing.rows[0],
        event_title: event.title,
      });
    }

    const insertRes = await query(
      `INSERT INTO events_eventregistration (event_id, student_id, registered_at)
       VALUES ($1, $2, $3)
       RETURNING id, event_id AS event, student_id AS student, registered_at`,
      [event.id, req.user.id, new Date()]
    );

    res.status(201).json({
      ...insertRes.rows[0],
      event_title: event.title,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteEventRegistration(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query(
      'SELECT id FROM events_eventregistration WHERE id = $1 AND student_id = $2',
      [id, req.user.id]
    );

    if (existing.rows.length === 0) throw new NotFoundError('Inscrição não encontrada.');

    await query('DELETE FROM events_eventregistration WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

