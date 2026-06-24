# DECISIONS.md — Wheels Report

> Décisions techniques **arrêtées**. Ne pas réinventer. Format par entrée :
> décision · date · raison · alternatives écartées.

---

## D-001 — Persistance via Supabase (Postgres) dédié
- **Date** : 2026-06-06
- **Décision** : ajouter une base **Supabase dédiée** au projet (séparée de
  RentalCheck) pour historiser snapshots conformité, CA mensuel, objectifs et
  alertes. Région `eu-west-3` (Paris) — RGPD / données clients.
- **Raison** : le dashboard de pilotage exige de l'historique (semaine/semaine,
  mois/mois sur 3 ans) ; l'app actuelle est *stateless*. Projet dédié =
  isolation RLS, blast radius limité.
- **Écarté** : recalcul live (trop lent, pas d'alerte auto possible) ;
  réutiliser le projet RentalCheck (couplage indésirable des données).

## D-002 — Conformité = score combiné cautions + paiements départ
- **Date** : 2026-06-06
- **Décision** : la conformité d'une agence (seuil des 80 %) est un **score
  combiné**, calculé par agence et par **semaine ISO**, sur les check-outs de
  la semaine (`mtdtype=2`) :

  ```
  Taux_caution = cautions_ok / contracts_total      (pré-auth présente)
  Taux_depart  = depart_ok   / contracts_total      (custbalance <= 0,01)
  Score_global = (w_c · Taux_caution + w_d · Taux_depart) / (w_c + w_d)
  Pondérations par défaut : w_c = w_d = 0,50 (table settings, modifiable)
  Alerte si Score_global < seuil (0,80 par défaut, table settings)
  ```
- **Calcul** : Decimal.js (jamais de float). Stockage `numeric(5,4)`.
  Affichage arrondi à 1 décimale ; valeur brute conservée en base.
- **Limite connue** : tant que le délai de paiement par client (Phase 5) n'est
  pas disponible, `Taux_depart` porte sur **tous** les contrats, pas seulement
  ceux « dus au départ ». À raffiner quand l'endpoint sera capturé.

## D-003 — CA exprimé en HT ✅ RÉSOLU
- **Date** : 2026-06-06 (ouverte) → **2026-06-12 (résolue)**
- **Décision** : le CA de pilotage est exprimé en **HT**.
- **✅ VALIDÉ sur données réelles (2026-06-12)** :
  - Rapport `revenueperstationreport` → champ **`netamount`** = CA HT par
    agence. Vérifié arithmétiquement : `netamount + tax1amount + tax2amount
    = total` (ex. GJ : 191904,72 + 41042,77 + 0 = 232947,49 ✓ ; idem GR).
  - Rapport `rentalagreementfinancials` → champ **`netcharge`** = montant HT
    par contrat. Vérifié : `netcharge + chargetax1 + chargetax2 = custcharge`
    (ex. RNT-42852 : 435 + 87 + 0 = 522 ✓).
  - `chargeperday` (rapport `rentalagreementfinancials`) = `custcharge / days`
    → **TTC/jour**. Le RPD **HT** doit être calculé via `netcharge / days`
    (ne pas utiliser `chargeperday` brut pour le pilotage HT).
- **Interdit** : dériver un HT par `custcharge / 1,20` (TVA variable,
  exonérations, locations transfrontalières) — **devenu obsolète** : on
  dispose désormais des champs HT natifs (`netamount`, `netcharge`).

## D-004 — Compte de service wheelsys read-only pour l'automatisation
- **Date** : 2026-06-06
- **Décision** : un **compte wheelsys dédié read-only** (identifiants en
  variables d'env Vercel uniquement) permet au cron hebdo de produire les
  snapshots + alertes **sans utilisateur connecté**.
- **Raison** : les alertes email/Slack ne sont utiles que si automatiques.
- **Sécurité** : identifiants **jamais** en code/doc/log ; usage strictement
  en lecture. Revient en connaissance de cause sur la posture initiale
  « aucun credential serveur » (`instructions.md §8`) — périmètre limité au
  seul compte de service.

## D-005 — Horizons d'historique
- **Date** : 2026-06-06
- **CA mensuel** : backfill **36 mois**.
- **Conformité hebdo** : à partir du **01/01/2026**.

## D-006 — Diffusion des alertes : dashboard + email + Slack
- **Date** : 2026-06-06
- **Décision** : alerte < seuil diffusée sur 3 canaux — bannière **dashboard**,
  **email** (Resend, clé API en env), **Slack** (Incoming Webhook en env).
- **Anti-doublon** : une alerte par agence × semaine ISO (contrainte unique) ;
  `channels_sent` trace les canaux déjà notifiés.

## D-007 — Classification Utilitaire / Tourisme ✅ confirmé (Julien, 2026-06-12)
- **Date** : 2026-06-12
- **Décision** : classer une location en **Utilitaire** si `cargroup`
  commence par `U` **ou par `FR`** (ex. `U3`, `U4CAB`, `U5`, `U6`, `U8`, `U10`,
  `U12`, `U12A`, `U15`, `U15A`, `U20H`, `UB`, `UB2`, `UBD`, `UPV`, `FR3`,
  `FR6`), sinon **Tourisme** (ex. `A`, `A2`, `AA`, `B`, `BA`, `BE`, `C`, `CA`,
  `DA`, `DE`, `F`, `M`, `MA`, `US`, `YV`).
- Validé par Julien le 2026-06-12.

## D-008 — Type de client (RPD) : Pro vs Particulier ✅ confirmé (Julien, 2026-06-12)
- **Date** : 2026-06-12
- **Décision** : le RPD "par type de client" segmente **Professionnel** vs
  **Particulier** — PAS par `bookingsourcecode`.
- **✅ VALIDÉ** : wheelsys distingue nativement deux types de fiche client
  (menu Customers > New) : **"Individual Renter"** = Particulier et
  **"Corporate Customer"** = Professionnel. Sur `rentalagreementfinancials`,
  cela se traduit par `corporatecodeid` **non null** = Professionnel,
  `corporatecodeid` **null** = Particulier. `corporategroupname` (valeurs :
  `""`, `"Professionnel "`, `"Association"`) peut servir de sous-segmentation
  pro additionnelle si besoin.

## D-009 — Règle de date de sortie de flotte (module Plan de flotte / défleet)
- **Date** : 2026-06-24
- **Source** : Vehicle List Report (`browser:"vehiclelistreport"`, KNOWLEDGE §10).
- **Décision** : la date de sortie d'un véhicule présent se calcule ainsi
  (constantes **modifiables** dans `backend-pilotage/src/lib/rules.js`) :

  1. **Périmètre** : parc présent = `carstatus !== 'Defleeted'` **ET**
     `fleetexit == null`, agences in-scope SLV/GJ/NCE/GR. Catégorie **`PL` exclue**
     du plan (choix Julien 2026-06-24).
  2. **Classe VP/VU** : champ natif `categoryname` (VP/VU). Si **vide** → fallback
     D-007 (`cargroup` commence par `U`/`FR` = VU, sinon VP) (choix Julien 2026-06-24).
  3. **Durée de détention** : VP = **+2 ans** · VU = **+3 ans** (base `fleetentry`).
  4. **Date sortie théorique** : `plannedexitdate` **si présente** (fait foi),
     sinon `fleetentry + durée`.
  5. **Ajustement saisonnier** — indépendant VP/VU, **togglable**
     (`prolongerApresSaison`, **ON par défaut**) : pour
     `cargroup ∈ {U20H, FR3, FR5, FR6, 12F, M, MA}`, si mois(date théorique)
     ∈ avril→août (4..8) → sortie repoussée au **15 septembre de la même année**.
     S'applique **aussi** quand la date vient de `plannedexitdate` (choix Julien 2026-06-24).
  6. **Date sortie effective** = date ajustée (sinon théorique).
- **Dates** : ISO `T00:00:00` natif ; date-fns (`parseISO`/`addYears`/`format yyyy-MM-dd`),
  **jamais `parseISO` sur null** (guard `plannedexitdate`/`fleetexit`). Decimal.js
  réservé aux ratios (rotation), pas aux dates.
- **Rotation & reco** (Bloc 4) : taux mesuré sur la **durée de détention**
  (`fleetutilizationreport`, fenêtre entrée→aujourd'hui), agrégé par catégorie.
  Seuil **70 %** : ≥70 % → reconduction/augmentation · <70 % → revoir modèle/diminution.
  Horizon d'alerte **12 mois**.
- **Écarté** : VP/VU par préfixe cargroup seul (moins fiable que `categoryname`) ;
  saisonnier limité aux seules dates calculées (Julien veut prolonger aussi les
  `plannedexitdate` des catégories saisonnières).

### Table de cas limites (à vérifier au test — Bloc 3)
| Cas | categoryname | cargroup | fleetentry | plannedexit | Attendu (toggle ON) |
|---|---|---|---|---|---|
| VU planifié non saisonnier | VU | U3 | 2025-03-04 | 2028-12-30 | 2028-12-30 |
| VU non planifié | VU | UB | 2026-06-04 | null | 2029-06-04 (+3 ans) |
| VP non planifié | VP | CA | 2024-05-10 | null | 2026-05-10 (+2 ans) |
| Saisonnier calculé en été | VP | M | 2025-07-20 | null | théo 2027-07-20 → **2027-09-15** |
| Saisonnier sur date planifiée été | VU | FR6 | — | 2027-06-10 | **2027-09-15** (prolongé) |
| Saisonnier hors été | VU | U20H | — | 2027-11-03 | 2027-11-03 (inchangé) |
| Toggle OFF (saisonnier ignoré) | VP | 12F | 2025-06-01 | null | 2027-06-01 |
| PL | PL | — | — | — | **exclu** du plan |
| categoryname vide → fallback | (vide) | U4CAB | 2025-02-01 | null | VU → 2028-02-01 |

---
_Liés : [instructions.md](./instructions.md) · [KNOWLEDGE.md](./KNOWLEDGE.md) ·
[ROADMAP.md](./ROADMAP.md)_
