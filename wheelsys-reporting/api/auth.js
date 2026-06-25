// api/auth.js — Auth via identifiants Wheelsys
// Chaque utilisateur se connecte avec son propre compte wheelsys.
// Le backend vérifie les credentials auprès de wheelsys et crée une session.
// Aucun compte ne sont stockés côté app.
//
// Env vars requises :
//   WHEELSYS_TENANT  ex: "lutam"
//   APP_SECRET       ex: chaîne aléatoire longue (openssl rand -hex 32)

const crypto = require('crypto');

const SECRET = process.env.APP_SECRET || 'changeme-please-set-APP_SECRET';

// ─── JWT simple (signe le payload, embarque le cookie wheelsys) ───────────────
function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ─── Authentification Wheelsys ────────────────────────────────────────────────
async function loginToWheelsys(tenant, username, password) {
  const loginUrl = `https://${tenant}.wheelsys.io/sign-in/default.aspx?ReturnUrl=%2fui%2f`;

  // 1. GET la page de login pour récupérer __VIEWSTATE
  const getResp = await fetch(loginUrl);
  const html    = await getResp.text();

  const initCookies = (getResp.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]);

  const extract = id =>
    (html.match(new RegExp(`id="${id}"\\s+value="([^"]*)"`, 'i')) || [])[1] || '';

  // 2. POST les credentials
  const body = new URLSearchParams({
    '__EVENTTARGET':                       '',
    '__EVENTARGUMENT':                     '',
    '__VIEWSTATE':                         extract('__VIEWSTATE'),
    '__VIEWSTATEGENERATOR':                extract('__VIEWSTATEGENERATOR'),
    'ctl00$coreBody$hdfUpdatingPassword':  '0',
    'ctl00$coreBody$hdfEmail':             '',
    'ctl00$coreBody$FortNoxStateHidden':   extract('FortNoxStateHidden'),
    'ctl00$coreBody$FortNoxStationHidden': extract('FortNoxStationHidden'),
    'tbEmail_text':                        username,
    'tbPassword_text':                     password,
    'ctl00$coreBody$btnActualSignin':      'Sign-in',
  });

  const postResp = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie':       initCookies.join('; '),
    },
    body:     body.toString(),
    redirect: 'manual',
  });

  const location = postResp.headers.get('location') || '';
  if (postResp.status !== 302 || !location.includes('/ui')) {
    throw new Error('Identifiants wheelsys incorrects.');
  }

  // Fusionner tous les cookies de session
  const postCookies = (postResp.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]);
  const jar = [...initCookies];
  for (const c of postCookies) {
    const name = c.split('=')[0];
    const idx  = jar.findIndex(x => x.split('=')[0] === name);
    if (idx >= 0) jar[idx] = c; else jar.push(c);
  }

  return jar.join('; ');
}

// ─── Handler ─────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE = logout
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'wls_session=; Path=/; HttpOnly; Max-Age=0');
    return res.json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });

  const tenant = process.env.WHEELSYS_TENANT;
  if (!tenant)
    return res.status(500).json({ error: 'WHEELSYS_TENANT non configuré sur Vercel.' });

  try {
    // Authentifier auprès de wheelsys avec les credentials de l'utilisateur
    const wheelsysCookie = await loginToWheelsys(tenant, username, password);

    // Créer la session app (expire dans 8h)
    const token = sign({
      username,
      wheelsysCookie,           // cookie wheelsys embarqué, signé
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });

    // Cookie pour l'app Vercel native (SameSite Strict)
    res.setHeader('Set-Cookie',
      `wls_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}`
    );
    // Token dans le body pour les apps cross-origin (Lovable, etc.)
    return res.json({ ok: true, token, username });

  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
};

module.exports.verify = verify;
