import { query, withTransaction } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

export async function listChallenges(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';
    const ordering = req.query.ordering ? String(req.query.ordering).trim() : 'deadline';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push('c.is_published = true');
    } else if (req.user.role === 'teacher') {
      conditions.push(`(c.is_published = true OR c.owner_id = $${idx++})`);
      params.push(req.user.id);
    } // admin sees all

    if (search) {
      conditions.push(`(c.title ILIKE $${idx} OR c.description ILIKE $${idx} OR c.rules ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS count FROM challenges_challenge c ${whereClause}`, params);
    const total = countRes.rows[0].count;

    let orderClause = 'ORDER BY c.deadline ASC';
    if (ordering === 'deadline') orderClause = 'ORDER BY c.deadline ASC';
    else if (ordering === '-deadline') orderClause = 'ORDER BY c.deadline DESC';
    else if (ordering === 'starts_at') orderClause = 'ORDER BY c.starts_at ASC';
    else if (ordering === '-starts_at') orderClause = 'ORDER BY c.starts_at DESC';
    else if (ordering === 'title') orderClause = 'ORDER BY c.title ASC';
    else if (ordering === '-title') orderClause = 'ORDER BY c.title DESC';

    const listQuery = `
      SELECT
        c.id, c.title, c.description, c.rules, c.goal_id AS goal,
        c.starts_at, c.deadline, c.is_published, c.created_at,
        c.owner_id AS owner, u.username AS owner_username,
        (SELECT COUNT(*)::int FROM challenges_challengesubmission s WHERE s.challenge_id = c.id) AS submissions_count
      FROM challenges_challenge c
      JOIN accounts_user u ON c.owner_id = u.id
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

export async function createChallenge(req, res, next) {
  try {
    const { title, description, rules, goal, starts_at, deadline, is_published = false } = req.body;
    const errors = {};

    if (!title || !title.trim()) errors.title = ['Este campo é obrigatório.'];
    if (!description || !description.trim()) errors.description = ['Este campo é obrigatório.'];
    if (!rules || !rules.trim()) errors.rules = ['Este campo é obrigatório.'];
    if (!starts_at) errors.starts_at = ['Este campo é obrigatório.'];
    if (!deadline) errors.deadline = ['Este campo é obrigatório.'];

    if (starts_at && deadline) {
      const s = new Date(starts_at).getTime();
      const d = new Date(deadline).getTime();
      if (d <= s) {
        errors.deadline = ['O prazo deve ser posterior ao início.'];
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const result = await query(
      `INSERT INTO challenges_challenge (
        title, description, rules, goal_id, starts_at, deadline,
        is_published, owner_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, title, description, rules, goal_id AS goal, starts_at, deadline, is_published, created_at, owner_id AS owner`,
      [
        title.trim(),
        description.trim(),
        rules.trim(),
        goal ? parseInt(goal, 10) : null,
        new Date(starts_at),
        new Date(deadline),
        Boolean(is_published),
        req.user.id,
        new Date(),
      ]
    );

    res.status(201).json({
      ...result.rows[0],
      owner_username: req.user.username,
      submissions_count: 0,
    });
  } catch (err) {
    next(err);
  }
}

export async function getChallenge(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT
        c.id, c.title, c.description, c.rules, c.goal_id AS goal,
        c.starts_at, c.deadline, c.is_published, c.created_at,
        c.owner_id AS owner, u.username AS owner_username,
        (SELECT COUNT(*)::int FROM challenges_challengesubmission s WHERE s.challenge_id = c.id) AS submissions_count
      FROM challenges_challenge c
      JOIN accounts_user u ON c.owner_id = u.id
      WHERE c.id = $1`,
      [id]
    );

    const challenge = result.rows[0];
    if (!challenge) throw new NotFoundError('Desafio não encontrado.');

    if (req.user.role === 'student' && !challenge.is_published) {
      throw new NotFoundError('Desafio não encontrado.');
    }

    res.json(challenge);
  } catch (err) {
    next(err);
  }
}

export async function updateChallenge(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id, starts_at, deadline FROM challenges_challenge WHERE id = $1', [id]);
    const challenge = existing.rows[0];
    if (!challenge) throw new NotFoundError('Desafio não encontrado.');

    if (req.user.role !== 'administrator' && challenge.owner_id !== req.user.id) {
      throw new PermissionError('Somente o responsável pelo desafio pode alterá-lo.');
    }

    const { title, description, rules, goal, starts_at, deadline, is_published } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    const s = starts_at ? new Date(starts_at) : challenge.starts_at;
    const d = deadline ? new Date(deadline) : challenge.deadline;
    if (d <= s) {
      throw new ValidationError('Os dados enviados são inválidos.', { deadline: ['O prazo deve ser posterior ao início.'] });
    }

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
    if (rules !== undefined) { updates.push(`rules = $${idx++}`); values.push(rules.trim()); }
    if (goal !== undefined) { updates.push(`goal_id = $${idx++}`); values.push(goal ? parseInt(goal, 10) : null); }
    if (starts_at !== undefined) { updates.push(`starts_at = $${idx++}`); values.push(new Date(starts_at)); }
    if (deadline !== undefined) { updates.push(`deadline = $${idx++}`); values.push(new Date(deadline)); }
    if (is_published !== undefined) { updates.push(`is_published = $${idx++}`); values.push(Boolean(is_published)); }

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE challenges_challenge SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    const updatedRes = await query(
      `SELECT
        c.id, c.title, c.description, c.rules, c.goal_id AS goal,
        c.starts_at, c.deadline, c.is_published, c.created_at,
        c.owner_id AS owner, u.username AS owner_username,
        (SELECT COUNT(*)::int FROM challenges_challengesubmission s WHERE s.challenge_id = c.id) AS submissions_count
      FROM challenges_challenge c
      JOIN accounts_user u ON c.owner_id = u.id
      WHERE c.id = $1`,
      [id]
    );

    res.json(updatedRes.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteChallenge(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM challenges_challenge WHERE id = $1', [id]);
    const challenge = existing.rows[0];
    if (!challenge) throw new NotFoundError('Desafio não encontrado.');

    if (req.user.role !== 'administrator' && challenge.owner_id !== req.user.id) {
      throw new PermissionError('Somente o responsável pelo desafio pode removê-lo.');
    }

    await query('DELETE FROM challenges_challenge WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Submissions
export async function listSubmissions(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'administrator') {
      // All
    } else if (req.user.role === 'teacher') {
      conditions.push(`c.owner_id = $${idx++}`);
      params.push(req.user.id);
    } else {
      conditions.push(`s.student_id = $${idx++}`);
      params.push(req.user.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::int AS count
       FROM challenges_challengesubmission s
       JOIN challenges_challenge c ON s.challenge_id = c.id
       ${whereClause}`,
      params
    );
    const total = countRes.rows[0].count;

    const listQuery = `
      SELECT
        s.id, s.challenge_id AS challenge, c.title AS challenge_title,
        s.student_id AS student, u.username AS student_username,
        s.response, s.status, s.feedback, s.score,
        s.submitted_at, s.reviewed_at
      FROM challenges_challengesubmission s
      JOIN challenges_challenge c ON s.challenge_id = c.id
      JOIN accounts_user u ON s.student_id = u.id
      ${whereClause}
      ORDER BY s.submitted_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    res.json(paginate(req, total, dataRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function createSubmission(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Somente alunos podem participar de desafios.');
    }

    const { challenge: challengeId, response } = req.body;
    if (!challengeId || !response || !String(response).trim()) {
      throw new ValidationError('Os dados enviados são inválidos.', {
        response: ['Este campo é obrigatório.'],
      });
    }

    const cRes = await query(
      'SELECT id, title, starts_at, deadline, is_published FROM challenges_challenge WHERE id = $1',
      [parseInt(challengeId, 10)]
    );
    const challenge = cRes.rows[0];
    if (!challenge) throw new NotFoundError('Desafio não encontrado.');

    const now = new Date();
    if (!challenge.is_published || new Date(challenge.starts_at) > now) {
      throw new ValidationError('Este desafio ainda não está aberto.');
    }
    if (new Date(challenge.deadline) <= now) {
      throw new ValidationError('O prazo deste desafio terminou.');
    }

    const existing = await query(
      'SELECT id FROM challenges_challengesubmission WHERE challenge_id = $1 AND student_id = $2',
      [challenge.id, req.user.id]
    );
    if (existing.rows.length > 0) {
      throw new ValidationError('Você já enviou uma participação para este desafio.');
    }

    const insertRes = await query(
      `INSERT INTO challenges_challengesubmission (
        challenge_id, student_id, response, status, feedback, score, submitted_at
      ) VALUES ($1, $2, $3, 'submitted', '', NULL, $4)
      RETURNING id, challenge_id AS challenge, student_id AS student, response, status, feedback, score, submitted_at, reviewed_at`,
      [challenge.id, req.user.id, String(response).trim(), now]
    );

    res.status(201).json({
      ...insertRes.rows[0],
      challenge_title: challenge.title,
      student_username: req.user.username,
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectDirectSubmissionUpdate(req, res, next) {
  return next(new PermissionError('A entrega só pode ser alterada pelo fluxo de avaliação.'));
}

export async function reviewSubmission(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const subRes = await query(
      `SELECT s.id, s.status, s.challenge_id, s.student_id, c.owner_id AS challenge_owner_id, c.title AS challenge_title
       FROM challenges_challengesubmission s
       JOIN challenges_challenge c ON s.challenge_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    const submission = subRes.rows[0];
    if (!submission) throw new NotFoundError('Entrega não encontrada.');

    if (req.user.role !== 'administrator' && submission.challenge_owner_id !== req.user.id) {
      throw new PermissionError('Somente o responsável pelo desafio pode avaliar esta entrega.');
    }

    const { status: newStatus, feedback = '', score = null } = req.body;
    const allowed = ['submitted', 'accepted', 'needs_revision'];
    if (newStatus && !allowed.includes(newStatus)) {
      throw new ValidationError('Status de avaliação inválido.');
    }

    let parsedScore = score !== null && score !== undefined ? parseInt(score, 10) : null;
    if (parsedScore !== null && (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100)) {
      throw new ValidationError('A nota deve estar entre 0 e 100.', { score: ['A nota deve estar entre 0 e 100.'] });
    }

    const previousStatus = submission.status;
    const now = new Date();

    const updated = await withTransaction(async (client) => {
      const updateRes = await client.query(
        `UPDATE challenges_challengesubmission
         SET status = COALESCE($1, status), feedback = $2, score = $3, reviewed_at = $4
         WHERE id = $5
         RETURNING id, challenge_id AS challenge, student_id AS student, response, status, feedback, score, submitted_at, reviewed_at`,
        [newStatus || null, String(feedback || ''), parsedScore, now, id]
      );
      const sub = updateRes.rows[0];

      if (sub.status === 'accepted' && previousStatus !== 'accepted') {
        const sourceKey = `challenge-submission:${sub.id}`;
        await client.query(
          `INSERT INTO ranking_pointaward (user_id, points, reason, source_key, created_at)
           VALUES ($1, 10, $2, $3, $4)
           ON CONFLICT (source_key) DO NOTHING`,
          [sub.student, `Desafio concluído: ${submission.challenge_title}`, sourceKey, now]
        );

        await client.query(
          `INSERT INTO notifications_notification (recipient_id, title, message, url, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sub.student,
            'Entrega aprovada',
            `Sua participação em “${submission.challenge_title}” foi aprovada. Você recebeu 10 pontos.`,
            '/ranking',
            now,
          ]
        );
      }

      return sub;
    });

    const userRes = await query('SELECT username FROM accounts_user WHERE id = $1', [updated.student]);
    res.json({
      ...updated,
      challenge_title: submission.challenge_title,
      student_username: userRes.rows[0]?.username,
    });
  } catch (err) {
    next(err);
  }
}

