# KNOWLEDGE.md — Wheels Report

> Documentation **itérative** : ce qu'on apprend sur l'API wheelsys, le modèle
> de données et le métier. Mise à jour à chaque session.
> Convention : `✅ VALIDÉ` (vérifié sur données réelles) ·
> `⚠️ HYPOTHÈSE` (à confirmer) · `❓ INCONNU` (à investiguer).

---

## 1. Plateforme

- Produit : **Wheels Car Rental System** (`wheelsys.io` / `wheelsys.com`).
- Instance Julien : **`lutam.wheelsys.io`** ✅
- Cloud, multi-agences. Frontend ASP.NET Web Forms + AG Grid.
- **Pas de doc API publique.** Tout reverse-engineeré via console réseau.

---

## 2. Authentification ✅ VALIDÉ

| Élément | Valeur |
|---|---|
| Type d'auth | Cookies de session ASP.NET |
| Endpoint de login | `POST /sign-in/default.aspx?ReturnUrl=%2fui%2f` |
| Hidden fields requis | `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `FortNoxStateHidden`, `FortNoxStationHidden` |
| Champs credentials | `tbEmail_text` (email), `tbPassword_text` (password) |
| Bouton submit | `ctl00$coreBody$btnActualSignin` = `Sign-in` |
| Cookie de session | `.wheelsys` (longue chaîne hexadécimale) |
| Durée session | ~30 min wheelsys, 8h app (JWT signé) |
| Base URL rapports | `https://lutam.wheelsys.io/ui/reports/exreportpreview.aspx/GenerateReportData` |
| Redirect succès | HTTP 302 vers `/ui/` |

**Flow :** GET login page → parser VIEWSTATE → POST credentials → extraire cookies → utiliser pour tous les appels suivants.

---

## 3. Catalogue d'endpoints ✅ VALIDÉ (usage réel)

| # | Action métier | Méthode | URL (path) | Params clés | Champs réponse utiles |
|---|---|---|---|---|---|
| 1 | Rapport financier contrats | POST | `/ui/reports/exreportpreview.aspx/GenerateReportData` | `browser:"rentalagreementfinancials"`, filters | Voir §4 |
| 2 | Rapport pré-autorisations | POST | idem | `browser:"preauthorizations"`, filters | Voir §4 |
| 3 | Page contrat (ouvrir) | GET | `/ui/manage/master/rental.aspx?entityId={id}` | entityId | Page HTML complète |
| 4 | Page client corporate | GET | `/ui/manage/master/corporate.aspx?entityId={id}` | entityId | Page HTML complète |
| 5 | Dialog pré-auth (édition) | POST | `/ui/manage/master/payment.aspx/GetPaymentDialogInitData` | cacheKey, editval, rntpreauth, ptype=5 | Dialog init |
| 6 | Rapport CA par agence (HT/TTC) | POST | idem | `browser:"revenueperstationreport"`, filters | Voir §4.3 |
| 7 | Rapport utilisation flotte (rotation) | POST | idem | `browser:"fleetutilizationreport"`, filters | Voir §4.4 |

### Format appel GenerateReportData

```json
{
  "browser": "rentalagreementfinancials",
  "title": "...",
  "filters": "[{\"FilterName\":\"dddf#dt\",\"FilterType\":\"ftDateRange\",\"Value\":\"2026-06-01|2026-06-30\"}]"
}
```

Réponse : `{ "d": { "data": "[{...}]" } }` — tableau JSON stringifié.

---

## 4. Modèle de données ✅ VALIDÉ (champs réels)

### 4.1 Rapport `rentalagreementfinancials`

Filtres disponibles :
- `mtrtype` : `1`=fermés, `2`=actifs, `3`=tous
- `mtdtype` : `1`=invoice, `2`=check-out, `3`=check-in
- `mtstationmode` : `1`=check-outs, `2`=check-ins
- `dddf#dt` : plage de dates `"YYYY-MM-DD|YYYY-MM-DD"`
- `edstations` : filtre agence (null = toutes)

Champs clés de la réponse :
```
id                  entityId du contrat (= ?entityId= dans l'URL)
displaydocno        numéro contrat affiché (ex: "RNT-42564")
rano                numéro RA numérique
checkoutdate        date départ (ISO)
checkindate         date retour (ISO)
custcharge          montant facturé client
custpayments        montant payé client
custbalance         solde client (>0 = impayé)
cashpaid, cardpaid, chequepaid, bankpaid  détail modes de paiement
excess              franchise assurance (≠ caution/pré-auth !)
stationfromcode/name agence de départ
corporatecodeid     entityId du client corporate
drivercodeid        entityId du conducteur
```

⚠️ **PIÈGE MAJEUR** : `excess` = franchise assurance, PAS la caution réelle.
La caution réelle = pré-autorisation CB → voir rapport `preauthorizations`.

### 4.2 Rapport `preauthorizations`

Champs confirmés (2026-06-05) :
```
paymentdate         date de la pré-auth
status              statut (ex: "Pending")
preauthamount       montant de la pré-autorisation ✅
capturedamount      montant capturé
currency            devise
station             agence
customer            nom client
preauthno           numéro de pré-auth
cardtype            type carte
cardnomasked        numéro masqué
tokenized           booléen token
rental              numéro de contrat "RNT-XXXXX" ✅ (clé de jointure)
capturedon          date capture
releasedon          date libération
```

**Jointure** : `preauthorizations.rental` = `rentalagreementfinancials.displaydocno`

### 4.1bis Rapport `rentalagreementfinancials` — champs additionnels (CA HT / RPD / catégorie)

Capturés le 2026-06-12 (en plus de §4.1) :
```
netcharge           ✅ montant HT du contrat (netcharge + chargetax1 + chargetax2 = custcharge)
chargetax1/2        montants de TVA
chargeperday        custcharge / days → TTC/jour (≠ RPD HT, voir D-003)
cargroup            code groupe véhicule (ex: "U4CAB","B","A2"...) → base classification Utilitaire/Tourisme (D-007 ⚠️ hypothèse)
cargroupinv         idem cargroup (souvent identique)
categorycode        observé vide sur l'échantillon
days                durée du contrat (jours) — dénominateur RPD
accrueddays         jours "courus" (utile si contrat en cours)
bookingsourcecode   canal/type réservation (valeurs vues : WEB, WIN, VIR, BRO, OPT, COM) → piste "type de client" (D-007 ⚠️ à confirmer)
corporatecodeid / corporatename / corporategroupname  client corporate (groupe : "", "Professionnel ", "Association")
agentcodeid / agentgroupname  agent/apporteur si applicable
stationfromcode     agence de départ (clé d'agrégation par agence)
```

**RPD (revenue par jour) HT** = `netcharge / days`, agrégé par `bookingsourcecode`
(type client), `stationfromcode` (agence), et catégorie Utilitaire/Tourisme
dérivée de `cargroup` (D-007 ⚠️ hypothèse à confirmer).

### 4.3 Rapport `revenueperstationreport` ("Revenue per Station Report") ✅ VALIDÉ 2026-06-12

Filtres :
```json
[
  {"FilterName":"dddf#dt","ControlName":"rptdddfdt","FilterType":"ftDateRange","Required":true,"Value":"YYYY-MM-DD|YYYY-MM-DD","Caption":"Date"},
  {"FilterName":"edstations","ControlName":"rptedstations","FilterType":"ftStation","Required":false,"Value":null,"Caption":"Stations"}
]
```

Champs réponse (un enregistrement par agence) :
```
stationcode, stationname     code/nom agence
reccount                      nb contrats
chargerentalminusdiscount     CA location (hors options) net de remise
chargemileage, chargetransport, chargeinsurance, chargeextra,
chargedamage, chargefuel, chargesurcharge   compléments de CA par poste
netamount                      ✅ CA HT total agence
tax1amount, tax2amount         TVA
total                           CA TTC (= netamount + tax1amount + tax2amount, vérifié)
```

Agences observées (période 2026-05-01 → 2026-06-12) : GJ, GR, MG (hors
périmètre), NCE, SLV — couvre les 4 agences cibles (D-007 / instructions §2).

### 4.4 Rapport `fleetutilizationreport` ("Fleet Utilization Report") ✅ VALIDÉ 2026-06-12

Filtres (capturés) :
```json
[
  {"FilterName":"dddf#dt","ControlName":"rptdddfdt","FilterType":"ftDateRange","Required":true,"Value":"YYYY-MM-DD|YYYY-MM-DD","Caption":"Date basis"},
  {"FilterName":"edstations","ControlName":"rptedstations","FilterType":"ftStation","Required":false,"Value":null,"Caption":"Stations"},
  {"FilterName":"edgroups","ControlName":"rptedgroups","FilterType":"ftCarGroup","Required":false,"Value":null,"Caption":"Groups"},
  {"FilterName":"edownerships","ControlName":"rptedownerships","FilterType":"ftMemTypeMulti","Required":false,"Value":"","Caption":"Ownership"}
  // + pooltype, states, utilization (per day) — filtres additionnels tronqués, à recapturer si besoin
]
```

Champs réponse (un enregistrement **par véhicule**) :
```
id, plateno, vin             identité véhicule
cargroup                       code groupe (catégorie) → base Utilitaire/Tourisme (D-007)
station                         agence (clé d'agrégation)
avdays                          jours disponibles sur la période
rentals                         nb locations sur la période
rentdays / rentdays_            jours loués
utilperc                        ✅ taux d'utilisation (%) = rentdays/avdays *100
revenue                          CA généré par le véhicule sur la période (base TTC à confirmer, cohérent avec custcharge)
revenueondays_ / revenueonmins_ CA par jour / par minute
carmodel, carbrandname          modèle / marque
ownership, pooltype             type de détention / pool
carstatus                        statut courant (ex: "Rented (Broker)", "Available", "Grounded")
servdays                         jours en service/atelier
```

**Taux de rotation par catégorie/agence** = agréger `rentals` et `utilperc`
(moyenne pondérée par `avdays`) groupés par `cargroup` × `station`.

---

## 5. Logique des contrôles (validée)

### 5.1 Paiements départ
- Source : `rentalagreementfinancials` (plage choisie, date check-out)
- Anomalie : `custbalance > 0` → client n'a pas soldé le contrat
- Mode paiement détaillé : `cashpaid` / `cardpaid` / `chequepaid` / `bankpaid`

### 5.2 Cautions ✅ (fix en cours validation)
- Source : croiser `preauthorizations` (même plage) avec `rentalagreementfinancials`
- Anomalie : contrat sans ligne dans `preauthorizations` = caution absente
- Join : `preauthorizations.rental` ↔ `rentalagreementfinancials.displaydocno`
- ⚠️ Ne PAS utiliser `excess` pour détecter les cautions manquantes

### 5.3 Balances / impayés
- Source : `rentalagreementfinancials`, filtre `custbalance > 0`
- Groupement par client (`customer`) pour vue synthétique
- Tri par montant décroissant

---

## 6. Architecture app (wheelsys-reporting)

- **Frontend** : `index.html` static (Vanilla JS) — Vercel
- **Backend** : `api/report.js` (Node.js) — Vercel serverless
- **Auth** : identifiants wheelsys saisis à la connexion → cookie wheelsys embarqué dans JWT signé (`APP_SECRET`)
- **URL** : `https://wheelsys-reporting.vercel.app`
- **Env vars** : `WHEELSYS_TENANT`, `APP_SECRET`
- **Deploy** : `deploy.bat` → `npx vercel --prod`
- **Lien contrat** : `rental.aspx?entityId={r.id}` (entityId = champ `id` du rapport)

---

## 7. Pièges & vérifications

- `excess` ≠ caution : `excess` = franchise assurance, caution = pré-auth CB
- Lien URL contrat : `?entityId=` (PAS `?id=`) — sinon crée un nouveau contrat
- `preauthorizations` filtre par date de pré-auth (pas date checkout) → plage à harmoniser
- Date range format : `"YYYY-MM-DD|YYYY-MM-DD"` (pipe séparateur)
- Réponse GenerateReportData : `json.d.data` est un **string** JSON à parser
- Cookies ASP.NET : plusieurs cookies à fusionner (GET + POST login)
- Vercel `vercel.json` : utiliser `rewrites` (PAS `builds`) + `package.json` requis

---

## 8. Journal des apprentissages

| Date | Apprentissage | Impact |
|---|---|---|
| 2026-06-02 | Init projet. API sans doc publique. | Cadre tout le projet |
| 2026-06-02/05 | Instance = lutam.wheelsys.io. Auth ASP.NET VIEWSTATE. | Base de tout l'accès API |
| 2026-06-05 | `excess` ≠ caution réelle. Caution = pré-auth rapport `preauthorizations` | Fix majeur logique cautions |
| 2026-06-05 | Field `rental` (pas `ranumber`) pour jointure pré-auth/contrat | Fix matching cautions |
| 2026-06-05 | URL contrat : `?entityId=` requis (pas `?id=`) | Fix liens |
| 2026-06-05 | Vercel : `vercel.json` avec `builds` casse le routing API | Fix déploiement |
| 2026-06-12 | D-003 résolu : `netamount` (revenueperstationreport) et `netcharge` (rentalagreementfinancials) = CA HT, vérifiés arithmétiquement | Débloque tout affichage CA pilotage |
| 2026-06-12 | `fleetutilizationreport` donne rotation/utilisation par véhicule (`cargroup`, `station`, `utilperc`, `rentals`) | Base du module rotation par catégorie/agence |
| 2026-06-12 | RPD HT = `netcharge / days` (≠ `chargeperday` qui est TTC) | Évite une erreur de calcul RPD |
| 2026-06-12 | Classification Utilitaire/Tourisme par préfixe `cargroup` = "U" — ⚠️ hypothèse (D-007), à confirmer | Risque d'erreur de classification si non validé |
| 2026-06-24 | 86 rapports disponibles via `GenerateReportData` — catalogue complet découvert par browser automation | Ouvre 6+ nouveaux rapports exploitables |
| 2026-06-24 | `customerbalancereport` : 226 clients, champs `invoicedbalance`, `uninvoicedbalance`, `creditlimit` | Balance clients + détection dépassements crédit |
| 2026-06-24 | `unpaidrentalsreport` : 95 contrats impayés, champs `balance`, `duration`, `stationfrom`, `plateno` | Vue impayés plus riche que rentalagreementfinancials |
| 2026-06-24 | `paymentsjournal` : 639 paiements, champs `stationcode`, `username`, `cashamount`, `creditcardamount` | Contrôle de caisse par agence et agent |
| 2026-06-24 | `bookedvsrented` : 886 entrées, champs `totrescharge`, `totrntcharge`, `sourcecode`, `agentname` | Conversion résa/location et no-show |
| 2026-06-24 | Portage Deno : JWT via `crypto.subtle` (Web Crypto API), `Headers.getSetCookie()` dispo Deno 1.30+ | Pattern Edge Functions Supabase pour wheelsys |
| 2026-06-24 | Quand user dit "migrer vers Lovable" : clarifier ce qui migre (frontend/backend/API layer) avant de produire | Évite 2+ itérations de mauvaise direction |

---

## 8bis. Catalogue complet — 86 rapports wheelsys ✅ VALIDÉ 2026-06-24

Découverts par browser automation sur `lutam.wheelsys.io`.
Tous appelables via `GenerateReportData` avec le `browser` correspondant.
Filtre `dddf#dt` (date range) requis sur la plupart.

### Nouveaux rapports validés avec champs réels

#### `customerbalancereport` — Balance clients (226 clients)
```
id, codeid, name                    identité client
totalcharges, totalincome           charges vs revenus cumulés
invoicedbalance, uninvoicedbalance  balance facturée / non facturée
creditlimit                         limite de crédit accordée
lastinvoicedate, lastinvoicetotal   dernière facture
telephone, email, address, city     coordonnées
```
Filtres : aucun requis (retourne tout). Options : `edctype` (type client), `edbalstatus` (statut balance).

#### `unpaidrentalsreport` — Locations impayées (95 contrats)
```
id, displaydocno    numéro contrat
plateno             plaque véhicule
corporatename, drivername, agentname   parties prenantes
chargetotal, customertotal, credit, balance   finances
duration            durée location
stationfrom         agence de départ
corporatecodeid, agentcodeid, drivercodeid   entityIds
```
Filtre requis : `dddf#dt`.

#### `paymentsjournal` — Journal des paiements (639 entrées)
```
stationcode, stationname   agence
paymentdate                date du paiement
partnername                client/partenaire
rental, invoice            numéros de référence
cashamount, creditcardamount, chequeamount, bankamount, prepaidamount, totalamount
mopname                    nom du moyen de paiement
cardno                     numéro carte (masqué)
username                   agent qui a encaissé
posted                     booléen comptabilisé
```
Filtre requis : `dddf#dt`.

#### `periodincomereport` — Revenus par période (639 entrées)
```
entrydate, rnt_docno, resdocno, paymentdocno   références
partner_name, username, station
cash, creditcard, cheque, bank, commission      ventilation par mode
meansofpaymentcode
```
Filtre requis : `dddf#dt`.

#### `bookedvsrented` — Réservations vs Locations réelles (886 entrées)
```
resdocno, radocno       numéros résa / contrat
station, cargroup, cargroupres   agence et catégories
resduration, rntduration         durée résa vs location réelle
fullname                 client
totrescharge, totrntcharge       CA résa vs location
tmirescharge/tmirntcharge, insrescharge/insrntcharge, etc.   détail postes
resdatefrom, resdateto   dates réservation
sourcecode, brand, agentname     canal / marque / agent
```
Filtre requis : `dddf#dt` + `mtstationmode`.

#### `fleetutilizationreport` (§4.4 déjà documenté) — enrichissement champs réels
```
avdays       jours disponibles
rentdays_    jours loués (format normalisé)
carstatus    statut courant ("Available", "Rented (Broker)", "Grounded"…)
```

### Autres rapports identifiés (non encore explorés)
Voir `learn-2026-06-24.md` pour la liste des 86 avec leurs noms de `browser`.
Priorité suivante : `claimsreport`, `revenueperstationreport` (avec filtres complets), `salesperformancereport`.

---

## 9. Backend Pilotage (`/backend-pilotage`) — Phase 7.1 ✅ code créé 2026-06-12

Service Express dédié, lecture seule wheelsys (compte de service, D-004).
Non déployé — Julien fournira les credentials sur Railway et validera avant
mise en ligne. CORS ouvert (`*`). Toutes les agrégations en Decimal.js.

Paramètres communs : `from`, `to` (YYYY-MM-DD), validés via `src/lib/dates.js`
(400 si absents/invalides/`from > to`).

### 9.1 `GET /api/ca-par-agence`

Source : `revenueperstationreport`. CA HT = `netamount` (D-003).

```json
{
  "periode": { "from": "2026-06-01", "to": "2026-06-12" },
  "agences": [
    { "agence": "SLV", "nom": "...", "caHT": "12345.67", "caTTC": "14814.80", "nbContrats": 42 }
  ],
  "total": { "caHT": "...", "caTTC": "..." },
  "horsPerimetre": ["MG"]
}
```

### 9.2 `GET /api/rotation`

Source : `fleetutilizationreport`, agrégé par agence × catégorie (D-007).
`tauxUtilisation` = Σ`rentdays` / Σ`avdays` × 100 (moyenne pondérée).

```json
{
  "periode": { "from": "...", "to": "..." },
  "rotation": [
    { "agence": "SLV", "categorie": "Tourisme", "vehicules": 18, "rentals": 27, "tauxUtilisation": "62.4" }
  ]
}
```

### 9.3 `GET /api/rpd`

Source : `rentalagreementfinancials`, filtré `mtrtype=3` (tous), `mtdtype=2`
(date check-out). Agrégé par agence (`stationfromcode`) × type client
(`corporatecodeid`, D-008) × catégorie (`cargroup`, D-007). RPD HT =
Σ`netcharge` / Σ`days` (D-003 — jamais `chargeperday`). Contrats `days<=0`
ignorés.

```json
{
  "periode": { "from": "...", "to": "..." },
  "rpd": [
    { "agence": "NCE", "typeClient": "Particulier", "categorie": "Utilitaire", "contrats": 5, "rpdHT": "78.40" }
  ]
}
```

### ⚠️ À vérifier au premier test réel (avec credentials)
- Noms exacts des `FilterName` pour `rentalagreementfinancials` (`mtrtype`,
  `mtdtype`, `edstations`) et leur `FilterType` — repris par analogie avec
  §4.1, non re-capturés pour ce filtre combiné.
- `edstations: null` retourne-t-il bien toutes les agences (y compris MG) ou
  faut-il lister explicitement SLV/GJ/NCE/GR ?

## 10. Vehicle List Report — socle Plan de flotte / défleet ✅ VALIDÉ 2026-06-24

> Capturé sur session réelle `lutam.wheelsys.io` (1613 véhicules, plage 2020→2026).

- **Page UI** : `/ui/reports/vehiclelistreport.aspx` (AG Grid, filtres Telerik).
- **Endpoint data** : **identique aux autres rapports** →
  `POST /ui/reports/exreportpreview.aspx/GenerateReportData`,
  `browser:"vehiclelistreport"`. Réponse `d.data` = JSON stringifié (≈45 champs/véhicule).
- **Filtre requis** : `dddf#dt` (FilterType `ftDateRange`, libellé « Date basis »),
  `Value:"YYYY-MM-DD|YYYY-MM-DD"`. Optionnels : `edstations`, `edgroups`,
  `edownerships`, pooltype, states.
  - ⚠️ « Date basis » **obligatoire** (sinon erreur UI « At least one required
    field is missing: Date basis »). Une plage large (ex. `2020-01-01|2026-12-31`)
    renvoie **tout l'historique**, véhicules `Defleeted` inclus.

### Champs réels — clés pour le plan de flotte
```
id                entityId véhicule (→ rental/car aspx)
plateno           immatriculation (ex "HB-242-EC")
categoryname      ✅ VP / VU / PL NATIF (VP 1072 · VU 513 · PL 2 · vide 26)
                  → classification VP/VU directe, plus fiable que le préfixe cargroup
cargroup          code groupe (ex "U3","CA","UB","12F") → fallback D-007 si categoryname vide
stationcode       agence (in-scope SLV/GJ/NCE/GR ; hors-scope vus : GJ historique, VS, MG)
stationname       nom agence
carstatus         Defleeted / Available / Rented (Comptoir|Broker|Commercial|VIRTUO|OPTEAM) / Grounded
fleetentry        ✅ date d'entrée parc — ISO "YYYY-MM-DDT00:00:00" — JAMAIS null (0/1613)
plannedexitdate   ✅ date de sortie PLANIFIÉE wheelsys — ISO ou null (null 196/1613)
fleetexit         date de sortie RÉELLE — null tant que véhicule présent (null 550/1613)
ownership         code 1/2/3/4 (type de détention — mapping à confirmer)
pooltype          type de pool
firstlicensedate  date 1re mise en circulation · mileage km actuels
vin, modelname, carbrandname, colorname, modelyear, dailyrate, insuranceexpiry, fueltype …
```

### Définition « parc ACTUEL » (filtre métier validé)
Parc présent = `carstatus !== 'Defleeted'` **ET** `fleetexit == null`.
- Tout parc présent : **550** · in-scope (SLV/GJ/NCE/GR) : **472**
  (VP 248 · VU 206 · vide 17 · PL 1 — GJ 189 · NCE 161 · SLV 86 · GR 36).
- `plannedexitdate` présent : **392** · absent : **80** (→ règle entrée+durée).

### Implications moteur (Bloc 3 — D-009)
1. Appel `GenerateReportData browser="vehiclelistreport"` plage large, puis filtre
   parc présent côté backend (status≠Defleeted & fleetexit null).
2. Date de sortie = `plannedexitdate` si présente, sinon `fleetentry + durée`
   (VP +2 ans / VU +3 ans via `categoryname` ; fallback D-007 si vide ; PL → D-009).
3. Dates ISO `T00:00:00` → `parseISO` direct, **jamais sur null** (guard plannedexit/fleetexit).
4. Ajustement saisonnier (cargroups `U20H, FR3, FR5, FR6, 12F, M, MA`) appliqué
   par-dessus, indépendant VP/VU, togglable (D-009).

---
_Liés : [instructions.md](./instructions.md) · [ROADMAP.md](./ROADMAP.md)_
