// src/services/wheelsys.ts
// Service Wheelsys pour Lovable — appelle les Supabase Edge Functions.
//
// ⚠️ Variables à adapter dans .env.local de Lovable :
//   VITE_SUPABASE_URL          = https://XXXX.supabase.co
//   VITE_SUPABASE_ANON_KEY     = eyJhbGci...   (clé publique — pas la service key)
//
// Les secrets WHEELSYS_TENANT et APP_SECRET sont dans les Secrets de l'Edge Function.

// ── Config ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTIONS_BASE   = `${SUPABASE_URL}/functions/v1`;
const TOKEN_KEY        = 'wheelsys_token';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ContractItem {
  id:             number;
  contrat:        string;
  client:         string;
  clientEntityId: number | null;
  checkoutdate:   string;
  checkindate:    string | null;
  facture:        number;
  paye:           number;
  solde:          number;
  cash:           number;
  carte:          number;
  cheque:         number;
  virement:       number;
  excess:         number;       // franchise assurance (≠ caution)
  preauth:        number;       // pré-autorisation CB (caution réelle)
  station:        string;
  stationCode:    string;
  statut:         'En cours' | 'Clôturé';
  paymentType:    number | null;
  paymentDelay:   number | null;
  creditLimit:    number | null;
}

export interface AgenceScore {
  code:       string;
  nom:        string;
  total:      number;
  cautionOk:  number;
  departOk:   number;
  tauxCaution: number;   // 0.0 → 1.0
  tauxDepart:  number;
  scoreGlobal: number;   // D-002 : 0.5 × caution + 0.5 × départ
}

export interface Station {
  code: string;
  name: string;
}

export interface ReportData {
  ok:          boolean;
  tenant:      string;
  preAuthSource: 'api' | 'fallback_excess';
  depart:      { items: ContractItem[]; total: number };
  caution:     { items: ContractItem[]; total: number };
  impaye:      { items: ContractItem[]; total: number; from: string; to: string };
  allRaw:      ContractItem[];
  agenceStats: AgenceScore[];
  stations:    Station[];
  user:        string;
}

export interface AuthResult {
  ok:       boolean;
  token:    string;
  username: string;
}

// ── Token storage ──────────────────────────────────────────────────────────────
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<AuthResult> {
  const resp = await fetch(`${FUNCTIONS_BASE}/wheelsys-auth`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  });
  const data = await resp.json() as { ok?: boolean; token?: string; username?: string; error?: string };
  if (!resp.ok || !data.ok || !data.token) {
    throw new Error(data.error ?? `Erreur ${resp.status}`);
  }
  storeToken(data.token);
  return { ok: true, token: data.token, username: data.username ?? username };
}

export async function logout(): Promise<void> {
  clearToken();
}

// Décode le token localement (pas d'appel réseau — le token embarque username + exp)
export function getMe(): { username: string } | null {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const dot     = token.lastIndexOf('.');
    const data    = token.slice(0, dot);
    const payload = JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/'))) as {
      username: string;
      exp:      number;
    };
    if (payload.exp < Date.now()) { clearToken(); return null; }
    return { username: payload.username };
  } catch { clearToken(); return null; }
}

// ── Report ─────────────────────────────────────────────────────────────────────
export async function loadReport(params: {
  dateRange: string;           // "2026-06-01|2026-06-30"
  station?:  string | null;    // null = toutes agences
}): Promise<ReportData> {
  const token = getStoredToken();
  if (!token) throw new Error('Non authentifié.');

  const resp = await fetch(`${FUNCTIONS_BASE}/wheelsys-report`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ dateRange: params.dateRange, station: params.station ?? null }),
  });

  if (resp.status === 401) {
    clearToken();
    throw new Error('SESSION_EXPIRED');
  }
  if (!resp.ok) {
    const err = await resp.json() as { error?: string };
    throw new Error(err.error ?? `Erreur ${resp.status}`);
  }
  return resp.json() as Promise<ReportData>;
}

// ── Exemptions (localStorage — logique identique à l'app Vanilla) ─────────────
export const CAUTION_EXEMPTIONS_KEY = 'wheelsys_caution_exemptions';
export const DEPART_EXEMPTIONS_KEY  = 'wheelsys_depart_exemptions';

export function itemExemptKey(item: ContractItem): string {
  return item.clientEntityId
    ? String(item.clientEntityId)
    : 'name_' + (item.client ?? '').replace(/[^a-zA-Z0-9]/g, '_');
}

export function getExemptions(storageKey: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, string>; }
  catch { return {}; }
}

export function addExemption(storageKey: string, item: ContractItem): void {
  const ex = getExemptions(storageKey);
  ex[itemExemptKey(item)] = item.client ?? '';
  localStorage.setItem(storageKey, JSON.stringify(ex));
}

export function removeExemption(storageKey: string, key: string): void {
  const ex = getExemptions(storageKey);
  delete ex[key];
  localStorage.setItem(storageKey, JSON.stringify(ex));
}

export function clearExemptions(storageKey: string): void {
  localStorage.removeItem(storageKey);
}

export function filterActive(items: ContractItem[], storageKey: string): ContractItem[] {
  const ex = getExemptions(storageKey);
  return items.filter(r => !ex[itemExemptKey(r)]);
}

// ── Recalcul scores agence après exemptions cautions ──────────────────────────
// Quand un client est exempté de caution, son contrat ne doit plus être
// compté dans les défauts caution → cautionOk++ avant recalcul des taux.
export function adjustAgenceStats(stats: AgenceScore[], exemptedItems: ContractItem[]): AgenceScore[] {
  if (!exemptedItems.length) return stats;
  const extra: Record<string, number> = {};
  exemptedItems.forEach(r => {
    extra[r.stationCode] = (extra[r.stationCode] ?? 0) + 1;
  });
  return stats.map(a => {
    const e = extra[a.code] ?? 0;
    if (!e) return a;
    const newCautionOk = a.cautionOk + e;
    const tauxCaution  = a.total > 0 ? newCautionOk / a.total : 1;
    const scoreGlobal  = parseFloat((0.5 * tauxCaution + 0.5 * a.tauxDepart).toFixed(4));
    return { ...a, cautionOk: newCautionOk, tauxCaution, scoreGlobal };
  });
}
