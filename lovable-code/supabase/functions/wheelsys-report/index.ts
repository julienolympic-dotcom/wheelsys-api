// Supabase Edge Function — wheelsys-report
// Secrets à configurer dans Supabase Dashboard > Edge Functions > Secrets :
//   WHEELSYS_TENANT = "lutam"
//   APP_SECRET      = (même valeur que dans wheelsys-auth)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TENANT = Deno.env.get('WHEELSYS_TENANT') ?? 'lutam';
const SECRET = Deno.env.get('APP_SECRET')      ?? 'changeme';

// ── Verify JWT (identique à wheelsys-auth) ────────────────────────────────────
async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
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

// ── Cache client (scope instance Edge Function) ───────────────────────────────
const clientCache = new Map<number, Record<string, unknown>>();

// ── callReport ────────────────────────────────────────────────────────────────
interface WheelsysFilter {
  FilterName:  string;
  ControlName: string;
  FilterType:  string;
  Required:    boolean;
  Value:       string | null;
  Caption:     string;
}

async function callReport(cookie: string, browser: string, filters: WheelsysFilter[]): Promise<Record<string, unknown>[]> {
  const resp = await fetch(
    `https://${TENANT}.wheelsys.io/ui/reports/exreportpreview.aspx/GenerateReportData`,
    {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie':            cookie,
      },
      body: JSON.stringify({ browser, title: browser, filters: JSON.stringify(filters) }),
    }
  );
  if (resp.status === 401 || resp.status === 403) throw new Error('SESSION_EXPIRED');
  if (!resp.ok) throw new Error(`API wheelsys HTTP ${resp.status}`);
  const json = await resp.json() as { d: { data: string } };
  return JSON.parse(json.d.data) as Record<string, unknown>[];
}

// ── buildFilters ──────────────────────────────────────────────────────────────
function buildFilters(opts: {
  dateRange: string;
  station:   string | null;
  mtrtype?:  string;
  mtdtype?:  string;
  mtstationmode?: string;
}): WheelsysFilter[] {
  const { dateRange, station, mtrtype = '3', mtdtype = '2', mtstationmode = '1' } = opts;
  return [
    { FilterName: 'mtrtype',       ControlName: 'rptmtrtype',       FilterType: 'ftMemTypeSingle', Required: true,  Value: mtrtype,       Caption: 'Rentals'          },
    { FilterName: 'mtdtype',       ControlName: 'rptmtdtype',       FilterType: 'ftMemTypeSingle', Required: true,  Value: mtdtype,       Caption: 'Date basis'       },
    { FilterName: 'dddf#dt',       ControlName: 'rptdddfdt',        FilterType: 'ftDateRange',     Required: true,  Value: dateRange,     Caption: 'Date range'       },
    { FilterName: 'mtstationmode', ControlName: 'rptmtstationmode', FilterType: 'ftMemTypeSingle', Required: true,  Value: mtstationmode, Caption: 'Station selection' },
    { FilterName: 'edstations',    ControlName: 'rptedstations',    FilterType: 'ftStation',       Required: false, Value: station,       Caption: 'Stations'         },
  ];
}

// ── getPreAuthBatch ───────────────────────────────────────────────────────────
interface PreAuthMap {
  _debug:        string;
  _sampleRecord: Record<string, unknown>;
  _byDocNo:      Record<string, number>;
}

async function getPreAuthBatch(cookie: string, dateRange: string, station: string | null): Promise<PreAuthMap | null> {
  try {
    // Étendre de 30j en arrière (la date de pré-auth peut précéder le check-out)
    const [fromStr, toStr] = dateRange.split('|');
    const fromDate = new Date(fromStr);
    fromDate.setDate(fromDate.getDate() - 30);
    const extendedFrom = fromDate.toISOString().slice(0, 10);
    const extendedRange = `${extendedFrom}|${toStr}`;

    const data = await callReport(cookie, 'preauthorizations', [
      { FilterName: 'dddf#dt',    ControlName: 'rptdddfdt',     FilterType: 'ftDateRange',    Required: true,  Value: extendedRange, Caption: 'Date'     },
      { FilterName: 'edstations', ControlName: 'rptedstations', FilterType: 'ftStation',      Required: false, Value: station,       Caption: 'Stations' },
      { FilterName: 'edstatus',   ControlName: 'rptedstatus',   FilterType: 'ftMemTypeMulti', Required: false, Value: '',            Caption: 'Status'   },
    ]);

    const fields  = data.length > 0 ? Object.keys(data[0]) : [];
    const sample  = data.length > 0 ? data[0] : {};
    const byDocNo: Record<string, number> = {};

    data.forEach(p => {
      const amount = Math.abs((p.preauthamount || p.preauthAmount || p.amount || 0) as number);
      const docno  = (p.rental || p.ranumber || p.displaydocno) as string | undefined;
      if (docno) {
        const key = String(docno).trim();
        byDocNo[key] = (byDocNo[key] || 0) + amount;
      }
    });

    return { _debug: `preauthorizations: ${data.length} rows, fields: ${fields.join(',')}`, _sampleRecord: sample, _byDocNo: byDocNo };
  } catch (e) {
    console.error('[preauth] FAILED:', (e as Error).message);
    return null;
  }
}

// ── getClientPaymentInfo ──────────────────────────────────────────────────────
async function getClientPaymentInfo(cookie: string, entityId: number): Promise<Record<string, unknown> | null> {
  if (!entityId) return null;
  if (clientCache.has(entityId)) return clientCache.get(entityId)!;
  try {
    const resp = await fetch(
      `https://${TENANT}.wheelsys.io/ui/manage/master/corporate.aspx/GetEntityData`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': cookie },
        body:    JSON.stringify({ entityId }),
      }
    );
    if (!resp.ok) return null;
    const json = await resp.json() as { d?: Record<string, unknown> };
    const d    = json?.d ?? json;
    const info = {
      paymentType:  (d as Record<string, unknown>).paymenttype  ?? (d as Record<string, unknown>).PaymentType  ?? null,
      paymentDelay: (d as Record<string, unknown>).paymentdelay ?? (d as Record<string, unknown>).PaymentDelay ?? null,
      creditLimit:  (d as Record<string, unknown>).creditlimit  ?? (d as Record<string, unknown>).CreditLimit  ?? null,
      entityId,
    };
    clientCache.set(entityId, info);
    return info;
  } catch { return null; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // Auth : Bearer token obligatoire
  const authHeader = req.headers.get('authorization') ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const session    = token ? await verifyToken(token) : null;
  if (!session)
    return new Response(JSON.stringify({ error: 'Non authentifié.' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const wlsCookie = session.wheelsysCookie as string;
  if (!wlsCookie)
    return new Response(JSON.stringify({ error: 'Session invalide, reconnectez-vous.' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

  let body: { dateRange?: string; station?: string | null };
  try { body = await req.json(); } catch { body = {}; }

  const { dateRange, station = null } = body;
  if (!dateRange)
    return new Response(JSON.stringify({ error: 'dateRange requis (ex: "2026-06-01|2026-06-30")' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const [from, to] = dateRange.split('|');

    // 4 appels parallèles
    const [rangeData, preAuthMap, impayeRaw, activeData] = await Promise.all([
      callReport(wlsCookie, 'rentalagreementfinancials', buildFilters({ dateRange, station: station ?? null, mtrtype: '3', mtdtype: '2' })),
      getPreAuthBatch(wlsCookie, dateRange, station ?? null),
      callReport(wlsCookie, 'rentalagreementfinancials', buildFilters({ dateRange, station: station ?? null, mtrtype: '3', mtdtype: '2' })),
      callReport(wlsCookie, 'rentalagreementfinancials', buildFilters({ dateRange, station: station ?? null, mtrtype: '2', mtdtype: '2' })),
    ]);

    const activeIds = new Set(activeData.map(r => r.id));

    // Enrichir fiches clients
    const uniqueIds = [...new Set(
      [...rangeData, ...impayeRaw]
        .map(r => (r.corporatecodeid || r.drivercodeid) as number)
        .filter(Boolean)
    )];
    for (let i = 0; i < uniqueIds.length; i += 10) {
      await Promise.all(uniqueIds.slice(i, i + 10).map(id => getClientPaymentInfo(wlsCookie, id)));
    }

    function clientInfo(r: Record<string, unknown>) {
      const id = (r.corporatecodeid || r.drivercodeid) as number;
      return clientCache.get(id) ?? {};
    }

    function mapRecord(r: Record<string, unknown>) {
      const ci    = clientInfo(r);
      const docno = String(r.displaydocno ?? '').trim();
      const preauth = preAuthMap
        ? (preAuthMap._byDocNo[docno] || 0)
        : ((r.excess ?? 0) as number);
      return {
        id:             r.id,
        contrat:        r.displaydocno ?? r.rano,
        client:         r.customer,
        clientEntityId: (r.corporatecodeid ?? r.drivercodeid) ?? null,
        checkoutdate:   r.checkoutdate,
        checkindate:    r.checkindate,
        facture:        r.custcharge,
        paye:           r.custpayments,
        solde:          r.custbalance,
        cash:           r.cashpaid,
        carte:          r.cardpaid,
        cheque:         r.chequepaid,
        virement:       r.bankpaid,
        excess:         r.excess,
        preauth,
        station:        r.stationfromname,
        stationCode:    r.stationfromcode,
        statut:         activeIds.has(r.id) ? 'En cours' : 'Clôturé',
        paymentType:    ci.paymentType  ?? null,
        paymentDelay:   ci.paymentDelay ?? null,
        creditLimit:    ci.creditLimit  ?? null,
      };
    }

    // Contrôle 1 : Paiements départ (solde > 0 à la sortie)
    const depart = rangeData
      .filter(r => ((r.custbalance ?? 0) as number) > 0.01)
      .map(mapRecord);

    // Contrôle 2 : Cautions manquantes (pas de pré-auth CB)
    const hasPreAuth = (r: Record<string, unknown>) => {
      if (!preAuthMap) return ((r.excess ?? 0) as number) > 0;
      const docno = String(r.displaydocno ?? '').trim();
      return (preAuthMap._byDocNo[docno] || 0) > 0;
    };
    const caution = rangeData.filter(r => !hasPreAuth(r)).map(mapRecord);

    // Contrôle 3 : Impayés
    const impaye = impayeRaw
      .filter(r => ((r.custbalance ?? 0) as number) > 0.01)
      .sort((a, b) => ((b.custbalance ?? 0) as number) - ((a.custbalance ?? 0) as number))
      .map(mapRecord);

    // Scores agences (D-002 : 50% cautions + 50% départs)
    const agenceMap: Record<string, { code: string; nom: string; total: number; cautionOk: number; departOk: number }> = {};
    rangeData.forEach(r => {
      const code = (r.stationfromcode as string) || 'INCONNU';
      if (!agenceMap[code]) agenceMap[code] = { code, nom: (r.stationfromname as string) || code, total: 0, cautionOk: 0, departOk: 0 };
      agenceMap[code].total++;
      const docno     = String(r.displaydocno ?? '').trim();
      const hasCaution = preAuthMap
        ? (preAuthMap._byDocNo[docno] || 0) > 0
        : ((r.excess ?? 0) as number) > 0;
      if (hasCaution) agenceMap[code].cautionOk++;
      if (((r.custbalance ?? 0) as number) <= 0.01) agenceMap[code].departOk++;
    });
    const agenceStats = Object.values(agenceMap)
      .map(a => ({
        ...a,
        tauxCaution: a.total > 0 ? parseFloat((a.cautionOk / a.total).toFixed(4)) : 1,
        tauxDepart:  a.total > 0 ? parseFloat((a.departOk  / a.total).toFixed(4)) : 1,
        scoreGlobal: a.total > 0 ? parseFloat((0.5 * a.cautionOk / a.total + 0.5 * a.departOk / a.total).toFixed(4)) : 1,
      }))
      .sort((a, b) => a.scoreGlobal - b.scoreGlobal);

    // Stations disponibles
    const stations = [...new Map(
      rangeData
        .filter(r => r.stationfromcode && r.stationfromname)
        .map(r => [r.stationfromcode, { code: r.stationfromcode as string, name: r.stationfromname as string }])
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({
      ok: true,
      tenant: TENANT,
      preAuthSource:  preAuthMap ? 'api' : 'fallback_excess',
      _debug:         preAuthMap?._debug ?? null,
      _samplePreAuth: preAuthMap?._sampleRecord ?? null,
      depart:      { items: depart,  total: rangeData.length },
      caution:     { items: caution, total: rangeData.length },
      impaye:      { items: impaye,  total: impayeRaw.length, from, to },
      allRaw:      rangeData.map(mapRecord),
      agenceStats,
      stations,
      user: session.username,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'SESSION_EXPIRED')
      return new Response(JSON.stringify({ error: 'Session wheelsys expirée, reconnectez-vous.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
