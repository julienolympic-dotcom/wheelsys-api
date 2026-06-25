// api/report.js — Proxy Wheelsys
// Variables d'environnement requises :
//   WHEELSYS_TENANT  ex: "lutam"
//   APP_SECRET       ex: chaîne aléatoire longue
//
// Auth : chaque utilisateur se connecte avec son propre compte wheelsys.
// Le cookie wheelsys est embarqué (signé) dans la session app.
// Aucun credential n'est stocké côté serveur.

const { verify: verifySession } = require('./auth');

// Cache des fiches clients : { entityId -> { paymentType, paymentDelay, ... } }
const clientCache = new Map();

// ─── Authentification ASP.NET Web Forms ───────────────────────────────────────
async function login(tenant, username, password) {
  const loginUrl = `https://${tenant}.wheelsys.io/sign-in/default.aspx?ReturnUrl=%2fui%2f`;

  // 1. GET la page de login pour récupérer __VIEWSTATE
  const getResp = await fetch(loginUrl, { redirect: 'follow' });
  const html    = await getResp.text();

  // Collecter les cookies du GET
  const initCookies = (getResp.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0]);

  // Parser les champs cachés ASP.NET
  const extract = (id) =>
    (html.match(new RegExp(`id="${id}"\\s+value="([^"]*)"`, 'i')) || [])[1] || '';

  const viewState     = extract('__VIEWSTATE');
  const viewStateGen  = extract('__VIEWSTATEGENERATOR');
  const fortNoxState  = extract('FortNoxStateHidden');
  const fortNoxStation= extract('FortNoxStationHidden');

  // 2. POST les credentials
  const body = new URLSearchParams({
    '__EVENTTARGET':                          '',
    '__EVENTARGUMENT':                        '',
    '__VIEWSTATE':                            viewState,
    '__VIEWSTATEGENERATOR':                   viewStateGen,
    'ctl00$coreBody$hdfUpdatingPassword':     '0',
    'ctl00$coreBody$hdfEmail':                '',
    'ctl00$coreBody$FortNoxStateHidden':      fortNoxState,
    'ctl00$coreBody$FortNoxStationHidden':    fortNoxStation,
    'tbEmail_text':                           username,
    'tbPassword_text':                        password,
    'ctl00$coreBody$btnActualSignin':         'Sign-in',
  });

  const postResp = await fetch(loginUrl, {
    method:   'POST',
    headers:  {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie':       initCookies.join('; '),
    },
    body:     body.toString(),
    redirect: 'manual',
  });

  // Fusionner les nouveaux cookies
  const postCookies = (postResp.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0]);

  const jar = [...initCookies];
  for (const c of postCookies) {
    const name = c.split('=')[0];
    const idx  = jar.findIndex(x => x.split('=')[0] === name);
    if (idx >= 0) jar[idx] = c; else jar.push(c);
  }

  const location = postResp.headers.get('location') || '';
  if (postResp.status !== 302 && !location.includes('/ui')) {
    throw new Error('Login échoué — vérifier WHEELSYS_USERNAME / WHEELSYS_PASSWORD');
  }

  return jar.join('; ');
}

// ─── Session avec cache 25 min ────────────────────────────────────────────────
async function getSession(tenant, username, password) {
  if (sessionCache.cookie && Date.now() < sessionCache.expires) {
    return sessionCache.cookie;
  }
  const cookie = await login(tenant, username, password);
  sessionCache  = { cookie, expires: Date.now() + 25 * 60 * 1000 };
  return cookie;
}

// ─── Appel report API ─────────────────────────────────────────────────────────
async function callReport(tenant, cookie, browser, filters) {
  const resp = await fetch(
    `https://${tenant}.wheelsys.io/ui/reports/exreportpreview.aspx/GenerateReportData`,
    {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json; charset=utf-8',
        'X-Requested-With':'XMLHttpRequest',
        'Cookie':           cookie,
      },
      body: JSON.stringify({ browser, title: browser, filters: JSON.stringify(filters) }),
    }
  );
  if (resp.status === 401 || resp.status === 403) {
    sessionCache = { cookie: null, expires: 0 }; // forcer re-auth
    throw new Error('SESSION_EXPIRED');
  }
  if (!resp.ok) throw new Error(`API wheelsys HTTP ${resp.status}`);
  const json = await resp.json();
  return JSON.parse(json.d.data);
}

// ─── Pré-autorisations (cautions) en batch ───────────────────────────────────
// Retourne un Map { rentalEntityId -> montantPreAuth }
async function getPreAuthBatch(tenant, cookie, dateRange, station) {
  try {
    // Rapport dédié : preauthorizations (/ui/reports/preauthorizations.aspx)
    // Contient la colonne Rental # qui permet le croisement avec rentalagreementfinancials

    // ⚠️ BUG FIX 2026-06-16 : le filtre dddf#dt du rapport preauthorizations porte sur
    // la DATE DE CRÉATION de la pré-auth, pas sur la date du contrat.
    // Une pré-auth prise la veille du départ (ex: J-1) serait manquée si on utilise
    // exactement la même plage que les check-outs.
    // Fix : on étend la plage de recherche à J-30 pour capturer toutes les pré-auths récentes.
    const [fromStr, toStr] = dateRange.split('|');
    const fromDate = new Date(fromStr);
    fromDate.setDate(fromDate.getDate() - 30);
    const extendedFrom = fromDate.toISOString().slice(0, 10);
    const extendedRange = `${extendedFrom}|${toStr}`;

    const data = await callReport(tenant, cookie, 'preauthorizations', [
      { FilterName: 'dddf#dt',    ControlName: 'rptdddfdt',    FilterType: 'ftDateRange',    Required: true,  Value: extendedRange, Caption: 'Date'     },
      { FilterName: 'edstations', ControlName: 'rptedstations',FilterType: 'ftStation',      Required: false, Value: station||null,Caption: 'Stations' },
      { FilterName: 'edstatus',   ControlName: 'rptedstatus',  FilterType: 'ftMemTypeMulti', Required: false, Value: '',           Caption: 'Status'   },
    ]);

    const sampleFields = data.length > 0 ? Object.keys(data[0]) : [];
    const sampleRecord = data.length > 0 ? data[0] : {};
    console.log('[preauth] preauthorizations OK, rows:', data.length, 'fields:', sampleFields.join(','));
    console.log('[preauth] sample record:', JSON.stringify(sampleRecord));

    // Construire un Set des numéros de contrat (rano / ranumber / displaydocno) qui ont une pré-auth
    // + Map rano → montant pré-auth
    const result = {
      _debug: `preauthorizations: ${data.length} rows, fields: ${sampleFields.join(',')}`,
      _sampleRecord: sampleRecord,
      _byRano: {},   // { rano (number) → amount }
      _byDocNo: {},  // { "RNT-12345" → amount }
    };

    data.forEach(p => {
      // Champs confirmés par l'API : preauthamount, rental (= "RNT-XXXXX")
      const amount = Math.abs(p.preauthamount || p.preauthAmount || p.amount || 0);
      // Rental par numéro doc (RNT-XXXXX) — champ "rental" dans le rapport
      const docno = p.rental || p.ranumber || p.displaydocno;
      if (docno) {
        result._byDocNo[String(docno).trim()] = (result._byDocNo[String(docno).trim()] || 0) + amount;
      }
    });

    return result;
  } catch (e) {
    console.log('[preauth] preauthorizations FAILED:', e.message);
    return null; // Fallback → excess
  }
}

// ─── Construction des filtres ─────────────────────────────────────────────────
// dateRange : "2026-06-01|2026-06-30"
// station   : code station (ex: "NCE") ou null = toutes
// mtrtype   : "3"=tous, "2"=actifs, "1"=fermés
// mtdtype   : "2"=check-out, "3"=check-in
function buildFilters({ dateRange, station, mtrtype = '3', mtdtype = '2', mtstationmode = '1' }) {
  return [
    { FilterName: 'mtrtype',       ControlName: 'rptmtrtype',       FilterType: 'ftMemTypeSingle', Required: true,  Value: mtrtype,      Caption: 'Rentals'           },
    { FilterName: 'mtdtype',       ControlName: 'rptmtdtype',       FilterType: 'ftMemTypeSingle', Required: true,  Value: mtdtype,      Caption: 'Date basis'        },
    { FilterName: 'dddf#dt',       ControlName: 'rptdddfdt',        FilterType: 'ftDateRange',     Required: true,  Value: dateRange,    Caption: 'Date range'        },
    { FilterName: 'mtstationmode', ControlName: 'rptmtstationmode', FilterType: 'ftMemTypeSingle', Required: true,  Value: mtstationmode,Caption: 'Station selection'  },
    { FilterName: 'edstations',    ControlName: 'rptedstations',    FilterType: 'ftStation',       Required: false, Value: station||null,Caption: 'Stations'          },
  ];
}

// ─── Fiche client : récupérer délai/type de paiement ─────────────────────────
async function getClientPaymentInfo(tenant, cookie, entityId) {
  if (!entityId) return null;
  if (clientCache.has(entityId)) return clientCache.get(entityId);

  try {
    // Appel à la page corporate pour récupérer les données client
    const resp = await fetch(
      `https://${tenant}.wheelsys.io/ui/manage/master/corporate.aspx/GetEntityData`,
      {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json; charset=utf-8',
          'X-Requested-With':'XMLHttpRequest',
          'Cookie':           cookie,
        },
        body: JSON.stringify({ entityId }),
      }
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const data = json?.d || json;
    const info = {
      paymentType:  data.paymenttype  || data.PaymentType  || data.paymentType  || null,
      paymentDelay: data.paymentdelay || data.PaymentDelay || data.paymentDelay || null,
      creditLimit:  data.creditlimit  || data.CreditLimit  || null,
      entityId,
    };
    clientCache.set(entityId, info);
    return info;
  } catch {
    return null;
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // ── Vérification session app (cookie OU Bearer token pour Lovable) ──
  const authHeader  = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieMatch = (req.headers.cookie || '').match(/wls_session=([^;]+)/);
  const session     = verifySession(bearerToken || cookieMatch?.[1]);
  if (!session) return res.status(401).json({ error: 'Non authentifié.' });

  const tenant = process.env.WHEELSYS_TENANT;
  if (!tenant) return res.status(500).json({ error: 'WHEELSYS_TENANT manquant dans Vercel.' });

  // Cookie wheelsys de l'utilisateur (embarqué dans la session)
  const wlsCookie = session.wheelsysCookie;
  if (!wlsCookie) return res.status(401).json({ error: 'Session invalide, reconnectez-vous.' });

  const { dateRange, station } = req.body || {};
  if (!dateRange) return res.status(400).json({ error: 'dateRange requis (ex: "2026-06-01|2026-06-30")' });

  try {
    {
      const cookie = wlsCookie;

      // 4 appels parallèles.
      // ⚠️ mtrtype=1+2 ≠ mtrtype=3 : certains contrats intermédiaires n'apparaissent que dans mtrtype=3.
      // ⚠️ mtdtype=2 = date de départ (checkout) — filtre correct par période sélectionnée.
      //    mtdtype=1 = date de création du contrat (trop large, contrats hors période).
      // ⚠️ checkindate est la date de retour PRÉVUE (toujours renseignée) — inutilisable pour le statut.
      //    Statut dérivé par intersection : si l'ID est dans activeIds → "En cours", sinon → "Clôturé".
      const [from, to] = dateRange.split('|');
      const [rangeData, preAuthMap, impayeRaw, activeData] = await Promise.all([
        callReport(tenant, cookie, 'rentalagreementfinancials', buildFilters({
          dateRange, station, mtrtype: '3', mtdtype: '2', mtstationmode: '1',
        })),
        getPreAuthBatch(tenant, cookie, dateRange, station),
        callReport(tenant, cookie, 'rentalagreementfinancials', buildFilters({
          dateRange, station, mtrtype: '3', mtdtype: '2', mtstationmode: '1', // mtrtype=3 : inclut les actifs avec solde > 0 (ex: location longue durée non payée)
        })),
        callReport(tenant, cookie, 'rentalagreementfinancials', buildFilters({
          dateRange, station, mtrtype: '2', mtdtype: '2', mtstationmode: '1', // actifs uniquement — pour dériver le statut
        })),
      ]);

      // Set des IDs actifs (véhicule pas encore rendu)
      const activeIds = new Set(activeData.map(r => r.id));

      // ── Enrichir avec infos client (délai paiement) — rangeData + impayeRaw ──
      const uniqueClientIds = [...new Set(
        [...rangeData, ...impayeRaw]
          .map(r => r.corporatecodeid || r.drivercodeid)
          .filter(Boolean)
      )];
      for (let i = 0; i < uniqueClientIds.length; i += 10) {
        await Promise.all(
          uniqueClientIds.slice(i, i + 10).map(id => getClientPaymentInfo(tenant, cookie, id))
        );
      }

      function clientInfo(r) {
        const entityId = r.corporatecodeid || r.drivercodeid;
        return clientCache.get(entityId) || {};
      }

      function mapRecord(r) {
        const ci = clientInfo(r);
        const docno = String(r.displaydocno || '').trim();
        const preauth = preAuthMap
          ? (preAuthMap._byDocNo?.[docno] || 0)
          : (r.excess || 0);
        return {
          id: r.id, contrat: r.displaydocno || r.rano,
          client: r.customer, clientEntityId: r.corporatecodeid || r.drivercodeid,
          checkoutdate: r.checkoutdate, checkindate: r.checkindate,
          facture: r.custcharge, paye: r.custpayments, solde: r.custbalance,
          cash: r.cashpaid, carte: r.cardpaid, cheque: r.chequepaid, virement: r.bankpaid,
          excess: r.excess,          // franchise assurance
          preauth,                   // montant pré-autorisation CB (caution réelle)
          station: r.stationfromname, stationCode: r.stationfromcode,
          statut: activeIds.has(r.id) ? 'En cours' : 'Clôturé', // dérivé par intersection avec mtrtype=2
          paymentType:  ci.paymentType  || null,
          paymentDelay: ci.paymentDelay || null,
          creditLimit:  ci.creditLimit  || null,
        };
      }

      // ── Contrôle 1 : Paiements départ (tous contrats de la plage avec solde > 0) ──
      const depart = rangeData
        .filter(r => (r.custbalance || 0) > 0.01)
        .map(mapRecord);

      // ── Contrôle 2 : Cautions manquantes ──
      const hasPreAuth = (r) => {
        if (!preAuthMap) return r.excess > 0; // fallback franchise
        // Match par numéro de contrat (ex: "RNT-43129")
        const docno = String(r.displaydocno || '').trim();
        return (preAuthMap._byDocNo?.[docno] || 0) > 0;
      };
      const caution = rangeData.filter(r => !hasPreAuth(r)).map(r => ({
        ...mapRecord(r),
        preauth: preAuthMap
          ? (preAuthMap._byRano?.[r.rano] || preAuthMap._byRano?.[r.id] || preAuthMap._byDocNo?.[r.displaydocno] || 0)
          : (r.excess || 0),
      }));

      // ── Contrôle 3 : Balances impayées (12 mois glissants, indépendant de la période) ──
      const impaye = impayeRaw
        .filter(r => (r.custbalance || 0) > 0.01)
        .sort((a, b) => b.custbalance - a.custbalance)
        .map(mapRecord);

      // ── Toutes les données brutes (pour debug / données manquantes) ──
      const allRaw = rangeData.map(mapRecord);

      // ── Scores de conformité par agence (D-002 : 50% cautions + 50% paiements départ) ──
      const agenceMap = {};
      rangeData.forEach(r => {
        const code = r.stationfromcode || 'INCONNU';
        if (!agenceMap[code]) agenceMap[code] = {
          code, nom: r.stationfromname || code, total: 0, cautionOk: 0, departOk: 0,
        };
        agenceMap[code].total++;
        const docno = String(r.displaydocno || '').trim();
        const hasCaution = preAuthMap
          ? (preAuthMap._byDocNo?.[docno] || 0) > 0
          : (r.excess || 0) > 0;
        if (hasCaution) agenceMap[code].cautionOk++;
        if ((r.custbalance || 0) <= 0.01) agenceMap[code].departOk++;
      });
      const agenceStats = Object.values(agenceMap)
        .map(a => ({
          ...a,
          tauxCaution: a.total > 0 ? parseFloat((a.cautionOk / a.total).toFixed(4)) : 1,
          tauxDepart:  a.total > 0 ? parseFloat((a.departOk  / a.total).toFixed(4)) : 1,
          scoreGlobal: a.total > 0 ? parseFloat((0.5 * a.cautionOk / a.total + 0.5 * a.departOk / a.total).toFixed(4)) : 1,
        }))
        .sort((a, b) => a.scoreGlobal - b.scoreGlobal); // pire agence en premier

      // ── Stations disponibles (pour le sélecteur) ──
      const stations = [...new Map(
        rangeData
          .filter(r => r.stationfromcode && r.stationfromname)
          .map(r => [r.stationfromcode, { code: r.stationfromcode, name: r.stationfromname }])
      ).values()].sort((a, b) => a.name.localeCompare(b.name));

      return res.json({
        ok: true,
        tenant,
        preAuthSource: preAuthMap ? 'api' : 'fallback_excess',
        _debug: preAuthMap?._debug || null,
        _samplePreAuth: preAuthMap?._sampleRecord || null,
        depart:      { items: depart,  total: rangeData.length },
        caution:     { items: caution, total: rangeData.length },
        impaye:      { items: impaye,  total: impayeRaw.length, from, to },
        allRaw,
        agenceStats,
        stations,
        user: session.username,
      });
    }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      return res.status(401).json({ error: 'Session wheelsys expirée, reconnectez-vous.' });
    }
    return res.status(500).json({ error: err.message });
  }
};
