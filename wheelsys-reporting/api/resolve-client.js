// api/resolve-client.js — Résout un nom de client vers son vrai entityId wheelsys
//
// D-026 : `partner_codeid`/`corporatecodeid`/`drivercodeid` (utilisés partout
// ailleurs dans ce projet) sont le NUMÉRO DE COMPTE affiché, pas l'entityId
// interne utilisé par manage/master/*.aspx?entityId=. Le seul moyen fiable de
// retrouver le vrai entityId est l'API de recherche globale de wheelsys
// (celle qui alimente la barre de recherche en haut de l'app), découverte en
// direct par Julien (2026-07-19) : POST /api/entities/globalsearch,
// form-urlencoded, `searchIndex=%<terme>%&exact=F` → tableau de
// {Id, Domain, DisplayValue, EntryType}. EntryType ("Corporate"/"Driver")
// indique la page cible (corporate.aspx / driver.aspx).
//
// Usage prévu : bouton "Ouvrir dans wheelsys" à la demande (pas en masse),
// depuis l'onglet Stats clients — approche assistée (D-026/module Credit
// rating) : on ouvre la bonne fiche, l'utilisateur modifie et clique Save
// lui-même dans wheelsys. Aucune écriture depuis ce backend.
//
// D-028 : la recherche par nom seul échoue pour certains clients corporate
// (ex. "CLIBAT AMENAGEMENT" → 0 résultat en prod) alors que la même API
// trouve bien les individus par nom. Hypothèse : l'index de recherche
// wheelsys ne matche pas forcément le nom affiché en report (espaces/accents
// différents de la fiche réelle, cf. `"BRC  MENUISERIE"` avec double espace
// vu en direct). Le numéro de compte (`clientEntityId` — D-026/D-027, c'est
// le numéro affiché "Corporate Customer - 1457", pas l'entityId) est un
// identifiant numérique qu'on possède déjà et qui est un sous-texte du label
// indexé par wheelsys (vu en direct : recherche "Customer - 2640" trouve le
// bon compte) — donc chercher d'abord sur ce numéro (wildcard `%1457%`) est
// plus fiable qu'une recherche floue sur le nom, et sert de repli name→number
// avant repli name-only si jamais le numéro est absent.

const { verify: verifySession } = require('./auth');

const ENTITY_PAGE_BY_TYPE = {
  Corporate: 'corporate.aspx',
  Driver:    'driver.aspx',
};

async function globalSearch(tenant, cookie, term) {
  const resp = await fetch(`https://${tenant}.wheelsys.io/api/entities/globalsearch`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With':'XMLHttpRequest',
      'Cookie':           cookie,
    },
    body: new URLSearchParams({ searchIndex: `%${term}%`, exact: 'F' }).toString(),
  });
  if (resp.status === 401 || resp.status === 403) throw new Error('SESSION_EXPIRED');
  if (!resp.ok) throw new Error(`API wheelsys HTTP ${resp.status}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const authHeader  = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieMatch = (req.headers.cookie || '').match(/wls_session=([^;]+)/);
  const session     = verifySession(bearerToken || cookieMatch?.[1]);
  if (!session) return res.status(401).json({ error: 'Non authentifié.' });

  const tenant = process.env.WHEELSYS_TENANT;
  if (!tenant) return res.status(500).json({ error: 'WHEELSYS_TENANT manquant dans Vercel.' });

  const wlsCookie = session.wheelsysCookie;
  if (!wlsCookie) return res.status(401).json({ error: 'Session invalide, reconnectez-vous.' });

  const name          = String((req.body || {}).name || '').trim();
  const accountNumber = String((req.body || {}).accountNumber || '').trim();
  if (!name && !accountNumber) return res.status(400).json({ error: 'name ou accountNumber requis' });

  function toResults(raw) {
    return raw
      .filter(r => ENTITY_PAGE_BY_TYPE[r.EntryType])
      .map(r => ({
        id:    r.Id,
        type:  r.EntryType,
        label: r.DisplayValue,
        url:   `https://${tenant}.wheelsys.io/ui/manage/master/${ENTITY_PAGE_BY_TYPE[r.EntryType]}?entityId=${r.Id}`,
      }));
  }

  try {
    // D-028 : le numéro de compte est un identifiant plus fiable que le nom
    // (l'index de recherche wheelsys ne matche pas toujours le nom tel
    // qu'affiché dans nos rapports) — on l'essaie en premier.
    let results = [];
    if (accountNumber) {
      results = toResults(await globalSearch(tenant, wlsCookie, accountNumber));
    }
    if (results.length === 0 && name) {
      results = toResults(await globalSearch(tenant, wlsCookie, name));
    }
    return res.json({ ok: true, results });
  } catch (e) {
    if (e.message === 'SESSION_EXPIRED') return res.status(401).json({ error: 'Session wheelsys expirée, reconnectez-vous.' });
    return res.status(500).json({ error: 'Erreur wheelsys: ' + e.message });
  }
};
