# Migration Lovable — Guide technique

## Architecture cible

```
Lovable App (React)
        │
        │  fetch  (Bearer token)
        ▼
Vercel API  (wheelsys-reporting.vercel.app)
  ├── POST /api/auth    → login wheelsys, retourne JWT
  ├── GET  /api/me      → vérifie session
  └── POST /api/report  → données (cautions, départs, impayés, scores)
        │
        │  cookies ASP.NET
        ▼
wheelsys.io (lutam.wheelsys.io)
```

**Le backend Vercel NE CHANGE PAS de logique.** Seul l'auth passe de cookie → Bearer token.

---

## Variables d'environnement Vercel (inchangées)

```env
WHEELSYS_TENANT=lutam
APP_SECRET=<chaîne aléatoire, openssl rand -hex 32>
```

---

## 1. Login — `POST /api/auth`

**Request :**
```json
POST https://wheelsys-reporting.vercel.app/api/auth
Content-Type: application/json

{ "username": "email@lutam.com", "password": "motdepasse" }
```

**Response :**
```json
{ "ok": true, "token": "eyJ...", "username": "email@lutam.com" }
```

**Dans Lovable — stocker le token :**
```ts
const res = await fetch('https://wheelsys-reporting.vercel.app/api/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const { token } = await res.json();
localStorage.setItem('wls_token', token); // ou Zustand / Context
```

---

## 2. Vérifier la session — `GET /api/me`

```ts
const token = localStorage.getItem('wls_token');
const res = await fetch('https://wheelsys-reporting.vercel.app/api/me', {
  headers: { 'Authorization': `Bearer ${token}` },
});
if (!res.ok) { /* rediriger vers login */ }
const { username } = await res.json();
```

---

## 3. Charger les données — `POST /api/report`

**Request :**
```ts
const token = localStorage.getItem('wls_token');

const res = await fetch('https://wheelsys-reporting.vercel.app/api/report', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    dateRange: '2026-06-01|2026-06-30',  // "YYYY-MM-DD|YYYY-MM-DD"
    station: null,                         // null = toutes les agences, ou "NCE", "GJ"...
  }),
});
const data = await res.json();
```

**Response shape :**
```ts
{
  ok: true,
  tenant: "lutam",
  depart: {
    items: DepartItem[],  // contrats avec solde > 0 au départ
    total: number,        // nb total de contrats analysés
  },
  caution: {
    items: CautionItem[], // contrats sans pré-autorisation CB
    total: number,
  },
  impaye: {
    items: ImpayeItem[],  // soldes clients > 0 (12 mois glissants)
    total: number,
    from: string,
    to: string,
  },
  agenceStats: AgenceScore[],  // scores conformité par agence (D-002)
  stations: Station[],          // agences disponibles (pour le sélecteur)
  allRaw: ContractItem[],       // tous les contrats bruts (vue debug)
}
```

---

## 4. Types TypeScript

```ts
interface ContractItem {
  id: number;
  contrat: string;            // "RNT-42564"
  client: string;
  clientEntityId: number | null;
  checkoutdate: string;       // "2026-06-01T00:00:00"
  checkindate: string | null;
  facture: number;            // custcharge (TTC)
  paye: number;               // custpayments
  solde: number;              // custbalance (>0 = impayé)
  cash: number;
  carte: number;
  cheque: number;
  virement: number;
  excess: number;             // franchise assurance (≠ caution !)
  preauth: number;            // pré-autorisation CB (caution réelle)
  station: string;            // nom agence
  stationCode: string;        // code agence "NCE"
  statut: 'En cours' | 'Clôturé';
  paymentType: number | null;
  paymentDelay: number | null;
  creditLimit: number | null;
}

interface AgenceScore {
  code: string;
  nom: string;
  total: number;
  cautionOk: number;
  departOk: number;
  tauxCaution: number;    // 0.0 → 1.0
  tauxDepart: number;
  scoreGlobal: number;    // D-002 : 0.5 × caution + 0.5 × départ
}

interface Station {
  code: string;
  name: string;
}
```

---

## 5. Gestion des erreurs

| HTTP | Cause | Action Lovable |
|---|---|---|
| 401 | Token expiré ou invalide | Rediriger vers /login |
| 400 | dateRange manquant | Vérifier le formulaire |
| 500 | Erreur wheelsys / tenant | Afficher message + retry |

```ts
if (res.status === 401) {
  localStorage.removeItem('wls_token');
  router.push('/login');
}
```

---

## 6. Exemptions (localStorage — identique à l'app actuelle)

Les exemptions sont gérées **entièrement côté client** (pas d'API).

```ts
// Clé de stockage
const CAUTION_EXEMPTIONS_KEY = 'wheelsys_caution_exemptions';
const DEPART_EXEMPTIONS_KEY  = 'wheelsys_depart_exemptions';

// Structure : { [clientEntityId | "name_XXXXX"]: string (nom client) }

// Clé par item
function itemExemptKey(item: ContractItem): string {
  return item.clientEntityId
    ? String(item.clientEntityId)
    : 'name_' + (item.client || '').replace(/[^a-zA-Z0-9]/g, '_');
}

// Lire les exemptions
function getExemptions(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}

// Filtrer les items actifs
function filterActive(items: ContractItem[], storageKey: string) {
  const ex = getExemptions(storageKey);
  return items.filter(r => !ex[itemExemptKey(r)]);
}

// Recalcul scores agence après exemptions cautions
function adjustAgenceStats(
  stats: AgenceScore[],
  exemptedItems: ContractItem[]
): AgenceScore[] {
  if (!exemptedItems.length) return stats;
  const extra: Record<string, number> = {};
  exemptedItems.forEach(r => {
    extra[r.stationCode] = (extra[r.stationCode] || 0) + 1;
  });
  return stats.map(a => {
    const e = extra[a.code] || 0;
    if (!e) return a;
    const newCautionOk = a.cautionOk + e;
    const tauxCaution  = a.total > 0 ? newCautionOk / a.total : 1;
    const scoreGlobal  = parseFloat((0.5 * tauxCaution + 0.5 * a.tauxDepart).toFixed(4));
    return { ...a, cautionOk: newCautionOk, tauxCaution, scoreGlobal };
  });
}
```

---

## 7. Checklist migration

- [ ] Déployer le backend Vercel mis à jour (`deploy.bat`) — supporte désormais Bearer token
- [ ] Créer le projet Lovable
- [ ] Page `/login` : formulaire email/password → POST `/api/auth` → stocker token
- [ ] Hook `useAuth` : GET `/api/me` au démarrage, redirect si 401
- [ ] Hook `useReport(dateRange, station)` : POST `/api/report` avec Bearer token
- [ ] Onglet Paiements départ : afficher `data.depart.items`, bouton "Compte sur facture" (exemptions localStorage)
- [ ] Onglet Cautions : afficher `data.caution.items`, bouton "Pas de caution" (exemptions localStorage)
- [ ] Onglet Impayés : afficher `data.impaye.items` groupés par client
- [ ] Scores agence : afficher `data.agenceStats` avec recalcul exemptions
- [ ] Sélecteur agence : peupler avec `data.stations`
- [ ] Exports Excel (XLSX.js ou lib Lovable)

---

_Voir aussi : [KNOWLEDGE.md](./KNOWLEDGE.md) · [ROADMAP.md](./ROADMAP.md) · [DECISIONS.md](./DECISIONS.md)_
