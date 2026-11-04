import crypto from 'crypto';
import path from 'path';
import { query, withTransaction } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { isStorageConfigured, validateImageFile, uploadToSupabase, getSignedUrl, deleteFromSupabase } from '../utils/storage.js';
import { ValidationError, PermissionError, NotFoundError } from '../middlewares/errorHandler.js';

async function attachGoalsAndSignedUrls(projects) {
  if (projects.length === 0) return projects;
  const projectIds = projects.map((p) => p.id);

  const goalsRes = await query(
    'SELECT project_id, sustainablegoal_id FROM projects_project_goals WHERE project_id = ANY($1)',
    [projectIds]
  );

  const goalsMap = new Map();
  for (const g of goalsRes.rows) {
    if (!goalsMap.has(g.project_id)) goalsMap.set(g.project_id, []);
    goalsMap.get(g.project_id).push(g.sustainablegoal_id);
  }

  const enriched = await Promise.all(
    projects.map(async (project) => {
      let imageUrl = null;
      if (project.image) {
        try {
          imageUrl = await getSignedUrl(project.image);
        } catch {
          imageUrl = project.image;
        }
      }
      return {
        ...project,
        goals: goalsMap.get(project.id) || [],
        image: imageUrl,
      };
    })
  );

  return enriched;
}

export async function listProjects(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const search = req.query.search ? String(req.query.search).trim() : '';
    const ordering = req.query.ordering ? String(req.query.ordering).trim() : '-created_at';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push(
        `(p.owner_id = $${idx} OR p.team_id IN (
          SELECT team_id FROM teams_teammembership WHERE user_id = $${idx} AND status = 'active'
        ))`
      );
      params.push(req.user.id);
      idx++;
    }

    if (search) {
      conditions.push(`(p.title ILIKE $${idx} OR p.summary ILIKE $${idx} OR p.description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(DISTINCT p.id)::int AS count FROM projects_project p ${whereClause}`, params);
    const total = countRes.rows[0].count;

    let orderClause = 'ORDER BY p.created_at DESC';
    if (ordering === 'created_at') orderClause = 'ORDER BY p.created_at ASC';
    else if (ordering === '-created_at') orderClause = 'ORDER BY p.created_at DESC';
    else if (ordering === 'title') orderClause = 'ORDER BY p.title ASC';
    else if (ordering === '-title') orderClause = 'ORDER BY p.title DESC';
    else if (ordering === 'updated_at') orderClause = 'ORDER BY p.updated_at ASC';
    else if (ordering === '-updated_at') orderClause = 'ORDER BY p.updated_at DESC';

    const listQuery = `
      SELECT DISTINCT
        p.id, p.title, p.summary, p.description, p.materials, p.image, p.status,
        p.created_at, p.updated_at, p.owner_id AS owner, u.username AS owner_username,
        p.team_id AS team, p.challenge_id AS challenge, p.idea_id AS idea
      FROM projects_project p
      JOIN accounts_user u ON p.owner_id = u.id
      ${whereClause}
      ${orderClause}
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    const enriched = await attachGoalsAndSignedUrls(dataRes.rows);

    res.json(paginate(req, total, enriched));
  } catch (err) {
    next(err);
  }
}

export async function createProject(req, res, next) {
  try {
    if (req.user.role !== 'student') {
      throw new PermissionError('Somente alunos podem criar projetos.');
    }

    const {
      title,
      summary,
      description,
      materials = '',
      status = 'published',
      team,
      challenge,
      idea,
      goals = [],
    } = req.body;

    const errors = {};
    if (!title || !title.trim()) errors.title = ['Este campo é obrigatório.'];
    if (!summary || !summary.trim()) errors.summary = ['Este campo é obrigatório.'];
    if (!description || !description.trim()) errors.description = ['Este campo é obrigatório.'];

    let teamId = team ? parseInt(team, 10) : null;
    if (teamId) {
      const teamCheck = await query(
        "SELECT id FROM teams_teammembership WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
        [teamId, req.user.id]
      );
      if (teamCheck.rows.length === 0) {
        errors.team = ['Você precisa ser integrante ativo da equipe.'];
      }
    }

    let imagePath = '';
    if (req.file) {
      if (!isStorageConfigured()) {
        errors.image = ['O envio de imagens requer a configuração do Supabase Storage no backend.'];
      } else {
        validateImageFile(req.file);
        const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
        const uuid = crypto.randomUUID().replace(/-/g, '');
        imagePath = `projects/${req.user.id}/${uuid}${ext}`;
        await uploadToSupabase(imagePath, req.file.buffer, req.file.mimetype);
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Os dados enviados são inválidos.', errors);
    }

    const now = new Date();
    const created = await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO projects_project (
          title, summary, description, materials, image, status,
          owner_id, team_id, challenge_id, idea_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        RETURNING
          id, title, summary, description, materials, image, status,
          owner_id AS owner, team_id AS team, challenge_id AS challenge, idea_id AS idea,
          created_at, updated_at`,
        [
          title.trim(),
          summary.trim(),
          description.trim(),
          String(materials || '').trim(),
          imagePath,
          status || 'published',
          req.user.id,
          teamId,
          challenge ? parseInt(challenge, 10) : null,
          idea ? parseInt(idea, 10) : null,
          now,
        ]
      );
      const proj = insertRes.rows[0];

      if (Array.isArray(goals) && goals.length > 0) {
        for (const goalId of goals) {
          await client.query(
            'INSERT INTO projects_project_goals (project_id, sustainablegoal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [proj.id, parseInt(goalId, 10)]
          );
        }
      }

      return proj;
    });

    const [enriched] = await attachGoalsAndSignedUrls([
      { ...created, owner_username: req.user.username },
    ]);
    res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function getProject(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      `SELECT
        p.id, p.title, p.summary, p.description, p.materials, p.image, p.status,
        p.created_at, p.updated_at, p.owner_id AS owner, u.username AS owner_username,
        p.team_id AS team, p.challenge_id AS challenge, p.idea_id AS idea
      FROM projects_project p
      JOIN accounts_user u ON p.owner_id = u.id
      WHERE p.id = $1`,
      [id]
    );

    const project = result.rows[0];
    if (!project) throw new NotFoundError('Projeto não encontrado.');

    if (req.user.role === 'student' && project.owner !== req.user.id) {
      if (!project.team) throw new NotFoundError('Projeto não encontrado.');
      const memberCheck = await query(
        "SELECT 1 FROM teams_teammembership WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
        [project.team, req.user.id]
      );
      if (memberCheck.rows.length === 0) throw new NotFoundError('Projeto não encontrado.');
    }

    const [enriched] = await attachGoalsAndSignedUrls([project]);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id, team_id, image FROM projects_project WHERE id = $1', [id]);
    const project = existing.rows[0];
    if (!project) throw new NotFoundError('Projeto não encontrado.');

    if (req.user.role !== 'administrator' && project.owner_id !== req.user.id) {
      if (!project.team_id) {
        throw new PermissionError('Somente a equipe responsável pode alterar o projeto.');
      }
      const memberCheck = await query(
        "SELECT 1 FROM teams_teammembership WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
        [project.team_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        throw new PermissionError('Somente a equipe responsável pode alterar o projeto.');
      }
    }

    const { title, summary, description, materials, status, team, challenge, idea, goals } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (summary !== undefined) { updates.push(`summary = $${idx++}`); values.push(summary.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
    if (materials !== undefined) { updates.push(`materials = $${idx++}`); values.push(materials.trim()); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (team !== undefined) { updates.push(`team_id = $${idx++}`); values.push(team ? parseInt(team, 10) : null); }
    if (challenge !== undefined) { updates.push(`challenge_id = $${idx++}`); values.push(challenge ? parseInt(challenge, 10) : null); }
    if (idea !== undefined) { updates.push(`idea_id = $${idx++}`); values.push(idea ? parseInt(idea, 10) : null); }

    if (req.file) {
      validateImageFile(req.file);
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const uuid = crypto.randomUUID().replace(/-/g, '');
      const newImagePath = `projects/${project.owner_id}/${uuid}${ext}`;
      await uploadToSupabase(newImagePath, req.file.buffer, req.file.mimetype);
      updates.push(`image = $${idx++}`);
      values.push(newImagePath);
    }

    updates.push(`updated_at = $${idx++}`);
    values.push(new Date());

    if (updates.length > 0) {
      values.push(id);
      await query(`UPDATE projects_project SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    }

    if (Array.isArray(goals)) {
      await query('DELETE FROM projects_project_goals WHERE project_id = $1', [id]);
      for (const goalId of goals) {
        await query(
          'INSERT INTO projects_project_goals (project_id, sustainablegoal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, parseInt(goalId, 10)]
        );
      }
    }

    const updatedRes = await query(
      `SELECT
        p.id, p.title, p.summary, p.description, p.materials, p.image, p.status,
        p.created_at, p.updated_at, p.owner_id AS owner, u.username AS owner_username,
        p.team_id AS team, p.challenge_id AS challenge, p.idea_id AS idea
      FROM projects_project p
      JOIN accounts_user u ON p.owner_id = u.id
      WHERE p.id = $1`,
      [id]
    );

    const [enriched] = await attachGoalsAndSignedUrls(updatedRes.rows);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query('SELECT id, owner_id, image FROM projects_project WHERE id = $1', [id]);
    const project = existing.rows[0];
    if (!project) throw new NotFoundError('Projeto não encontrado.');

    if (req.user.role !== 'administrator' && project.owner_id !== req.user.id) {
      throw new NotFoundError('Projeto não encontrado.');
    }

    await query('DELETE FROM projects_project WHERE id = $1', [id]);

    if (project.image) {
      deleteFromSupabase(project.image).catch(() => {});
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Project Steps
export async function listProjectSteps(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      conditions.push(
        `(p.owner_id = $${idx} OR p.team_id IN (
          SELECT team_id FROM teams_teammembership WHERE user_id = $${idx} AND status = 'active'
        ))`
      );
      params.push(req.user.id);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::int AS count
       FROM projects_projectstep ps
       JOIN projects_project p ON ps.project_id = p.id
       ${whereClause}`,
      params
    );
    const total = countRes.rows[0].count;

    const listQuery = `
      SELECT ps.id, ps.project_id AS project, ps.title, ps.description, ps.position, ps.completed, ps.updated_at
      FROM projects_projectstep ps
      JOIN projects_project p ON ps.project_id = p.id
      ${whereClause}
      ORDER BY ps.position ASC, ps.id ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const dataRes = await query(listQuery, [...params, limit, offset]);
    res.json(paginate(req, total, dataRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function createProjectStep(req, res, next) {
  try {
    const { project: projectId, title, description = '', position = 0, completed = false } = req.body;
    if (!projectId || !title || !title.trim()) {
      throw new ValidationError('Os dados enviados são inválidos.', { title: ['Este campo é obrigatório.'] });
    }

    const pRes = await query('SELECT id, owner_id, team_id FROM projects_project WHERE id = $1', [projectId]);
    const project = pRes.rows[0];
    if (!project) throw new NotFoundError('Projeto não encontrado.');

    if (req.user.role !== 'administrator' && project.owner_id !== req.user.id) {
      if (!project.team_id) {
        throw new PermissionError('Somente a equipe responsável pode atualizar etapas.');
      }
      const memberCheck = await query(
        "SELECT 1 FROM teams_teammembership WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
        [project.team_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        throw new PermissionError('Somente a equipe responsável pode atualizar etapas.');
      }
    }

    const insertRes = await query(
      `INSERT INTO projects_projectstep (project_id, title, description, position, completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id AS project, title, description, position, completed, updated_at`,
      [project.id, title.trim(), String(description || '').trim(), parseInt(position, 10) || 0, Boolean(completed), new Date()]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function updateProjectStep(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query(
      `SELECT ps.id, ps.project_id, p.owner_id, p.team_id
       FROM projects_projectstep ps
       JOIN projects_project p ON ps.project_id = p.id
       WHERE ps.id = $1`,
      [id]
    );
    const step = existing.rows[0];
    if (!step) throw new NotFoundError('Etapa não encontrada.');

    if (req.user.role !== 'administrator' && step.owner_id !== req.user.id) {
      if (!step.team_id) {
        throw new PermissionError('Somente a pessoa responsável pode atualizar esta etapa.');
      }
      const memberCheck = await query(
        "SELECT 1 FROM teams_teammembership WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
        [step.team_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        throw new PermissionError('Somente a pessoa responsável pode atualizar esta etapa.');
      }
    }

    const { title, description, position, completed } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description.trim()); }
    if (position !== undefined) { updates.push(`position = $${idx++}`); values.push(parseInt(position, 10) || 0); }
    if (completed !== undefined) { updates.push(`completed = $${idx++}`); values.push(Boolean(completed)); }

    updates.push(`updated_at = $${idx++}`);
    values.push(new Date());

    values.push(id);
    const updated = await query(
      `UPDATE projects_projectstep SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, project_id AS project, title, description, position, completed, updated_at`,
      values
    );

    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function deleteProjectStep(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query(
      `SELECT ps.id, p.owner_id, p.team_id
       FROM projects_projectstep ps
       JOIN projects_project p ON ps.project_id = p.id
       WHERE ps.id = $1`,
      [id]
    );
    const step = existing.rows[0];
    if (!step) throw new NotFoundError('Etapa não encontrada.');

    if (req.user.role !== 'administrator' && step.owner_id !== req.user.id) {
      if (!step.team_id) {
        throw new PermissionError('Somente a pessoa responsável pode remover esta etapa.');
      }
      const memberCheck = await query(
        "SELECT 1 FROM teams_teammembership WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
        [step.team_id, req.user.id]
      );
      if (memberCheck.rows.length === 0) {
        throw new PermissionError('Somente a pessoa responsável pode remover esta etapa.');
      }
    }

    await query('DELETE FROM projects_projectstep WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

