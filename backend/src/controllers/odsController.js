import { query } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { NotFoundError } from '../middlewares/errorHandler.js';

export async function listOds(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);
    const countRes = await query('SELECT COUNT(*)::int AS count FROM ods_sustainablegoal');
    const total = countRes.rows[0].count;

    const dataRes = await query(
      'SELECT id, number, title, official_url FROM ods_sustainablegoal ORDER BY number ASC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    res.json(paginate(req, total, dataRes.rows));
  } catch (err) {
    next(err);
  }
}

export async function getOds(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      'SELECT id, number, title, official_url FROM ods_sustainablegoal WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('ODS não encontrado.');
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

