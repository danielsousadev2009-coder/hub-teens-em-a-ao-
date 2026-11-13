import { checkConnection, query } from '../config/database.js';

export async function healthHandler(req, res) {
  res.json({ status: 'ok', service: 'hub-teens-api' });
}

export async function readinessHandler(req, res) {
  try {
    const isOk = await checkConnection();
    if (isOk) {
      return res.json({ status: 'ok', service: 'hub-teens-api' });
    }
    return res.status(503).json({ status: 'unavailable', service: 'hub-teens-api' });
  } catch (err) {
    return res.status(503).json({ status: 'unavailable', service: 'hub-teens-api' });
  }
}

export async function dashboardHandler(req, res, next) {
  try {
    const userId = req.user.id;

    const [
      ideasRes,
      projectsRes,
      submissionsRes,
      acceptedRes,
      teamsRes,
      pendingMediaRes,
      unreadNotifRes,
      pointsRes,
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM ideas_idea WHERE owner_id = $1', [userId]),
      query('SELECT COUNT(*)::int AS count FROM projects_project WHERE owner_id = $1', [userId]),
      query('SELECT COUNT(*)::int AS count FROM challenges_challengesubmission WHERE student_id = $1', [userId]),
      query("SELECT COUNT(*)::int AS count FROM challenges_challengesubmission WHERE student_id = $1 AND status = 'accepted'", [userId]),
      query("SELECT COUNT(*)::int AS count FROM teams_teammembership WHERE user_id = $1 AND status = 'active'", [userId]),
      query("SELECT COUNT(*)::int AS count FROM youth_media_youtharticle WHERE author_id = $1 AND status = 'pending'", [userId]),
      query('SELECT COUNT(*)::int AS count FROM notifications_notification WHERE recipient_id = $1 AND read_at IS NULL', [userId]),
      query('SELECT COALESCE(SUM(points), 0)::int AS total FROM ranking_pointaward WHERE user_id = $1', [userId]),
    ]);

    const ideasCount = ideasRes.rows[0].count;
    const projectsCount = projectsRes.rows[0].count;
    const submissionsCount = submissionsRes.rows[0].count;
    const acceptedCount = acceptedRes.rows[0].count;
    const activeTeamsCount = teamsRes.rows[0].count;
    const pendingMediaCount = pendingMediaRes.rows[0].count;
    const unreadNotifCount = unreadNotifRes.rows[0].count;
    const pointsTotal = pointsRes.rows[0].total;

    const achievements = [];
    if (ideasCount > 0) {
      achievements.push({ id: 'first-idea', title: 'Primeira ideia', unlocked: true });
    }
    if (projectsCount > 0) {
      achievements.push({ id: 'first-project', title: 'Primeiro projeto', unlocked: true });
    }
    if (acceptedCount > 0) {
      achievements.push({ id: 'first-challenge', title: 'Desafio concluído', unlocked: true });
    }

    res.json({
      user: {
        username: req.user.username,
        first_name: req.user.first_name,
        role: req.user.role,
      },
      summary: {
        ideas: ideasCount,
        projects: projectsCount,
        challenge_submissions: submissionsCount,
        accepted_challenges: acceptedCount,
        active_teams: activeTeamsCount,
        pending_media_articles: pendingMediaCount,
        unread_notifications: unreadNotifCount,
        points: pointsTotal,
      },
      achievements,
    });
  } catch (err) {
    next(err);
  }
}

