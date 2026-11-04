import { query } from '../config/database.js';
import { paginate, getPaginationOffset } from '../utils/pagination.js';
import { NotFoundError } from '../middlewares/errorHandler.js';

export async function listNotifications(req, res, next) {
  try {
    const { limit, offset } = getPaginationOffset(req);

    const [countRes, unreadRes, listRes] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM notifications_notification WHERE recipient_id = $1', [req.user.id]),
      query('SELECT COUNT(*)::int AS count FROM notifications_notification WHERE recipient_id = $1 AND read_at IS NULL', [req.user.id]),
      query(
        `SELECT id, title, message, url, created_at, read_at
         FROM notifications_notification
         WHERE recipient_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
    ]);

    const total = countRes.rows[0].count;
    const unreadCount = unreadRes.rows[0].count;
    const paginated = paginate(req, total, listRes.rows);

    res.json({
      ...paginated,
      unread_count: unreadCount,
    });
  } catch (err) {
    next(err);
  }
}

export async function getNotification(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query(
      'SELECT id, title, message, url, created_at, read_at FROM notifications_notification WHERE id = $1 AND recipient_id = $2',
      [id, req.user.id]
    );

    if (result.rows.length === 0) throw new NotFoundError('Notificação não encontrada.');
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await query(
      'SELECT id, read_at FROM notifications_notification WHERE id = $1 AND recipient_id = $2',
      [id, req.user.id]
    );

    if (existing.rows.length === 0) throw new NotFoundError('Notificação não encontrada.');

    let notification = existing.rows[0];
    if (notification.read_at === null) {
      const now = new Date();
      const updated = await query(
        `UPDATE notifications_notification SET read_at = $1 WHERE id = $2
         RETURNING id, title, message, url, created_at, read_at`,
        [now, id]
      );
      notification = updated.rows[0];
    } else {
      const full = await query('SELECT id, title, message, url, created_at, read_at FROM notifications_notification WHERE id = $1', [id]);
      notification = full.rows[0];
    }

    res.json(notification);
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await query(
      'UPDATE notifications_notification SET read_at = $1 WHERE recipient_id = $2 AND read_at IS NULL',
      [new Date(), req.user.id]
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

