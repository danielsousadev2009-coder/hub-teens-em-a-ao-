import { query } from '../config/database.js';
import { PermissionError } from '../middlewares/errorHandler.js';

export async function getRanking(req, res, next) {
  try {
    if (req.user.role === 'student') {
      throw new PermissionError('O ranking coletivo está desativado neste piloto para proteger os dados dos alunos.');
    }

    const result = await query(
      `SELECT u.username, SUM(pa.points)::int AS points
       FROM accounts_user u
       JOIN ranking_pointaward pa ON pa.user_id = u.id
       WHERE u.is_active = true AND u.role = 'student'
       GROUP BY u.id, u.username
       HAVING SUM(pa.points) > 0
       ORDER BY points DESC, u.username ASC
       LIMIT 100`
    );

    const ranking = result.rows.map((row, index) => ({
      position: index + 1,
      username: row.username,
      points: row.points || 0,
    }));

    res.json(ranking);
  } catch (err) {
    next(err);
  }
}

export async function getMyPoints(req, res, next) {
  try {
    const result = await query(
      `SELECT pa.id, u.username, pa.points, pa.reason, pa.created_at
       FROM ranking_pointaward pa
       JOIN accounts_user u ON pa.user_id = u.id
       WHERE pa.user_id = $1
       ORDER BY pa.created_at DESC`,
      [req.user.id]
    );

    const total = result.rows.reduce((sum, row) => sum + row.points, 0);

    res.json({
      total,
      history: result.rows,
      rules: [
        {
          event: 'challenge_accepted',
          points: 10,
          description: 'Uma participação em desafio aprovada pelo professor.',
        },
      ],
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectPointsWrite(req, res) {
  res.status(405).json({
    error: {
      code: 'method_not_allowed',
      message: 'Método não permitido.',
      details: null,
    },
  });
}

