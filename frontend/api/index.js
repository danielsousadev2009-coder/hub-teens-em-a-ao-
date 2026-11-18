import app from '../../backend/src/app.js';

export default function handler(req, res) {
  // Restore original path if rewritten by Vercel
  const matched = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'];
  if (matched && matched.startsWith('/api')) {
    req.url = matched;
  }
  return app(req, res);
}
