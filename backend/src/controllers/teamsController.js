import { query, withTransaction } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { ApiError, ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

async function attachActiveMembers(teams) {
  if (teams.length === 0) return teams;
  const teamIds = teams.map((t) => t.id);

  const res = await query(
    `SELECT tm.team_id, u.username
     FROM teams_teammembership tm
     JOIN accounts_user u ON tm.user_id = u.id
     WHERE tm.team_id = ANY($1) AND tm.status = 'active'`,
    [teamIds]
  );

  const map = new Map();
  for (const row of res.rows) {
    if (!map.has(row.team_id)) map.set(row.team_id, []);
    map.get(row.team_id).push(row.username);
  }

  return teams.map((t) => ({
    ...t,
    active_members: map.get(t.id) || [],
  }));
}

export async function listTeams(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push(`t.id IN (SELECT team_id FROM teams_teammembership WHERE user_id = $${idx++})`);
      params.push(req.user.id);
    }

    if (search) {
      conditions.push(`(t.name ILIKE $${idx} OR t.description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS count FROM teams_team t ${whereClause}`, params);
    const total = countRes.rows[0].count;

    const listQuery = `
      SELECT t.id, t.name, t.description, t.created_at, t.owner_id AS owner, u.username AS owner_username
      FROM teams_team t
      JOIN accounts_user u ON t.owner_id = u.id
      ${whereClause}
      ORDER BY t.name ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    const withMembers = await attachActiveMembers(dataRes.rows);

    res.json(paginate(req, total, withMembers));
  } catch (err) {
    next(err);
  }
}

export async function createTeam(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Somente alunos podem criar equipes.');
    }

    const { name, description = '' } = req.body;
    if (!name || !name.trim()) {
      throw new ValidationError('O nome da equipe é obrigatório.', { name: ['Este campo é obrigatório.'] });
    }

    const team = await withTransaction(async (client) => {
      const now = new Date();
      const insertRes = await client.query(
        `INSERT INTO teams_team (name, description, owner_id, created_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, owner_id AS owner, created_at`,
        [name.trim(), String(description || '').trim(), req.user.id, now]
      );
      const newTeam = insertRes.rows[0];

      await client.query(
        `INSERT INTO teams_teammembership (team_id, user_id, status, joined_at)
         VALUES ($1, $2, 'active', $3)`,
        [newTeam.id, req.user.id, now]
      );

      return newTeam;
    });

    res.status(201).json({
      ...team,
      owner_username: req.user.username,
      active_members: [req.user.username],
    });
  } catch (err) {
    next(err);
  }
}

export async function getTeam(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT t.id, t.name, t.description, t.created_at, t.owner_id AS owner, u.username AS owner_username
       FROM teams_team t
       JOIN accounts_user u ON t.owner_id = u.id
       WHERE t.id = $1`,
      [id]
    );

    const team = result.rows[0];
    if (!team) throw new NotFoundError('Equipe não encontrada.');

    if (req.user.role === 'student') {
      const isMember = await query(
        'SELECT 1 FROM teams_teammembership WHERE team_id = $1 AND user_id = $2',
        [id, req.user.id]
      );
      if (isMember.rows.length === 0) throw new NotFoundError('Equipe não encontrada.');
    }

    const [enriched] = await attachActiveMembers([team]);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function updateTeam(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM teams_team WHERE id = $1', [id]);
    const team = existing.rows[0];
    if (!team) throw new NotFoundError('Equipe não encontrada.');

    if (req.user.role !== 'administrator' && team.owner_id !== req.user.id) {
      throw new PermissionError('Somente a liderança da equipe pode alterá-la.');
    }

    const { name, description } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE teams_team SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    const updatedRes = await query(
      `SELECT t.id, t.name, t.description, t.created_at, t.owner_id AS owner, u.username AS owner_username
       FROM teams_team t
       JOIN accounts_user u ON t.owner_id = u.id
       WHERE t.id = $1`,
      [id]
    );

    const [enriched] = await attachActiveMembers(updatedRes.rows);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function deleteTeam(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id FROM teams_team WHERE id = $1', [id]);
    const team = existing.rows[0];
    if (!team) throw new NotFoundError('Equipe não encontrada.');

    if (req.user.role !== 'administrator' && team.owner_id !== req.user.id) {
      throw new PermissionError('Somente a liderança da equipe pode encerrá-la.');
    }

    await query('DELETE FROM teams_team WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function inviteMember(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, name, owner_id FROM teams_team WHERE id = $1', [id]);
    const team = existing.rows[0];
    if (!team) throw new NotFoundError('Equipe não encontrada.');

    if (req.user.role !== 'administrator' && team.owner_id !== req.user.id) {
      throw new NotFoundError('Equipe não encontrada.');
    }

    const { username } = req.body;
    if (!username || !String(username).trim()) {
      throw new ValidationError('O nome de usuário é obrigatório.', { username: ['Este campo é obrigatório.'] });
    }

    const targetUserRes = await query(
      'SELECT id, username, role FROM accounts_user WHERE LOWER(username) = LOWER($1)',
      [String(username).trim()]
    );
    const targetUser = targetUserRes.rows[0];
    if (!targetUser) {
      throw new ValidationError('Não encontramos esse usuário.', { username: ['Não encontramos esse usuário.'] });
    }
    if (targetUser.role !== 'student') {
      throw new ValidationError('Somente alunos podem participar de equipes.', {
        username: ['Somente alunos podem participar de equipes.'],
      });
    }

    const checkRes = await query(
      'SELECT id FROM teams_teammembership WHERE team_id = $1 AND user_id = $2',
      [id, targetUser.id]
    );
    if (checkRes.rows.length > 0) {
      return res.status(409).json({ detail: 'Esse aluno já foi convidado ou participa da equipe.' });
    }

    const now = new Date();
    const insertRes = await query(
      `INSERT INTO teams_teammembership (team_id, user_id, status, joined_at)
       VALUES ($1, $2, 'invited', $3)
       RETURNING id, team_id AS team, user_id AS user, status, joined_at`,
      [id, targetUser.id, now]
    );

    await query(
      `INSERT INTO notifications_notification (recipient_id, title, message, url, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        targetUser.id,
        'Convite para equipe',
        `Você recebeu um convite para participar da equipe “${team.name}”.`,
        '/equipes',
        now,
      ]
    );

    res.status(201).json({
      ...insertRes.rows[0],
      team_name: team.name,
      username: targetUser.username,
    });
  } catch (err) {
    next(err);
  }
}

// Invitations
export async function listInvitations(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const countRes = await query(
      "SELECT COUNT(*)::int AS count FROM teams_teammembership WHERE user_id = $1 AND status = 'invited'",
      [req.user.id]
    );
    const total = countRes.rows[0].count;

    const listRes = await query(
      `SELECT
        tm.id, tm.team_id AS team, t.name AS team_name,
        tm.user_id AS user, u.username, tm.status, tm.joined_at
       FROM teams_teammembership tm
       JOIN teams_team t ON tm.team_id = t.id
       JOIN accounts_user u ON tm.user_id = u.id
       WHERE tm.user_id = $1 AND tm.status = 'invited'
       ORDER BY tm.joined_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    res.json(paginate(req, total, listRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function acceptInvitation(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await query(
      `UPDATE teams_teammembership
       SET status = 'active'
       WHERE id = $1 AND user_id = $2
       RETURNING id, team_id AS team, user_id AS user, status, joined_at`,
      [id, req.user.id]
    );

    const membership = updated.rows[0];
    if (!membership) throw new NotFoundError('Convite não encontrado.');

    const teamRes = await query('SELECT name FROM teams_team WHERE id = $1', [membership.team]);
    res.json({
      ...membership,
      team_name: teamRes.rows[0]?.name,
      username: req.user.username,
    });
  } catch (err) {
    next(err);
  }
}

