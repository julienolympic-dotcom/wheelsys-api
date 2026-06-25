// Supabase Edge Function — wheelsys-auth
// Secrets à configurer dans Supabase Dashboard > Edge Functions > Secrets :
//   WHEELSYS_TENANT = "lutam"
//   APP_SECRET      = (openssl rand -hex 32)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TENANT = Deno.env.get('WHEELSYS_TENANT') ?? 'lutam';
const SECRET = Deno.env.get('APP_SECRET')      ?? 'changeme';

// ── JWT (Web Crypto API natif Deno) ──────────────────────────────────────────
async function signToken(payload: object): Promise<string> {
  const enc  = new TextEncoder();
  const data = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sig = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${data}.${sig}`;
}

export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const enc  = new TextEncoder();
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf  = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
    if ((payload.exp as number) < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ── Login ASP.NET Wheelsys ────────────────────────────────────────────────────
function parseCookies(resp: Response): string[] {
  // getSetCookie() disponible Deno 1.30+, sinon fallback
  const raw = (resp.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [resp.headers.get('set-cookie') ?? ''].filter(Boolean);
  return raw.map(c => c.split(';')[0].trim()).filter(Boolean);
}

function mergeCookieJar(jar: string[], incoming: string[]): string[] {
  const result = [...jar];
  for (const c of incoming) {
    const name = c.split('=')[0];
    const idx  = result.findIndex(x => x.split('=')[0] === name);
    if (idx >= 0) result[idx] = c; else result.push(c);
  }
  return result;
}

async function loginToWheelsys(username: string, password: string): Promise<string> {
  const url = `https://${TENANT}.wheelsys.io/sign-in/default.aspx?ReturnUrl=%2fui%2f`;

  const getResp   = await fetch(url);
  const html      = await getResp.text();
  const initJar   = parseCookies(getResp);

  const extract = (id: string) =>
    html.match(new RegExp(`id="${id}"\\s+value="([^"]*)"`, 'i'))?.[1] ?? '';

  const body = new URLSearchParams({
    '__EVENTTARGET':                          '',
    '__EVENTARGUMENT':                        '',
    '__VIEWSTATE':                            extract('__VIEWSTATE'),
    '__VIEWSTATEGENERATOR':                   extract('__VIEWSTATEGENERATOR'),
    'ctl00$coreBody$hdfUpdatingPassword':     '0',
    'ctl00$coreBody$hdfEmail':                '',
    'ctl00$coreBody$FortNoxStateHidden':      extract('FortNoxStateHidden'),
    'ctl00$coreBody$FortNoxStationHidden':    extract('FortNoxStationHidden'),
    'tbEmail_text':                           username,
    'tbPassword_text':                        password,
    'ctl00$coreBody$btnActualSignin':         'Sign-in',
  });

  const postResp = await fetch(url, {
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': initJar.join('; ') },
    body:     body.toString(),
    redirect: 'manual',
  });

  const location = postResp.headers.get('location') ?? '';
  if (postResp.status !== 302 || !location.includes('/ui')) {
    throw new Error('Identifiants wheelsys incorrects.');
  }

  const jar = mergeCookieJar(initJar, parseCookies(postResp));
  return jar.join('; ');
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'DELETE') {
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  try {
    const { username, password } = await req.json() as { username: string; password: string };
    if (!username || !password)
      return new Response(JSON.stringify({ error: 'Identifiant et mot de passe requis.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const wheelsysCookie = await loginToWheelsys(username, password);
    const token = await signToken({
      username,
      wheelsysCookie,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });

    return new Response(JSON.stringify({ ok: true, token, username }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
