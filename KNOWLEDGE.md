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
corporatecodeid     ⚠️ PAS un entityId (voir correction D-026 ci-dessous)
drivercodeid        ⚠️ PAS un entityId (voir correction D-026 ci-dessous)
```

⚠️ **CORRECTION D-026 (2026-07-19)** : `corporatecodeid`/`drivercodeid` (et
l'équivalent `partner_codeid` sur `invoicesauditreport`, §4.1ter) ne sont
**PAS** le véritable `entityId` interne wheelsys utilisé dans les URLs
`manage/master/*.aspx?entityId=`. C'est le **numéro de compte affiché** dans
l'en-tête wheelsys ("Corporate Customer - **1457**", "Individual Renter -
**1211**") — une numérotation totalement différente et indépendante de
l'`entityId` réel (`corporate.aspx?entityId=`**69511**` / `driver.aspx?entityId=`**48836**`
pour ces deux mêmes clients, vérifié en direct). Construire un lien
`corporate.aspx?entityId=<corporatecodeid>` pointe donc vers "Record not
found" ou, par coïncidence numérique, vers la fiche d'un **autre client**.
✅ **Résolution branchée (D-027, 2026-07-19)** : `POST
/api/entities/globalsearch` (utilisé par la barre de recherche globale
wheelsys), **form-urlencoded** (pas JSON), corps `searchIndex=%<terme>%&exact=F`
(terme entouré de `%`, recherche floue). Renvoie `{Id, Domain, DisplayValue,
EntryType}` où `Id` est le vrai `entityId` et `EntryType` (`"Driver"` /
`"Corporate"` confirmés) indique `driver.aspx` vs `corporate.aspx`. Contrat
confirmé en direct par Julien (capture DevTools sur sa session). Implémenté
dans `api/resolve-client.js` (nouvel endpoint dédié), branché dans
`clientLink()`/`openClientInWheelsys()` (`index.html`) : clic sur un nom
client dans Stats → résout l'entityId → ouvre la vraie fiche wheelsys dans un
nouvel onglet. Lecture aussi confirmée : `POST partner.aspx/getPartnerInfo`
avec `{tenantId:387, partnerId:"<entityId>"}` → 200. Écriture (champ "Credit
rating" = `corporateCreditRating_combo`, confirmé) volontairement **non
automatisée** : c'est un postback ASP.NET à ~100 champs, jugé trop fragile —
Julien a choisi l'approche assistée (on ouvre la fiche, lui/son équipe modifie
et sauvegarde dans wheelsys). Détail complet : DECISIONS.md D-027.

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

### 4.1ter Champs facture — `custinvoice`/`agentinvoice` (rentalagreementfinancials) et rapport `invoicesauditreport` ✅ VALIDÉ 2026-07-19 (D-025)

> Découvert en corrigeant le bug CA facturé D-024/D-025 — voir DECISIONS.md D-025
> pour le détail complet du bug et de la correction.

**`rentalagreementfinancials` — champs facture non documentés avant** (présents
sur chaque contrat, `dddf#dt`/`mtdtype` quelconque) :
```
custinvoice    liste de numéros de facture du contrat, séparés par virgule
               (ex. "INV-208077,INV-208978,...,CRE-1138841") — un contrat
               facturé une seule fois n'a qu'un seul token ; un contrat à
               facturation périodique (LLD, longue durée) peut en avoir des
               dizaines sur sa durée de vie. Le préfixe CRE- = avoir, pas une
               facture. Vide pour les réservations sourcées par un agent/broker.
agentinvoice   même format, peuplé à la place de custinvoice quand le contrat
               est sourcé par un agent/broker (bookingsourcecode VIR/OPT/COM
               observés) — la facture va à l'agent, pas au client direct.
invoices       présent mais vide sur tout l'échantillon observé (~18 lignes) —
               usage inconnu, probablement lié à un scénario non rencontré
               (grouprental ?).
```
⚠️ Ces deux champs donnent une liste de références mais **pas le montant par
facture individuelle** — insuffisants seuls pour calculer un CA facturé exact
par période sur un contrat multi-facturation (`netcharge`/`custcharge` restent
le total cumulé du contrat entier). Voir `invoicesauditreport` ci-dessous pour
la source qui donne le montant par facture.

**Rapport `invoicesauditreport`** (`/ui/reports/invoicesauditreport.aspx`,
jamais exploré avant, trouvé par Julien) — **vrai grand livre facture : une
ligne = une facture**, avec son propre montant et sa propre date d'émission.
Appel identique aux autres rapports (`GenerateReportData`,
`browser:"invoicesauditreport"`), seul filtre requis confirmé : `dddf#dt`
(`ftDateRange`) — pas besoin de `mtrtype`/`mtdtype`/`mtstationmode`. Pas de
filtre station (`edstations`) confirmé — à filtrer côté appelant sur le champ
`station` de la réponse si besoin.

Champs clés :
```
id                  identifiant interne de la facture
invoice             numéro affiché ("INV-218894" facture normale, "CRE-..." avoir)
docinfo             type de document — valeurs observées : "Rental Invoice",
                    "Adjustment Rental Invoice", "Adjustment Rental Credit Note"
                    (= avoir, netamount déjà négatif)
displaydocno        numéro de contrat ("RNT-XXXXX") — clé de jointure vers
                    rentalagreementfinancials
partner_name        nom client · partner_codeid  ⚠️ PAS l'entityId client,
                    voir correction D-026 §4.1 — c'est le numéro de compte
                    affiché ("Corporate Customer - 1457"), pas
                    `corporate.aspx?entityId=`. Confirmé non-nul aussi pour un
                    client particulier (ex. 1211 pour un "Individual Renter").
invoicedateclean    ✅ vraie date d'émission de CETTE facture (pas du contrat)
netamount           ✅ montant HT de CETTE facture (pas le cumulé du contrat)
tax1amount/tax2amount, total  TVA / montant TTC de cette facture
invoicepayment, balance   payé / restant dû sur cette facture
station/stationname       agence
plateno             véhicule
void, cancelling    booléens — à exclure du CA si vrai (aucune occurrence
                    observée sur l'échantillon testé, mais champs présents
                    pour cette raison)
```
✅ **Sommer `netamount` sur les lignes filtrées par `invoicedateclean` dans une
période donne le CA HT réellement facturé sur cette période** — y compris pour
les contrats multi-facturation, sans le bug de surestimation de D-024 (chaque
ligne ne compte que son propre montant, jamais le cumulé du contrat). Les
avoirs (`netamount` négatif) s'additionnent naturellement, pas besoin de
logique de soustraction séparée.

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
| 2026-06-25 | Moteur plan de flotte (D-009) codé en fonctions pures + 40 tests offline (node:assert, 0 dépendance) verts avant tout réseau | Logique métier validée sans wheelsys |
| 2026-06-25 | Smoke test live OK : `vehiclelistreport` via backend-pilotage → 468 présents in-scope (réf §10 = 472), PL 1 exclu, sansDate 0 ; filtres « Date basis » + `edstations:null` confirmés | Bloc 4 validé bout-en-bout |
| 2026-06-25 | Sandbox Cowork ne joint pas `wheelsys.io` (curl → 000) → smoke test live à exécuter en local par Julien | Pattern : séparer moteur testable / IO réseau |
| 2026-06-25 | Alertes plan de flotte : nombreux `joursRestants < 0` (véhicules présents au-delà de leur sortie théo) → distinguer « dépassé » vs « à venir » | Évite une liste « prochaines sorties » trompeuse (affiche 2021) |
| 2026-06-25 | `backend-pilotage` est un **dépôt git séparé** (GitHub `wheels-backend-pilotage`) ; le code métier se commit LÀ, pas dans le repo parent | Le `git add .` du parent n'enregistrait qu'un gitlink (mode 160000), pas les fichiers |
| 2026-06-25 | Git depuis le sandbox sur le mount OneDrive = non fiable (impossible de supprimer `index.lock`, `unknown index entry format`) → faire les opérations git côté Windows | Évite stale locks et corruption d'index ; le sandbox sert au code/tests, pas au git du parent |
| 2026-06-30 | Cockpit décision : `reco.js` (SORTIR/PROLONGER/SURVEILLER, âge×utilisation, seuil 70 %) + KPIs € → passe du listing à l'aide à la décision (79 tests offline verts) | Niveau d'ambition relevé (Niveau 3-4) |
| 2026-06-30 | Base Flotte (SharePoint, 62 col, 512 « En parc ») fournit la finance absente de wheelsys ; join par plaque validé (FD-780-TN) | Débloque l'éco réelle des décisions (résiduelle, capital, contrat) |
| 2026-06-30 | **PIÈGE Cowork** : le mount OneDrive sert des versions TRONQUÉES des fichiers JS juste après édition → tester via reconstruction `/tmp` (heredoc), jamais via `cp` du mount | Évite des faux « SyntaxError: Unexpected end of input » |
| 2026-06-30 | Sandbox Cowork = **aucun accès réseau externe** (wheelsys, Railway, SharePoint tous injoignables → curl 000 / timeout) → tout test réseau se fait côté user | Cadre la stratégie de validation (pur offline + smoke local) |
| 2026-06-30 | Base Flotte a une plage Excel gonflée (1 048 434 lignes) → SheetJS avec `sheetRows` borné (sinon timeout) | Parsing xlsx fiable côté backend |
| 2026-07-13 | App Azure `wheels-report-graph` créée par Xefi avec **Sites.Selected** (pas Sites.Read.All) + droit `read` accordé sur site Comptabilite via `New-MgSitePermission` — GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET renseignés dans `.env` local | D-012 mis à jour ; aucun changement code requis, mais premier test live non encore fait — voir `test/smoke-finance.js` |
| 2026-07-13 | Smoke test live OK (520 véhicules en parc mappés). Mais `coutDetentionMensuel` ("Cout de détention mensuel") = 0 sur 519/520 véhicules en parc — colonne réalisée, renseignée seulement après sortie du véhicule. Fallback existant `?? echeanceMensuelleHT` dans `toPlanItem` (planFlotte.js) ne se déclenchait jamais car `??` ne tombe pas sur `0` (seulement null/undefined) | **Bug silencieux corrigé** : `coutMensuelSortir` et `coutMensuel` par véhicule étaient quasi toujours à 0 pour le parc actif. Fix : traiter `0` comme absent pour ce champ précis, fallback vers `echeanceMensuelleHT`. Confirmé par Julien (colonne "AA" échéance mensuelle HT). Test de non-régression ajouté (`planFlotte.test.js`, 39/39 verts) |
| 2026-07-13 | Fichier Base Flotte a **deux colonnes** "Cout de détention" : "...théorique mensuel hors frais financier" (peuplée, parc actif) vs "Cout de détention mensuel" (vide/0, parc actif — réalisée post-sortie) | Piège de nommage à connaître si la Compta modifie encore ce fichier — vérifier l'en-tête exact avant tout mapping de colonne financière |
| 2026-07-14 | Cockpit UI v2 livré dans `wheelsys-reporting/index.html` (onglet "🎯 Cockpit flotte", ex-"Plan de flotte") : table unifiée sur `fileActions`/`tousVehicules` avec badges action/urgence, KPIs €, filtres dropdown (agence/classe/action/urgence) combinables avec la recherche texte existante, tri toutes colonnes, export Excel. Moteur de tri/filtre générique (`initSortableTable`) étendu avec `dropdownFilters` — rétrocompatible (les 4 autres onglets ne l'utilisent pas, comportement inchangé, vérifié par relecture) | Cockpit décisionnel opérationnel sans nouvelle dépendance (toujours vanilla JS + XLSX déjà chargé) |
| 2026-07-14 | **Piège Cowork confirmé à nouveau** : lecture bash (`cat`/`tail`/`wc -l`) du mount OneDrive juste après un Edit renvoie un contenu tronqué/périmé, alors que l'outil `Read` et `git status`/`git diff` (qui touchent le vrai fichier) voient la version à jour. Le sandbox ne peut de toute façon pas ouvrir de navigateur → validation faite via (1) relecture complète par `Read`, (2) `git status` confirmant le fichier modifié, (3) tests Node isolés des fonctions pures (mapping, filtres, helpers) sur données représentatives — 15/15 verts | Ne jamais conclure à un bug depuis une lecture bash du mount juste après édition ; re-vérifier via `Read` ou `git diff` d'abord |
| 2026-07-14 | **Cockpit vide en prod (tout à 0)** : cause = backend Railway déployé restait sur le commit `12e04eb` (25/06, dates seules) — `reco.js`/`finance.js`/`graph.js`/`financeSource.js` et le fix `coutDetentionMensuel` n'avaient jamais été commités/poussés (`git status` les montrait `??`/modifiés depuis le 25/06). Pas un bug du cockpit v2 : dégradation gracieuse correcte (`—` sur champs absents) | Avant de diagnostiquer un souci de données sur le cockpit, vérifier `git log --oneline -3` côté backend-pilotage ET la version réellement déployée sur Railway |
| 2026-07-14 | Cockpit déployé mais finance à 0 partout : `financeDisponible=false` côté réponse `/api/plan-flotte` (dégradation propre déjà prévue) — cause probable = variables `GRAPH_*`/`FINANCE_SHARE_URL` absentes sur Railway (mises seulement en local pour le smoke test). Ajout d'un bandeau d'alerte dans le cockpit quand `financeDisponible`/`utilisationDisponible` est faux, pour ne plus jamais deviner ce genre de panne | Toujours vérifier les variables d'env **du service déployé**, pas seulement le `.env` local, avant de conclure à un bug de calcul |
| 2026-07-14 | Table cockpit à 15 colonnes = scroll horizontal forcé pour voir les colonnes finance. Fix : Catégorie/Groupe repliés en sous-texte sous Classe, Type de contrat replié sous Coût/mois (12 colonnes visibles), colonne Plaque figée (`position:sticky`) pendant le défilement — classe CSS dédiée `.tbl-sticky-col1`, scopée au seul tableau cockpit (pas de risque sur les 4 autres onglets) | Rappel UX : une table avec beaucoup de champs gagne à replier les champs secondaires en sous-texte plutôt qu'en colonnes séparées |
| 2026-07-14 | **`backend-pilotage` sous OneDrive = lock Git à répétition** (`index.lock` puis `HEAD.lock`, "File exists") pendant commit/push, même OneDrive mis en pause — cause probable : 2 process "Git for Windows" restés actifs (visibles Gestionnaire des tâches) tenant le lock. Résolu en tuant ces process puis `del .git\HEAD.lock` (cmd, pas PowerShell — `Remove-Item` n'existe qu'en PowerShell) | Si commit/push échoue en boucle sur un lock : vérifier Gestionnaire des tâches pour des process `git.exe`/`Git for Windows` résiduels à tuer avant de re-supprimer les fichiers `.lock` ; confirmer le shell utilisé (cmd vs PowerShell) avant de donner une commande |
| 2026-07-19 | `clientLink()` (index.html) existait déjà mais n'était appelé nulle part (code mort depuis sa création, cf. §19) — réutilisé tel quel pour l'onglet Stats clients (D-023) au lieu d'écrire un nouveau helper | Toujours grep les helpers existants avant d'en écrire un nouveau — celui-ci faisait déjà exactement ce qu'il fallait |
| 2026-07-19 | QA de l'onglet Stats faite en injectant un jeu de données synthétique dans la console du Browser pane (mock `allRaw`/`impaye`, `renderStats()` appelé directement) plutôt qu'un vrai login wheelsys (identifiants non disponibles en sandbox) | Pattern réutilisable : pour tester visuellement une vue qui consomme `json.allRaw`/`json.impaye`, pas besoin d'un vrai backend — injecter des données synthétiques directement dans les fonctions `render*()` suffit |
| 2026-07-19 | Catalogue des 82 rapports wheelsys capturé via Claude in Chrome (session déjà connectée de Julien) en lisant directement le DOM du menu Reports (`ul.dropdown-menu.multi-level`, 9ᵉ élément = catégories Reports) plutôt qu'en cliquant chaque sous-menu un par un — 100 % lecture, aucun rapport exécuté | Voir `wheelsys-reports-catalog.md` (racine projet). Piège : le menu contient AUSSI une copie mobile (`mm-list.mm-panel`, offcanvas) avec les mêmes liens dupliqués — dédoublonner par slug `browser` (regex sur le `.aspx`) plutôt que par position DOM |
| 2026-07-19 | Dans le Browser pane (fichier `file://` hors dossier projet, rendu en "static snapshot"), `getBoundingClientRect()`/`offsetWidth` sur des éléments peuvent renvoyer des valeurs fausses (ex. 40px de large pour une tuile visiblement large à l'écran) alors que la capture d'écran montre le bon rendu | Ne jamais diagnostiquer un bug de mise en page depuis une mesure JS (`getBoundingClientRect`) dans ce sandbox sans la confirmer par une capture d'écran — la capture est la seule source fiable pour la mise en page dans cet environnement |
| 2026-07-19 | D-024 : Julien a demandé le "CA facturé" (pas checkout) — a révélé que le commentaire existant sur `mtdtype=1` ("date de création du contrat") contredit KNOWLEDGE.md §4.1 ("invoice"). Utilisé quand même sur sa demande explicite, mais flaggé comme non validé (bandeau permanent dans l'UI) | Une ambiguïté déjà présente dans la doc (ici depuis le tout début du projet) peut rester dormante des mois avant qu'une nouvelle feature la révèle — ne jamais la trancher silencieusement, toujours la signaler à l'utilisateur |

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
⚠️ `learn-2026-06-24.md` ne contient PAS la liste des 86 malgré ce que ce
paragraphe indiquait avant — seulement les 6 rapports approfondis cette
session-là (la liste brute n'avait jamais été sauvegardée). **Liste complète
et à jour (82 rapports, 9 catégories, capturée 2026-07-19 par lecture directe
du menu Reports)** : voir [`wheelsys-reports-catalog.md`](./wheelsys-reports-catalog.md)
à la racine du projet — inclut des pistes 👀 déjà repérées pour compléter
D-025 (`uninvoicedrentalchargesreport`, `accruedrevenuereport`,
`monthlyrentalrevenuereport`, `shortlongtermrevenueanalysis`).

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

## 11. Plan de flotte — moteur + validation live ✅ 2026-06-25

> Blocs 3 (Phase 9.3) et 4 (Phase 9.4) livrés. Code dans `backend-pilotage/`.

### Moteur (fonctions pures, testées offline)
- `src/lib/rules.js` : `classeVehicule(categoryname, cargroup)` (VP/VU/PL natif +
  fallback D-007), `dureeDetention` (VP 2 / VU 3), `isSeasonalCargroup`,
  `computeDateSortie(vehicle, {prolongerApresSaison})` (D-009 §4..§6),
  `isParcPresent(vehicle)` (status≠Defleeted & fleetexit null & in-scope).
- `src/lib/planFlotte.js` : `buildPlanFlotte(rows, {horizon, saisonnier, today})` →
  filtre présent, calcule sortie, trie, comptes `exclusPL`/`sansDateCalculable`,
  alertes ≤ horizon, synthèses `parClasse`/`parAgence`. Robuste `rows` vide/null.
- Tests : `test/rules.test.js` (20) + `test/planFlotte.test.js` (20), `node:assert`,
  zéro dépendance. **40/40 verts.**

### Route `GET /api/plan-flotte`
- Params : `horizon` (mois, défaut 12, borné 1..120), `saisonnier=off` désactive le
  report 15/09. Appel `vehiclelistreport`, plage « Date basis »
  `2010-01-01|<today+5ans>`. Réponse = sortie `buildPlanFlotte` + `scanRange`.

### Validation live (smoke test, 2026-06-25)
- Script `test/smoke-plan-flotte.js` (read-only, dotenv). **⚠️ Le sandbox Cowork ne
  joint pas `wheelsys.io` (curl → `000`) → smoke test à lancer en LOCAL** :
  `cd backend-pilotage && npm install && node test/smoke-plan-flotte.js`.
- Résultat réel : 1602 lignes brutes → **parcPresentInScope 468** · avecDate 467 ·
  **exclusPL 1** · sansDateCalculable 0 (réf §10 = 472, écart normal flotte évolutive).
  Filtres « Date basis » + `edstations:null` (filtrage in-scope serveur) **confirmés**.

### ⚠️ Piège relevé — « dépassé » vs « à venir »
Beaucoup d'alertes ont `joursRestants < 0` (véhicules présents bien au-delà de leur
sortie théorique, ex. 2021-02-18). Ce sont de vraies alertes (retard de défleet), mais
le tri « prochaines sorties » remonte du passé. **À faire (9.4bis)** : séparer bucket
`dépassé` (`joursRestants < 0`) et `à venir` (`0..horizon`), trier les prochaines sur
les positives. Décision à arrêter avec Julien (proposition D-010).

### Note env
`package.json` exige `node: 20.x` ; Julien tourne node 24 → warning `EBADENGINE`
inoffensif. Relâcher à `>=20` supprimerait le bruit.

---

## 12. Topologie des dépôts git ✅ 2026-06-25

| Dépôt | `.git` | Remote | Rôle |
|---|---|---|---|
| `Wheels Report/` (parent) | oui (branche `master`) | **aucun** | Conteneur local : docs (instructions/KNOWLEDGE/ROADMAP/DECISIONS), `wheelsys-reporting/`, `lovable-code/`, skills |
| `backend-pilotage/` | oui (branche `main`) | **GitHub** `julienolympic-dotcom/wheels-backend-pilotage` | Service Express plan-flotte/pilotage → déploie Railway |

- **Règle** : le code de `backend-pilotage` se commit/pushe dans SON repo (`main`),
  pas dans le parent. Le parent ne fait que pointer (gitlink mode 160000) — à éviter
  d'utiliser pour versionner ce code.
- **Pièges OneDrive + sandbox** : `index.lock` parfois non supprimable (`Operation not
  permitted`), index parfois vu corrompu (`unknown index entry format`) côté Linux. →
  Faire les commit/push **sous Windows**. Réparer un index corrompu : `Remove-Item
  .git\index -Force ; git reset` (reconstruit depuis HEAD, ne touche pas les fichiers).
- **Hygiène parent** : pas de `.gitignore` racine à l'origine → `wheelsys-reporting/
  node_modules` avait été versionné. `.gitignore` racine ajouté le 2026-06-25 (node_modules,
  .env, logs, build, .vercel) ; purge via `git rm -r --cached wheelsys-reporting/node_modules`.

---

## 13. Cockpit décision de flotte + couche finance ✅ 2026-06-30

> Refonte « game changer » : du listing vers l'aide à la décision. Backend prêt
> (79 tests offline verts) ; UI cockpit v2 + setup Azure = à faire (voir ROADMAP).

### Moteur (backend-pilotage, fonctions pures testées)
- `src/lib/reco.js` — `recommander({joursRestants, utilperc}, {seuilUtil})` → D-011.
- `src/lib/planFlotte.js` (enrichi) — attache par véhicule : utilisation, reco,
  **finance** (résiduelle, capital/engagement restant, coût/mois, type contrat,
  `financeFlag` soldé/engagement) ; produit **KPIs** (parAction, loyer/jour,
  `capitalImmobiliseSortir`, `residuelleRecuperableSortir`, `coutMensuelSortir`,
  utilMoyenne — € en Decimal.js), **timeline** mensuelle, **fileActions** (tri score),
  **planGroupe** (agence×catégorie).
- `src/lib/finance.js` — `buildFinanceByPlate(rows)` : résolution tolérante des
  en-têtes (fichier manuel), filtre « En parc », clé plaque normalisée. Validé sur
  données réelles (512 vh).

### Source finance (SharePoint → Graph)
- `src/graph.js` — token app-only + `downloadSharedFile(shareUrl)` (encodage `u!` du
  lien de partage → `/shares/{id}/driveItem/content`).
- `src/financeSource.js` — fetch + `XLSX.read(buf, { sheetRows })` + cache 6 h.
- Route `/api/plan-flotte` : merge utilisation + finance en **best-effort**
  (`utilisationDisponible` / `financeDisponible` dans la réponse ; dégrade sans planter).
- **Env requis** (Railway) : `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
  (permission app `Sites.Read.All`, consentement admin), `FINANCE_SHARE_URL`.

### Base Flotte — schéma utile (fichier SharePoint Comptabilité)
- Clé : `N° immat.` (plaque). Filtre : `Etat du Parc` = « En parc » (≈512 ; « Sorti » 1586).
- Champs financiers : `type contrat CB LDD BB CC`, `Valeur achat HT`, `Valeur résiduelle`,
  `Echéance mensuelle HT`, `Cout de détention mensuel`, `Engagement Total restant`,
  `K Total restant`, `date sortie prévue (buy back ou LLD)`.

---

## 14. Fix cockpit v2 — garde horizon (D-014) + avdays + mise en page ✅ 2026-07-14

> Suite du retour utilisateur sur le cockpit v2 déployé (§13/D-013). Trois
> retours de Julien traités dans la même session : bug de recommandation
> (SORTIR trop tôt), doute sur un 0 % d'utilisation, mise en page (colonnes
> hors écran).

### Bug réel : SORTIR recommandé hors période de sortie
- **Repéré par Julien** : HL-431-TH, échéance théorique dans 657 j (véhicule
  tout juste entré en parc), utilisation 0 % → le cockpit affichait quand
  même **SORTIR**. `recommander()` (D-011) ne testait que `utilperc < seuil`,
  jamais la proximité réelle de l'échéance.
- **Fix** : garde `enPeriodeSortie` dans `reco.js` (D-014) — voir DECISIONS.md.
  `horizonJours` transmis par `buildPlanFlotte` (déjà calculé pour
  `alertesHorizon`, réutilisé sans nouveau paramètre).
- **Tests** : `reco.test.js` +5 cas, `planFlotte.test.js` +6 cas (véhicule
  synthétique P4 répliquant le cas réel).

### Correction d'une proposition erronée (rentals → avdays)
- J'avais proposé d'afficher `rentals` (nombre de locations) pour aider Julien
  à juger la fiabilité d'un 0 % d'utilisation. **Erreur** : si `utilperc = 0`,
  alors `rentals` vaut nécessairement 0 aussi (0 % = 0 jour loué = 0 location) —
  ça n'apporte aucune information supplémentaire. Le champ réellement utile est
  le **dénominateur** (`avdays`, jours disponibles sur la fenêtre) : un 0 % sur
  350 jours disponibles n'a pas le même poids qu'un 0 % sur 12 jours.
  Corrigé avant implémentation (cf. D-015). Leçon : vérifier la formule
  (numérateur/dénominateur) avant de proposer un champ de contexte, pas
  seulement son nom.

### Mise en page cockpit
- `main.tab-flotte-wide` (1800px, togglé dans `showTab()`) + barre de
  défilement horizontal dupliquée en haut (`syncTopScroll`, id `{table}-scrolltop`
  / `{table}-wrap`) — cf. D-015.
- Colonne "Catégorie" retirée du sous-texte Classe (doublon avec VP/VU) — ne
  reste que `cargroup`, plus granulaire.

### ⚠️ Piège environnement — troncature de fichiers via le mount OneDrive (sandbox)
En essayant de lancer `node test/planFlotte.test.js` via bash juste après l'avoir
édité (Edit **et** Write, y compris une réécriture complète), le fichier lu par
bash restait **tronqué à 11067 octets** systématiquement, coupant `test/
planFlotte.test.js` en plein milieu de la dernière ligne. Le tool `Read` voyait
le contenu complet et correct à chaque fois (source de vérité). Contrairement au
piège déjà documenté (§ pré-existant, lecture stale ponctuelle), ici la troncature
était **stable et reproductible**, y compris après une réécriture complète — pas
juste un délai de sync. Fichier plus petit (`reco.js`, `planFlotte.js`, copiés via
`cp`) : lus intégralement sans problème. Fichier HTML plus gros (`index.html`,
~74 Ko) : lu intégralement sans souci via un script Python. Cause exacte non
identifiée (peut-être liée au nombre de caractères multi-octets UTF-8 dans ce
fichier précis, ou à un état de cache OneDrive local à ce fichier) — **contournement
utilisé** : copier les fichiers source (`src/lib/*.js`, sans accents/emphase
UTF-8 lourde) dans `/tmp` et y exécuter une suite de vérification équivalente en
ASCII pur, pour valider la logique sans dépendre du mount. Les fichiers de test
officiels (`reco.test.js`, `planFlotte.test.js`) restent corrects sur disque
(vus via `Read`) ; **Julien doit les relancer lui-même** (`node test/reco.test.js`
+ `node test/planFlotte.test.js`, ou simplement `deploy.bat` qui les inclut) pour
confirmer le vert avant de pousser.

---

## 15. D-016 — Deuxième bug SORTIR : l'horizon d'affichage n'est pas une règle métier ✅ 2026-07-14

> Le fix D-014 (§14) était **insuffisant** : il gardait SORTIR indexé sur
> `horizonJours`, qui est l'horizon d'AFFICHAGE choisi par Julien (3 à 36 mois
> dans le menu du cockpit), pas une fenêtre de décision fixe. Avec un horizon
> large sélectionné, la garde D-014 s'annule d'elle-même — Julien a retrouvé
> HL-017-TH (655 j, 80 km) en SORTIR malgré le fix précédent.

### Leçon
Ne jamais confondre un **paramètre d'affichage/scoping** (ce que l'utilisateur
choisit de voir) avec une **règle de décision métier** (ce qui déclenche une
action). `horizonJours` sert à filtrer `alertesHorizon`/`fileActions` — c'est
légitimement variable. La décision SORTIR doit reposer sur une constante
métier fixe (ici 90 j) + un critère indépendant du temps (kilométrage), pas
sur un menu déroulant de l'UI.

### Fix D-016
- `reco.js` : `FENETRE_SORTIE_JOURS_DEFAUT = 90` (repris du seuil déjà utilisé
  pour la pastille orange « proche » de l'échéance dans `index.html`) +
  `SEUIL_KM_SORTIE_DEFAUT = 90000` (donné par Julien). SORTIR exige
  `utilperc < seuil` **ET** (proche de la fenêtre fixe **OU** km ≥ seuil).
- `planFlotte.js` : `toPlanItem` calcule `kmActuel` (déjà présent comme champ
  `km` de sortie) et le transmet à `recommander()` ; `horizonJours` retiré du
  chemin de décision (reste uniquement pour le filtrage d'affichage).
- Règle Julien (2026-07-14) sur sous-utilisation modérée : **miroir + alerte**,
  pas de réduction automatique de quantité — la justification textuelle
  suffit, la quantité recommandée reste le nombre de sorties prévues.
- Test de non-régression explicite : `buildPlanFlotte` avec `horizon: 36` ne
  doit **jamais** faire basculer un véhicule hors fenêtre fixe vers SORTIR —
  c'est exactement le bug qui s'est reproduit une première fois.

---

## 16. D-017 — Plan de renouvellement par catégorie ✅ 2026-07-14 (backend+front, non déployé)

> Vision `/legendary` → plan `/manager` (5 blocs) → exécuté dans la foulée du
> fix D-016. Nouveau moteur `renewalPlan.js` + intégration route + 3 blocs UI.

### Bloc 1 — `src/lib/renewalPlan.js` (`buildCategoryStats`)
- Groupe les véhicules (`tousVehicules`) par `classe|cargroup`.
- Par groupe : `rotation12Mois`/`rotationDetention` (moyennes Decimal.js),
  `coutMensuelTotal`/`caTotal`/`ratioCoutCA` (Decimal.js, annualisé,
  `null` si CA=0 — jamais Infinity/NaN), `sortiesPrevues`/`sortiesParMois`
  (miroir depuis `alertesHorizon`, indépendant de `reco.action`), `classable`
  (≥3 véhicules), `verdict` + `justification` traçable.
- `moyenneFlotte.ratioCoutCA` = agrégat réel (`Σcoût×12/ΣCA`), **pas** une
  moyenne des ratios par groupe.
- `top3Rotation`/`flop3Rotation` : classables uniquement, triés, max 3.
- **25 tests offline** (`test/renewalPlan.test.js`) : jeu de données à 5 groupes
  avec valeurs calculées et vérifiées via un script Node isolé avant écriture
  des assertions (éviter d'embarquer une erreur d'arithmétique à la main dans
  un test financier).

### Bloc 2 — Route `/api/plan-flotte`
- `fetchUtilLifetimeByPlate()` : même rapport `fleetutilizationreport`, fenêtre
  large (2010→aujourd'hui) au lieu de 12 mois glissants — **best-effort
  indépendant** (si ça échoue, seule `rotationDetention` est dégradée,
  `rotationDetentionDisponible: false` dans la réponse).
  utilLifetimeMap.
- `utilpercDetention` threadé dans `planFlotte.js` (`toPlanItem`) comme
  `avdays`/`utilperc` — même pattern, nouveau paramètre `utilLifetimeMap`.
- Réponse enrichie : `renouvellement` (sortie de `buildCategoryStats`),
  `rotationDetentionDisponible`.
- **`test/smoke-renewal-plan.js`** créé — **à lancer par Julien en local**
  (sandbox ne joint pas wheelsys.io) : compare `avdays` (fenêtre large) des
  10 véhicules les plus récemment entrés à leur nombre réel de jours de
  détention. Si `avdays` ≈ largeur de plage (des milliers de jours) au lieu
  de coller à la réalité → **hypothèse rejetée**, revoir l'approche avant de
  faire confiance à `rotationDetention` en prod. **Aucune garantie donnée
  tant que ce smoke test n'a pas tourné.**

### Bloc 3/4 — Frontend (`wheelsys-reporting/index.html`)
- Vignette « Prochaines sorties » (sélecteur 10/20/30, réutilise
  `tousVehicules` déjà trié par date — aucun refetch, juste un slice + rendu
  via `_flotteData` mis en cache après le premier chargement).
- Top 3 / Flop 3 catégories (mini-cartes, classe/cargroup/rotation×2/coût-CA/verdict).
- Tableau « Plan de commande » (`renouv-tbl`) — même moteur générique
  (`initSortableTable`) que les autres onglets : tri/filtre/recherche/export
  Excel gratuits, cohérent avec le reste du cockpit.
- Bandeau config si `rotationDetentionDisponible === false` (même pattern que
  finance/utilisation).
- CSS ajoutée : `.mini-card`/`.mini-card-row`/`.mini-card-top`/`.mini-card-sub`.

### ⚠️ Piège environnement (récurrent, cf. §14) — troncature bash sur `planFlotte.js`
Pendant cette session, `node test/planFlotte.test.js` a de nouveau échoué avec
une troncature à 8907 octets pile au même endroit (`aVenir: aler|`) que la fois
précédente — cette fois **persistante** (relancée après plusieurs secondes,
même résultat), alors que `Read` montrait un fichier complet et correct (206
lignes) et qu'une copie **recréée via heredoc bash** (pas `cp`, qui repasse par
le même mount) dans `/tmp` compilait et passait 47/47 tests sans problème.
Confirme : le mount OneDrive↔sandbox peut renvoyer une version tronquée d'un
fichier précis de façon stable sur toute une session, indépendamment de l'outil
utilisé pour le lire (`cat`, `wc`, `cp`, `node --check`) — seul un heredoc
écrivant directement le contenu (obtenu via `Read`) dans `/tmp` contourne le
problème. Toujours vérifier via `Read` avant de conclure à un bug réel, et ne
jamais bloquer la livraison sur un échec `node test/*.js` dans ce sandbox sans
avoir confirmé via `Read` que le fichier source est correct.

**Récidive 2026-07-16** : même symptôme sur `wheelsys-reporting/index.html`
(84 Ko) — troncature stable à 81580 caractères, coupant en plein milieu du
tableau `cols` de `initRenouvTable`, bien avant `</script></body></html>`
(confirmés présents et corrects via `Read`, lignes 1973-1975). Persistant sur
plusieurs tentatives (pas juste une lecture immédiatement après écriture).
Semble corrélé à la taille du fichier plutôt qu'à un fichier précis — les
petits fichiers (`reco.js`, `renewalPlan.js`) n'ont jamais été affectés cette
session, seuls les plus gros (`planFlotte.js` 206 lignes, `index.html` 1976
lignes) l'ont été. Hypothèse : buffer/chunk de sync à taille fixe côté mount.
Contournement : `Read` (tool) reste la seule source fiable pour les gros
fichiers dans ce sandbox ; ne pas utiliser `node --check`/`cat`/`wc` via bash
comme preuve d'un problème réel sur un fichier volumineux sans avoir d'abord
comparé au contenu vu par `Read`.

---

## 17. ✅ Incohérence dateSortie cockpit vs Excel — RÉSOLU 2026-07-16 (D-019)

> Signalé par Julien : HK-348-VV affiche une date de sortie cockpit
> (2026-11-30) très différente de la « date sortie prévue » du fichier Excel
> "Base Flotte" (~29/05/2026 d'après les données collées). Julien : *« le but
> est d'avoir des données fiables, si je me base sur des données fausses alors
> il est impossible de piloter correctement »*. **Pas encore résolu** — décision
> business en attente, voir ci-dessous.

### Cause racine confirmée par le code (certaine, indépendante de l'exemple)
- `buildPlanFlotte` → `toPlanItem` → `computeDateSortie` (`rules.js`, D-009)
  calcule `dateSortie` **uniquement** à partir de wheelsys : priorité à
  `vehicle.plannedexitdate`, sinon `fleetentry + 2 ans (VP) / 3 ans (VU)`.
- Le champ Excel `date sortie prévue (buy back ou LLD)` (§13, déjà résolu et
  mappé dans `financeByPlate[plaque].dateSortiePrevue`) est bien capturé côté
  finance mais **jamais lu** pour calculer `dateSortie` — il n'est même pas
  surfacé dans l'objet retourné par `toPlanItem`. Deux sources de date
  totalement indépendantes, jamais recoupées : c'est cela, et non un bug de
  calcul dans l'une ou l'autre formule, qui explique l'écart observé.

### Outil créé pour mesurer l'ampleur réelle
- `test/smoke-coherence-dates.js` (LECTURE SEULE) : pour chaque véhicule
  présent dans wheelsys ET dans le fichier Excel avec une `dateSortiePrevue`
  renseignée, compare la date cockpit (D-009) à la date Excel parsée
  (gère chaîne `DD/MM/YYYY`, numéro de série Excel, ou `Date`). Classe
  OK (écart ≤ 30 j) / DIVERGENT (> 30 j) / EXCEL_NON_PARSABLE, imprime le
  détail du cas HK-348-VV et un taux de divergence global.
- **À lancer par Julien** (`node test/smoke-coherence-dates.js` depuis
  `backend-pilotage/`) avant toute décision — permet de savoir si le problème
  est isolé (contrat renégocié, Excel pas à jour pour ce véhicule) ou
  systémique (>10 % du parc comparable), ce qui change complètement la
  réponse à apporter.

### Décision (Julien, 2026-07-16) — voir D-019 pour le détail complet
Excel prime sur wheelsys quand `dateSortiePrevue` est renseignée pour le
véhicule ; wheelsys reste le repli quand Excel est absent. Implémenté dans
`rules.js#computeDateSortie` (nouveau paramètre `dateSortiePrevueExcel`,
bypass de l'ajustement saisonnier côté Excel) + `planFlotte.js` (thread le
`fin.dateSortiePrevue`, déjà normalisé en ISO par `finance.js#parseExcelDate`)
+ nouveau champ traçable `sourceDateSortie` (`'excel'|'wheelsys'|null`)
surfacé dans le cockpit (pastille) et l'export Excel. 100 tests (finance +
rules + planFlotte) passent, cas réel HK-348-VV couvert bout-en-bout.

## 18. ✅ D-020 : hiérarchie 3 niveaux, `plannedexitdate` (wheelsys) abandonné — RÉSOLU 2026-07-16

> Julien, suite à D-019 : pour la majorité des véhicules sans `dateSortiePrevue`
> Excel, une source plus fiable que la règle générique était inutilisée : la
> colonne Q "Nbre de mois de financement prévu". Verbatim : *« pour les VU la
> durée max de détention est de 36 mois il faut donc indiquer en date de
> retour la date de réception en parc + 36 mois. […] hiérarchie : évite les
> replis sur wheelsys car les données ne sont pas fiables concernant ces
> dates. on reste sur 1 puis 2 et en dernier la règle des VP 2 ans et VU 3 ans »*.

### Décision — voir D-020 pour le détail complet
Hiérarchie à 3 niveaux dans `rules.js#computeDateSortie` : (1) Excel
`dateSortiePrevue` exacte (inchangé D-019) → `sourceDateSortie: 'excel'` ;
(2) `fleetentry` + `dureeFinancementMois` Excel (colonne Q), plafonnée à la
durée max de classe → `'excel_duree'` ; (3) repli générique classe (VP 24 mois
/ VU 36 mois depuis `fleetentry`, comportement D-009 historique) → `'wheelsys'`.
**`vehicle.plannedexitdate` n'est plus jamais lu**, à aucun tier — changement
de comportement plus large que D-019, puisque même les véhicules dont la date
wheelsys semblait juste peuvent désormais afficher une date différente.

### Point à confirmer par Julien
Le plafond de classe au tier 2 (VP 24 mois) est une extension par symétrie de
la règle qu'il a énoncée explicitement pour les VU (36 mois) — pas une valeur
qu'il a confirmée mot pour mot pour les VP. À valider à la relecture.

### Tests
`rules.test.js` — 9 cas D-009 réécrits (3 dépendaient de `plannedexitdate`,
fixtures conservées avec une valeur volontairement différente pour prouver
qu'elle est ignorée) + 11 cas D-020 (tier 2, plafond VU/VP, saisonnier au
tier 2, repli si durée 0/négative/NaN/absente, priorité tier 1). `finance.test.js`
— +5 cas (résolution d'en-tête colonne Q, parsing, absence, placeholder).
`planFlotte.test.js` — 2 cas D-018/D-019 pré-existants corrigés (dates
recalculées suite à l'abandon de `plannedexitdate`), fixture P5 ajustée pour
conserver l'intention du test D-016 original, + 2 cas D-020 bout-en-bout.
118 tests passent au total (rules 36 + finance 26 + planFlotte 56).

---

## 19. Onglet "Stats clients" — top clients par CA/agence ✅ 2026-07-19 (D-023)

> 100 % frontend, aucun nouvel appel réseau. Détail complet des choix : D-023.

- **Backend** : `api/report.js#mapRecord` expose un nouveau champ `caHT: r.netcharge`
  (D-003) en plus de `facture` (TTC). Seul ajout backend, non-cassant.
- **Frontend** (`wheelsys-reporting/index.html`) : nouvel onglet "📊 Stats clients"
  entre "Tous les contrats" et "🎯 Cockpit flotte" dans `ALL_TABS`. Alimenté par
  `renderStats(json.allRaw, json.impaye.items, from, to)`, appelé depuis
  `loadData()` en même temps que les autres rendus — pas de lazy-load (contrairement
  à Flotte), car aucune requête réseau supplémentaire n'est nécessaire.
- **Agrégation** : `computeStatsAggregation()` groupe `allRaw` par agence
  (`stationCode`) puis par client (`itemExemptKey`, identité = `clientEntityId`
  sinon nom normalisé — même fonction que les exemptions cautions/départs).
  Calcule par client : `caHT`, `caTTC`, `contrats`, `panierMoyen`, `pctAgence`
  (part du CA agence), `impaye` (croisé depuis `json.impaye.items`, indépendant
  de la période — 12 mois glissants), `objectif`/`progression` (localStorage).
- **Objectifs éditables** : `localStorage['wheelsys_stats_objectifs']` = `{ [clientKey]: montantObjectif }`.
  Jamais envoyé au backend, jamais mélangé à `caHT`/`caTTC` (D-023/D-019).
- **UI** : tuiles KPI animées (count-up), panneau "Aide à la décision" (texte
  généré depuis l'agrégation : concentration Pareto, croisement impayé, objectifs
  sous 70 %), grille de cartes par agence (podium top 3 animé + classement #4-N),
  tableau détaillé générique (`initSortableTable`, tri/filtre/recherche/export
  Excel — même moteur que les 5 autres onglets).
- **Lien client** : réutilise `clientLink(r)` (fonction pré-existante, jusqu'ici
  jamais appelée) → `corporate.aspx?entityId=${r.clientEntityId}`. Fonctionne
  pour les clients avec `clientEntityId` (corporate ou driver) ; sans entityId,
  affiche le nom en texte simple (pas de lien cassé).

### 19.1 D-024 — CA facturé (mtdtype=1), en-cours exclu, longue durée ⚠️ SUPERSEDÉ PAR D-025

> Conservé pour l'historique. L'approche `mtdtype=1` décrite ici s'est avérée
> **bugguée** (surestimation du CA sur les contrats multi-facturation) —
> corrigée le jour même par D-025 (§19.2 ci-dessous). Ne pas réimplémenter
> cette approche. Détail complet : DECISIONS.md D-024 et D-025.

- Approche initiale : `json.factureRaw` = `rentalagreementfinancials` filtré
  `mtdtype: '1'` (date de facturation), CA = somme de `caHT` sur les contrats
  clôturés. **Bug** : pour un contrat multi-facturation, chaque ligne renvoie
  le total cumulé du contrat entier, pas le montant de la facture tombant
  dans la période — surestimation massive. Voir D-025 pour le remplacement.

### 19.2 D-025 — Correction : `invoicesauditreport` (vrai grand livre facture) ✅ 2026-07-19

> Détail complet des choix : DECISIONS.md D-025. Champs du rapport : KNOWLEDGE §4.1ter.

- **`json.factureRaw` recalculé depuis `invoicesauditreport`** (plus
  `rentalagreementfinancials`/`mtdtype=1`) — une ligne = une facture réelle,
  montant et date propres à chaque facture. Mappé par `mapInvoiceRecord()`
  (nouveau, distinct de `mapRecord()`) : `{ id, invoice, docType, isCreditNote,
  contrat, client, clientEntityId, station, stationCode, invoiceDate, caHT,
  caTTC, balance, plateno, void, cancelling }`. Lignes `void`/`cancelling`
  éliminées côté backend ; filtre station appliqué côté backend (pas de
  `edstations` confirmé sur ce rapport).
- **Nouveau champ réponse backend `json.enCoursActuel`** — `rentalagreementfinancials`
  `mtrtype=2`/`mtdtype=2` sur une plage large fixe (2015-01-01 → aujourd'hui+2j),
  **indépendante du `dateRange` choisi** — capte les contrats encore actifs
  démarrés avant la période sélectionnée. 6ᵉ appel réseau parallèle dans
  `api/report.js`. Pas d'enrichissement client (délai paiement/caution), non
  pertinent pour cette vue.
- **`computeStatsAggregation(factureRaw, enCoursActuel, impayeItems)`** —
  nouvelle signature à 3 sources (au lieu de 2 en D-024). Plus de split
  Clôturé/En cours sur `factureRaw` (chaque ligne est déjà une vraie facture,
  les avoirs `isCreditNote` ont un `caHT` déjà négatif, sommer suffit). Le
  signal "longue durée en cours" (`STATS_LONGUE_DUREE_JOURS = 30`, inchangé)
  vient exclusivement de `enCoursActuel`, croisé par client via `itemExemptKey`
  — y compris pour les clients sans aucune facture sur la période
  (`enCoursSansFacture`, remontés uniquement dans le panneau "Aide à la
  décision", jamais dans le tableau classé puisqu'ils n'ont pas de CA à ranker).
- **`renderStats()` nouvelle signature** : `renderStats(factureRaw, enCoursActuel,
  impayeItems, from, to, opts)` — un paramètre de plus qu'en D-024.
- **"Nombre de factures" = vrai comptage** (`c.factures`, lignes `!isCreditNote`
  de `factureRaw`), plus le fallback "1 contrat = 1 facture" de D-024.
  `c.avoirs` compte les `CRE-` séparément ; `c.contrats` = nombre de contrats
  RNT- distincts facturés (`Set` sur `r.contrat`), exposé en sous-texte/export
  mais pas comme colonne triable principale (le tri se fait sur `factures`).
- **Regroupement mensuel** (période > 60 jours) : groupé par `invoiceDate`
  (vraie date de facturation, désormais disponible), plus par `checkoutdate`.

---
_Liés : [instructions.md](./instructions.md) · [ROADMAP.md](./ROADMAP.md)_
