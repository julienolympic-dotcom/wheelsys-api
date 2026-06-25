// api/me.js — Vérifier la session courante (cookie OU Bearer pour Lovable)
const { verify } = require('./auth');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader  = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieMatch = (req.headers.cookie || '').match(/wls_session=([^;]+)/);
  const session     = verify(bearerToken || cookieMatch?.[1]);

  if (!session) return res.status(401).json({ ok: false });
  return res.json({ ok: true, username: session.username, name: session.name });
};
