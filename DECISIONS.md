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

## D-010 — Alertes plan de flotte : 2 buckets « dépassé » / « à venir »
- **Date** : 2026-06-30
- **Décision** : séparer les alertes en **dépassé** (`joursRestants < 0` — sortie
  théorique passée, véhicule encore présent) et **à venir** (`0 ≤ joursRestants ≤
  horizon`). Tri des « prochaines sorties » sur les positives uniquement.
- **Raison** : sans ça, la liste « prochaines sorties » remontait des dates de 2021
  (véhicules en retard de défleet). Implémenté côté UI (split client-side).

## D-011 — Moteur de recommandation de renouvellement (`reco.js`)
- **Date** : 2026-06-30
- **Décision** : recommandation par véhicule croisant **âge** (date D-009) et
  **utilisation réelle** (`fleetutilizationreport`, **12 mois glissants**, hypothèse
  explicite) contre un **seuil 70 %** (togglable) :
  - `utilperc ≥ seuil` → **PROLONGER** (encore productif)
  - `utilperc < seuil` → **SORTIR** (candidat renouvellement)
  - `utilperc` inconnu → **SURVEILLER**
  Urgence pilotée par le retard ; **score de priorité** = `retardMois·2 + sous-utilisation`.
- **Fonction pure `reco.js`**, testée. Écarté : reco basée uniquement sur l'âge
  (aveugle à la productivité).

## D-012 — Couche financière = Base Flotte (SharePoint) via Microsoft Graph
- **Date** : 2026-06-30 (mis à jour 2026-07-13 — permission réelle)
- **Décision** : enrichir le plan avec la réalité financière issue du fichier
  **« Base Flotte »** (SharePoint site Comptabilité), lu par le backend via
  **Microsoft Graph app-only** (secrets Railway, `FINANCE_SHARE_URL`).
  - **Jointure par plaque** (`N° immat.` ↔ `plateno`, normalisée alphanumérique).
  - **Filtre « En parc »** (≈512 vh) — exclut les 1586 « Sorti ».
  - **Colonnes retenues** : type contrat (CB/LLD/BB/CC), valeur achat HT, valeur
    résiduelle, échéance mensuelle HT, coût détention mensuel, engagement/capital
    restant, date sortie prévue (buy back/LLD).
  - Snapshot manuel → **cache 6 h**, jamais présenté comme « live » strict.
- **✅ MIS À JOUR 2026-07-13 (retour Xefi)** : la permission réellement mise en
  place n'est **pas** `Sites.Read.All` (tenant-wide) mais **`Sites.Selected`**
  — app `wheels-report-graph`, accès restreint au seul site **Comptabilite**
  via `New-MgSitePermission` (rôle `read`). Plus restrictif que prévu à l'origine,
  cohérent avec le principe de moindre privilège. Aucun changement de code requis :
  `/shares/{id}/driveItem/content` (src/graph.js) résout dans le site autorisé,
  et une permission au niveau site s'applique à tout son contenu (pas de rupture
  d'héritage à ce niveau, cf. doc Microsoft Graph Selected permissions).
  - **✅ Testé en live 2026-07-13** : `test/smoke-finance.js` OK, 520 véhicules
    en parc mappés. L'hypothèse `New-MgSitePermission` exécuté par Xefi était
    correcte — chaîne Graph → SharePoint → parsing validée bout en bout.
- **✅ Bug corrigé 2026-07-13** : `coutDetentionMensuel` ("Cout de détention
  mensuel") vaut **0 sur 519/520 véhicules en parc** — cette colonne n'est
  renseignée qu'une fois le véhicule sorti (coût réalisé), pas pour le parc
  actif. Le fallback `?? echeanceMensuelleHT` prévu dans `toPlanItem`
  (planFlotte.js) ne se déclenchait jamais car `??` ignore `0` (seulement
  null/undefined) — `coutMensuelSortir` était donc quasi toujours nul. Fix :
  `0` traité comme absent pour ce champ, fallback vers `echeanceMensuelleHT`
  (paiement mensuel réel du financement HT). Confirmé par Julien. Non commité —
  Julien relit et commit lui-même.
  - **Piège connexe** : le fichier a deux colonnes similaires — "Cout de
    détention **théorique** mensuel hors frais financier" (peuplée pour le parc
    actif) vs "Cout de détention mensuel" (réalisée, post-sortie seulement).
    À garder en tête si la Compta modifie encore ce fichier.
- **KPIs € en Decimal.js** : capital immobilisé, valeur résiduelle récupérable,
  coût mensuel des véhicules à SORTIR.
- **Écarté** : lien de partage anonyme (risque sur données comptables) ; `Sites.Read.All`
  tenant-wide (remplacé par `Sites.Selected`, cf. ci-dessus) ; stockage Supabase
  (repoussé) ; `dailyrate` seul (proxy, pas une valeur) — remplacé par les vrais
  champs financiers.

## D-013 — Cockpit UI v2 : évolution de l'onglet existant, vanilla JS
- **Date** : 2026-07-14
- **Décision** : le cockpit décisionnel (file d'actions SORTIR/PROLONGER/SURVEILLER,
  KPIs €, filtres/tri/recherche) enrichit l'onglet **"Plan de flotte" existant**
  (renommé "🎯 Cockpit flotte") dans `wheelsys-reporting/index.html`, plutôt que
  de créer un nouvel onglet ou une nouvelle app. Reste en **vanilla JS**, cohérent
  avec le reste du fichier — pas de réécriture React malgré `instructions.md §4`
  (stack cible) qui mentionne React : le choix pragmatique déjà fait pour tout
  `wheelsys-reporting` est vanilla JS statique (cf. KNOWLEDGE §6), pas de raison
  de diverger pour cet ajout.
- **Table unifiée** : une seule table sur `fileActions` (par défaut, véhicules
  dans l'horizon) avec bascule vers `tousVehicules` (checkbox "tout le parc"),
  plutôt que les deux tables séparées dépassé/à venir de la v1 — l'échéance
  (retard vs à venir) redevient une colonne triable/filtrable parmi d'autres.
- **Filtres dropdown génériques** : le moteur de table partagé (`initSortableTable`,
  utilisé par les 5 onglets) gagne un `dropdownFilters` (égalité exacte, combinable
  avec la recherche texte), rétrocompatible — les autres onglets ne l'utilisent
  pas, comportement inchangé (vérifié).
- **Hors scope volontaire** (ROADMAP Phase 9.5+) : calendrier des sorties, plan
  groupé achat, leviers what-if (seuil/horizon ajustables en direct). Peuvent
  être ajoutés en Phase 2 sans revoir l'architecture ci-dessus.
- **Non commité** : Julien relit le diff et valide/déploie lui-même
  (`wheelsys-reporting/deploy.bat`).

## D-014 — Garde « période de sortie » dans `reco.js` (fix bug réel)
- **Date** : 2026-07-14
- **Bug signalé par Julien** : le cockpit recommandait **SORTIR** sur des
  véhicules qui viennent tout juste d'entrer en parc (ex. HL-431-TH, échéance
  théorique dans **657 jours**, utilisation 0 %). `recommander()` (D-011) ne
  regardait que `utilperc < seuil`, sans jamais vérifier que le véhicule est
  réellement proche de sa date de sortie — un véhicule neuf et peu loué
  (démarrage normal, faible historique) tombait dans la même case qu'un
  véhicule réellement en fin de détention.
- **Décision** : ajouter une garde `enPeriodeSortie = enRetard || joursRestants
  <= horizonJours`. Si `utilperc < seuil` **mais** hors période de sortie →
  action **SURVEILLER** (pas SORTIR), urgence **basse**, raison explicite
  invitant à analyser un **sur-effectif de catégorie ou un modèle inadapté**
  plutôt qu'une décision individuelle immédiate (proposition de Julien).
  `horizonJours` optionnel dans `recommander()` : si absent, comportement
  historique conservé (pas de garde) — rétrocompatible avec les appels directs
  sans horizon (cf. `reco.test.js`).
- **Écarté** : seuil de fenêtre arbitraire indépendant (ex. « 90 jours fixes ») —
  on réutilise `horizonJours`, déjà calculé et compris par Julien (le même
  horizon qui pilote `alertesHorizon`/le sélecteur "Horizon d'alerte" du
  cockpit), pas de nouveau paramètre à maintenir.
- **Tests** : `reco.test.js` (+5 cas horizonJours) et `planFlotte.test.js`
  (véhicule P4, réplique du cas réel 657 j) — voir KNOWLEDGE.md §13.

## D-015 — Cockpit : jours disponibles sous Utilisation, catégorie retirée du sous-texte
- **Date** : 2026-07-14
- **Contexte** : Julien s'interrogeait sur un 0 % d'utilisation "impossible"
  (GK-245-YJ). Un `utilperc` à 0 % signifie forcément 0 jour loué, donc le
  nombre de locations (`rentals`) serait **toujours 0 aussi** dans ce cas —
  l'ajouter n'aurait rien apporté (autocritique en cours de session : ma
  proposition initiale d'afficher `rentals` était erronée).
- **Décision** : afficher `avdays` (jours disponibles sur la fenêtre 12 mois,
  déjà renvoyé par `fleetutilizationreport` mais jusqu'ici ignoré) en sous-texte
  sous la colonne Utilisation — c'est le **dénominateur** du calcul, il permet
  de distinguer un vrai 0 % sur l'année d'un 0 % basé sur une fenêtre trop
  courte (véhicule récent, immobilisation temporaire, etc.).
  - Backend : passthrough `avdays` dans `routes/planFlotte.js` (`fetchUtilByPlate`)
    et `lib/planFlotte.js` (`toPlanItem`).
  - Frontend : `flotteToRow` + colonne cachée (recherche/export) + sous-texte.
- **Catégorie retirée du sous-texte Classe** : le sous-texte affichait
  `categorie · cargroup` (ex. "Tourisme · CA") — `categorie` (D-007,
  Utilitaire/Tourisme) fait doublon avec la Classe (VP≈Tourisme, VU≈Utilitaire
  la plupart du temps), jugé inutile par Julien. Ne reste que `cargroup`
  (plus granulaire, ex. "CA", "U3"). `categorie` reste disponible en filtre/
  recherche/export Excel — seule la colonne visuelle change.
- **Mise en page** : conteneur `main` élargi (1800px) uniquement sur l'onglet
  Cockpit flotte (`main.tab-flotte-wide`, togglé dans `showTab()`) + barre de
  défilement horizontal dupliquée **en haut** de la table (`syncTopScroll`),
  synchronisée en JS avec le scroll natif du `.table-wrap` — évite de devoir
  scroller toute la table (souvent >100 lignes) pour atteindre la barre native
  en bas.

## D-016 — Correction D-014 : fenêtre SORTIR fixe (90 j) + seuil kilométrage (90 000 km)
- **Date** : 2026-07-14
- **Bug signalé par Julien (2e occurrence)** : après le fix D-014, HL-017-TH
  (échéance dans 655 j, 80 km) s'affichait encore SORTIR. Cause : D-014 liait
  « période de sortie » à `horizonJours`, **l'horizon d'affichage** choisi par
  Julien dans le cockpit (menu 3 à 36 mois) — un horizon large (36 mois)
  annule la garde puisque 655 j entre alors dans la fenêtre. Confusion entre
  deux notions : *quoi afficher* (horizon, choix libre de Julien) et *quand une
  sortie est réellement justifiée* (règle métier fixe).
- **Décision** : `reco.js` n'utilise plus l'horizon d'affichage. Le badge
  SORTIR (à utilisation faible) exige désormais **l'une des deux conditions** :
  1. **Proche de sa date de sortie** — fenêtre **fixe** de **90 jours** par
     défaut (`FENETRE_SORTIE_JOURS_DEFAUT`), indépendante de l'horizon choisi
     dans l'UI. Valeur reprise du seuil déjà utilisé ailleurs dans le cockpit
     pour la pastille « proche » de l'échéance (orange si `joursRestants ≤ 90`,
     cf. `flotteEcheancePill` dans `index.html`) — cohérence, pas un nouveau
     nombre inventé. **À confirmer par Julien** si 90 j ne correspond pas à sa
     réalité terrain.
  2. **Kilométrage élevé** — `mileage ≥ 90 000 km` (`SEUIL_KM_SORTIE_DEFAUT`),
     seuil donné explicitement par Julien. Un véhicule loin de son échéance
     théorique mais déjà très roulé peut justifier une sortie (usure, valeur
     de revente).
  Sinon (ni proche, ni forte usure) → **SURVEILLER**, même logique de
  justification catégorie que D-014 (sur-effectif / modèle inadapté).
- **Sous le seuil mais pas nul** (ex. rotation 50 % < 70 %) : décision de
  Julien (2026-07-14) — **miroir + alerte**, pas de réduction automatique de
  quantité. La quantité recommandée reste égale au nombre de sorties prévues
  dans la catégorie ; seule la justification signale le problème de rotation.
  Aucune règle de réduction proportionnelle implémentée pour l'instant.
- **`horizonJours` conservé** dans `buildPlanFlotte` mais **seulement** pour
  filtrer l'affichage (`alertesHorizon`/fileActions) — n'entre plus dans le
  calcul de `reco` (paramètre retiré de `recommander()`/`toPlanItem()`).
- **Tests** : `reco.test.js` (+8 cas fenêtre fixe/km/personnalisation),
  `planFlotte.test.js` (véhicule P5 à fort km, test de régression horizon=36
  qui vérifie explicitement que P4 reste SURVEILLER quel que soit l'horizon).
- **Écarté** : lier la garde à l'horizon d'affichage (l'erreur de D-014,
  corrigée ici) ; un seuil km configurable par catégorie (Julien n'a demandé
  qu'un seuil global 90 000 km, pas de complexité supplémentaire tant que le
  besoin n'est pas confirmé).

## D-017 — Plan de renouvellement par catégorie (classe×cargroup)
- **Date** : 2026-07-14 (vision `/legendary`, exécution `/manager`)
- **Décision** : nouveau bloc du cockpit — vignette « prochaines sorties »
  (sélecteur 10/20/30, choix Julien), Top 3 / Flop 3 catégories (rotation),
  tableau « Plan de commande » (une ligne par classe×cargroup).
- **Quantité recommandée = MIROIR** des sorties prévues dans l'horizon choisi —
  **jamais réduite automatiquement**, même si rotation faible (choix Julien
  2026-07-14 : « miroir + alerte »). La rotation/coût ne sert qu'à la
  **justification**, jamais à modifier le chiffre.
- **Deux mesures de rotation côte à côte** (choix Julien) :
  - **12 mois glissants** (`utilperc`, déjà utilisé D-011/D-016).
  - **Détention totale** (`utilpercDetention`) — nouvel appel
    `fleetutilizationreport` en fenêtre large (2010→aujourd'hui, comme
    `vehiclelistreport`) plutôt que 12 mois glissants. **Hypothèse technique non
    vérifiée en live** (le sandbox ne peut pas appeler wheelsys) : `avdays`
    doit refléter la présence réelle du véhicule, pas la largeur de plage
    demandée — sinon la mesure n'a pas de sens pour un véhicule récent.
    **Smoke test créé** (`test/smoke-renewal-plan.js`) pour que Julien valide
    ça en local avant de faire confiance à cette 2e mesure en prod.
- **Ratio coût/CA jugé RELATIVEMENT à la moyenne réelle de la flotte actuelle**
  — pas de seuil absolu inventé. La marge finale de Julien (~10 %) est connue
  mais ne suffit pas à isoler la part spécifique au financement véhicule sans
  connaître la répartition de ses charges ; l'approche relative (comparer
  chaque catégorie à la moyenne flotte calculée sur les vraies données)
  évite d'inventer un chiffre non vérifié. Moyenne flotte = `Σ(coût×12)/Σ(CA)`
  sur l'ensemble des véhicules avec les deux données, **pas** une moyenne des
  ratios par groupe (qui pondérerait à tort petits et gros groupes pareil).
- **Verdict** (rotation d'abord, coût/CA en signal secondaire qui n'aggrave
  que le cas déjà défavorable) : `RENOUVELER` (rotation ≥ seuil 70 %) ·
  `A_SURVEILLER` (rotation < seuil, coût dans la moyenne) ·
  `NE_PAS_RENOUVELER` (rotation < seuil ET coût > moyenne flotte) ·
  `DONNEE_INSUFFISANTE` (rotation inconnue).
- **Seuil classable = 3 véhicules** (choix Julien) : sous ce seuil, une
  catégorie n'apparaît pas dans le Top 3 / Flop 3 (trop peu fiable) mais reste
  visible dans le tableau détaillé avec son propre verdict.
- **Regroupement par `classe × cargroup`** (pas par `categorie` D-007
  Utilitaire/Tourisme, trop grossier pour une décision d'achat — l'exemple de
  Julien « 10 cat B en restitution » désigne un `cargroup` précis).
- **Fonction pure `src/lib/renewalPlan.js`** (`buildCategoryStats`), 25 tests
  offline (Decimal.js, garde-fou division par zéro, classement top/flop,
  robustesse vide/null) — voir KNOWLEDGE.md §16.
- **Écarté** : réduire automatiquement la quantité sous rotation faible
  (explicitement refusé par Julien) ; seuils coût/CA absolus inventés (30 %/50 %
  proposés initialement, remplacés par l'approche relative après clarification
  de la marge réelle ~10 %) ; grouper par `categorie` D-007 plutôt que `cargroup`.

## D-018 — Le fichier Excel "Base Flotte" est la source de vérité du parc
- **Date** : 2026-07-16
- **Bug signalé par Julien** : HD-885-JQ (VU, 06F) s'affichait SORTIR dans le
  cockpit alors qu'il ne fait plus partie du parc réel. Le véhicule était
  encore actif côté wheelsys (`isParcPresent` vrai — pas défleeté, pas de
  `fleetexit`), mais absent du fichier Excel "Base Flotte" (SharePoint).
- **Règle métier (Julien)** : *« la source de vérité pour la liste de vh est
  le fichier excel. wheelsys permet de vérifier que le véhicule est tjrs actif
  en parc. mais si un vh est dans wheelsys mais pas le fichier excel alors il
  faut l'enlever du reporting »*. Les deux sources ont des rôles différents :
  wheelsys confirme l'activité opérationnelle (statut, agence), l'Excel
  confirme l'appartenance réelle au parc (colonne "Etat du parc" = "En parc",
  déjà filtrée par `buildFinanceByPlate`/`estEnParc` dans `lib/finance.js`).
- **Décision** : `buildPlanFlotte` (`planFlotte.js`) exclut désormais tout
  véhicule présent côté wheelsys (`isParcPresent`) mais **absent de la map
  `financeByPlate`** (donc absent — ou pas "En parc" — dans le fichier Excel).
  Nouveau compteur `perimetre.exclusHorsExcel`, jamais silencieux : affiché
  dans le bandeau de config (`flotteConfigBannerHtml`) et dans le sous-texte
  de la carte KPI "Parc présent".
- **Garde de dégradation** : la gate ne s'applique **que si**
  `financeDisponible === true` (le fetch Excel via Graph a réellement
  réussi ce cycle). Si l'appel Excel échoue (best-effort déjà existant), on
  ne filtre rien — sinon un simple incident réseau viderait tout le
  reporting au lieu de dégrader proprement une seule source. `financeDisponible`
  est donc désormais transmis en plus de `financeByPlate` de la route vers
  `buildPlanFlotte` (`routes/planFlotte.js`).
- **Tests** : `planFlotte.test.js` (+5 cas — véhicule hors Excel exclu quand
  `financeDisponible:true`, resté quand absent/`false` par défaut, cas
  "financeByPlate vide malgré financeDisponible:true" documentant qu'un vrai
  incident de contenu viderait tout — signal à surveiller via le banner, pas
  une gate qui s'auto-désactive).
- **Écarté** : filtrer sans condition de disponibilité (risque de vider tout
  le reporting sur un simple échec Graph/SharePoint) ; masquer l'exclusion
  sans compteur visible (contraire à la règle "jamais d'erreur silencieuse").

## D-019 — La date Excel (contrat réel) prime sur le calcul wheelsys (D-009)
- **Date** : 2026-07-16
- **Bug signalé par Julien** : HK-348-VV affichait une date de sortie cockpit
  (2026-11-30, calculée depuis `plannedexitdate` wheelsys) très différente de
  la « date sortie prévue » du contrat réel dans le fichier Excel "Base
  Flotte" (29/05/2026, LLD LEASYS). Julien : *« le but est d'avoir des données
  fiables, si je me base sur des données fausses alors il est impossible de
  piloter correctement »*.
- **Cause racine** : `computeDateSortie` (D-009) ne lisait jamais le champ
  Excel `dateSortiePrevue` — celui-ci était déjà capturé dans `financeByPlate`
  (§13) mais jamais consulté pour le calcul de la date de sortie. Deux sources
  indépendantes, jamais recoupées.
- **Décision (choix Julien parmi 3 options proposées)** : quand la
  `dateSortiePrevue` Excel est renseignée pour un véhicule, elle **prime**
  sur le calcul wheelsys — c'est un engagement contractuel réel (LLD/buy-back),
  pas une estimation. Le calcul wheelsys (`plannedexitdate` ou
  `fleetentry + durée`) ne sert plus que de **repli** quand Excel est absent
  pour ce véhicule.
- **Bypass de l'ajustement saisonnier (D-009 §5)** quand la date vient
  d'Excel : le report au 15/09 n'a de sens que pour une date théorique
  estimée ; une date de contrat ferme ne se décale pas unilatéralement.
- **Traçabilité (jamais de source cachée)** : nouveau champ `sourceDateSortie`
  (`'excel' | 'wheelsys' | null`) sur chaque véhicule, surfacé dans le cockpit
  (pastille sous la date : « contrat Excel » / « estimé (wheelsys) ») et dans
  l'export Excel (colonne "Source date").
- **Normalisation à la source** : `lib/finance.js#parseExcelDate` convertit la
  cellule brute (`DD/MM/YYYY`, `YYYY-MM-DD`, numéro de série Excel, ou objet
  `Date`) en ISO `yyyy-MM-dd` une seule fois, dans `buildFinanceByPlate` —
  tout le reste du code manipule une date déjà propre. Placeholders
  ("-", "n/a", vide) → `null`, jamais deviné.
- **Dégradation propre inchangée** : si le fetch Excel échoue entièrement
  (`financeDisponible=false`), `dateSortiePrevueExcel` est `null` pour tout le
  monde → repli automatique sur wheelsys pour l'ensemble du parc, sans code
  supplémentaire (le mécanisme existant de D-018 suffit).
- **Outil de diagnostic** : `test/smoke-coherence-dates.js` (créé avant la
  décision, pour mesurer l'ampleur réelle du problème sur tout le parc avant
  de choisir une solution) reste utile pour un audit ponctuel après déploiement.
- **Validation live (Julien, 2026-07-16)** : sur 1606 véhicules wheelsys / 514
  "En parc" Excel, seuls **26 (≈5 %)** ont une `dateSortiePrevue` renseignée —
  pour les ~95 % restants, le repli wheelsys s'applique normalement, ce n'est
  pas une anomalie. Sur ces 26 : 12 cohérentes, **14 divergentes** (>30 j),
  confirmées comme intentionnel par Julien (« Excel est toujours la source de
  vérité ») — Excel gagne pour ces 14 aussi. **HK-348-VV (le cas d'origine)
  n'était pas dans l'échantillon comparable** lors de ce run — diagnostic
  ciblé ajouté au smoke test (dump complet wheelsys+Excel pour cette plaque,
  même hors échantillon) pour confirmer si son `dateSortiePrevue` est
  réellement vide côté Excel ou si c'est une autre cause. À reconfirmer par
  Julien après un nouveau run.
- **HK-348-VV confirmé (2e run, 2026-07-16)** : `dateSortiePrevue` est
  **réellement `null`** dans le fichier Excel pour ce véhicule (pas un bug de
  parsing — le diagnostic dump la valeur brute directement depuis
  `financeByPlate`). `fleetentry` wheelsys = 2026-05-29 — c'est cette date
  (l'entrée en parc, pas une date de sortie) que j'avais mal identifiée comme
  `dateSortiePrevue` en lisant la ligne Excel collée par Julien au tout début
  de l'investigation ; erreur de lecture d'une ligne tabulée reconnue,
  corrigée par la mesure live plutôt que par une nouvelle supposition. Le
  cockpit affiche donc 2026-11-30 (`sourceDateSortie: 'wheelsys'`) **par
  repli légitime**, pas par bug résiduel : Excel n'a simplement pas encore de
  date de sortie renseignée pour ce contrat LLD tout juste livré (aussi
  incomplet sur `capitalRestant`/`engagementRestant`, tous deux `null`).
  Recommandation opérationnelle (pas un correctif code) : renseigner la
  colonne "date sortie prévue" dans Excel pour ce véhicule (et les autres
  contrats récents dans le même cas) si Julien veut que D-019 s'applique ici.
- **Tests** : `finance.test.js` (+9, `parseExcelDate` tous formats),
  `rules.test.js` (+5, priorité Excel/repli wheelsys/bypass saisonnier/PL
  toujours exclu), `planFlotte.test.js` (+2, cas HK-348-VV bout-en-bout).
- **Écarté** : garder wheelsys comme référence et juste alerter (rejeté par
  Julien) ; afficher les deux dates sans trancher (rejeté par Julien) ; deviner
  un format de date ambigu plutôt que retourner `null`.

## D-020 — Hiérarchie à 3 niveaux pour la date de sortie ; `plannedexitdate` (wheelsys) totalement abandonné
- **Date** : 2026-07-16
- **Contexte** : suite à D-019, la majorité des véhicules (≈95 %) n'ont pas de
  `dateSortiePrevue` Excel renseignée et retombent sur le calcul wheelsys
  (`fleetentry + durée générique classe`). Julien signale une source
  intermédiaire plus fiable, jusqu'ici inutilisée : la colonne Q du fichier
  Excel "Base Flotte", *« Nbre de mois de financement prévu »*, qui reflète en
  général la durée de détention réelle du contrat.
- **Règle métier (Julien, verbatim)** : *« pour les VU la durée max de
  détention est de 36 mois il faut donc indiquer en date de retour la date de
  réception en parc + 36 mois. […] hiérarchie : évite les replis sur wheelsys
  car les données ne sont pas fiables concernant ces dates. on reste sur 1
  puis 2 et en dernier la règle des VP 2 ans et VU 3 ans »*.
- **Décision — hiérarchie à 3 niveaux** (`rules.js#computeDateSortie`) :
  1. **Excel `dateSortiePrevue`** (contrat exact, ferme) → `sourceDateSortie: 'excel'` (inchangé, D-019).
  2. **`fleetentry` + durée de financement Excel** (colonne Q,
     `dureeFinancementMois`), **plafonnée** à la durée max de détention de la
     classe (VP 24 mois / VU 36 mois, `dureeDetention`) → `sourceDateSortie: 'excel_duree'`.
  3. **Repli générique** : `fleetentry` + durée max de détention de la classe
     (comportement D-009 historique, base commune avec le tier 2) → `sourceDateSortie: 'wheelsys'`.
  Le plafond de la classe (tier 2) a été explicitement demandé par Julien pour
  les VU (36 mois) ; **étendu par symétrie aux VP (24 mois)** — hypothèse non
  confirmée verbatim par Julien, à valider par lui à la relecture.
- **`vehicle.plannedexitdate` (wheelsys) totalement retiré du calcul** : ce
  champ n'est plus JAMAIS lu par `computeDateSortie`, à aucun tier. Seule
  `fleetentry` (date d'entrée en parc, jugée fiable par Julien) reste une
  donnée wheelsys utilisée, base commune aux tiers 2 et 3. C'est un changement
  de comportement plus large que D-019 : même les véhicules dont la date
  wheelsys *semblait* correcte peuvent désormais afficher une date différente,
  car elle n'est simplement plus jamais consultée.
- **Ajustement saisonnier (D-009 §5)** : s'applique aux tiers 2 et 3 (estimations),
  toujours bypassé au tier 1 (engagement contractuel ferme, inchangé D-019).
- **Colonne Q reconnue de façon tolérante** (`lib/finance.js#CHAMPS.dureeFinancementMois`) :
  fragments `"nbre de mois de financement"`, `"nombre de mois de financement"`,
  `"mois de financement prevu"`, `"mois de financement"` — cohérent avec la
  tolérance déjà en place pour les autres colonnes du fichier (libellés
  maintenus à la main, variables).
- **Traçabilité** : `flotteSourceDatePill` (frontend) distingue désormais 3
  pastilles : « contrat Excel » (vert), « estimé (durée financement) » (bleu),
  « estimé (règle générique) » (gris, renommé — auparavant « estimé
  (wheelsys) », nom devenu trompeur puisque wheelsys n'intervient plus que via
  `fleetentry`). Export Excel aligné (colonne "Source date").
- **Tests** : `rules.test.js` — 9 cas canoniques D-009 réécrits (3 cas
  utilisaient `plannedexitdate` comme date attendue, désormais prouvé ignoré :
  fixtures conservées avec une valeur de `plannedexitdate` volontairement
  absurde/différente pour détecter toute régression), +11 cas D-020 (tier 2
  simple, plafond VU/VP, ajustement saisonnier au tier 2, repli tier 3 si durée
  0/négative/NaN/absente, priorité tier 1 sur tier 2, cas sans fleetentry ni
  Excel). `finance.test.js` — +5 cas (résolution d'en-tête, parsing, absence,
  placeholder). `planFlotte.test.js` — 2 cas D-018/D-019 pré-existants corrigés
  (dates recalculées suite à l'abandon de `plannedexitdate` : le test HK-348-VV
  "repli wheelsys" attendait `2026-11-30` — devient `2028-03-30`, fleetentry
  réel + 24 mois VP), fixture P5 ajustée (date +2 ans repoussée pour conserver
  l'intention originale du test D-016 "échéance lointaine + fort kilométrage"),
  KPI/timeline recalculés en conséquence ; +2 cas D-020 bout-en-bout (tier 2 +
  plafond).
- **Écarté** : garder `plannedexitdate` comme repli ultime après le tier 3
  (rejeté explicitement par Julien — "évite les replis sur wheelsys") ; ne pas
  plafonner le tier 2 à la durée max de classe (risque d'accepter une durée de
  financement erronée/aberrante sans garde-fou).
- **Confirmé par Julien (2026-07-17)** : 24 mois est bien la durée max de
  détention des VP (symétrique à la règle VU 36 mois) — le plafond du tier 2
  s'applique donc identiquement aux deux classes, aucun changement de code
  nécessaire.

## D-021 — Plan de commande : détail dépliable des véhicules par catégorie
- **Date** : 2026-07-17
- **Demande Julien** : sur le tableau "Plan de commande par catégorie", ajouter
  un "+" par ligne pour déplier la liste des véhicules à rendre dans la
  catégorie correspondante (chaque ligne se plie/déplie indépendamment).
- **Décision — 100 % frontend, aucun changement backend** : `data.alertesHorizon`
  (déjà renvoyé par `/api/plan-flotte` et déjà utilisé ailleurs dans le cockpit)
  contient tous les véhicules individuels comptés dans "sorties prévues", avec
  `classe`/`cargroup`/`plateno`/`agence`/`dateSortie`/`joursRestants`/`reco`.
  Le détail dépliable est donc un simple regroupement de cette liste par
  `classe|cargroup` (même clé que `normKey` côté `renewalPlan.js`), sans
  toucher au backend — le plus petit correctif sûr, aucune route modifiée.
- **Implémentation** (`wheelsys-reporting/index.html`) : colonne toggle ajoutée
  en tête de tableau (`renouvTableHtml`), `initRenouvTable` reçoit désormais
  `data.alertesHorizon` en 3ᵉ argument et construit une `Map` classe|cargroup →
  véhicules. `_renouvExpanded` (Set global) retient les catégories dépliées
  pour survivre aux tris/recherches (le tableau se re-rend entièrement à
  chaque tri, `_renderTable`). `renouvDetailRowHtml` affiche chaque véhicule
  (plaque, agence, date, pastille échéance `flotteEcheancePill`, pastille
  action `flotteActionPill` — réutilisées telles quelles, pas de nouvelle
  pastille inventée), triés par date de sortie croissante. Cas limite géré :
  catégorie sans véhicule dans l'horizon (`sortiesPrevues=0`) → pas de bouton
  toggle (rien à déplier).
- **Tests** : harnais Node isolé (stubs copiés à l'identique du fichier —
  `escHtml`/`escJs`/`fmtDate`/pastilles) reproduisant `initRenouvTable` sans
  DOM réel : 8 cas (replié par défaut, catégorie vide sans bouton, bascule
  toggle, tri par date, cloisonnement strict entre catégories, pastilles
  correctes, catégorie vide mais forcée dépliée, échappement `escJs` d'une clé
  avec apostrophe). **À vérifier visuellement dans un vrai navigateur**
  (le sandbox ne peut pas en ouvrir un) : clic sur "+"/"−", alignement visuel
  de la ligne détail sous la ligne catégorie, comportement lors d'un tri/
  recherche avec une catégorie dépliée.
- **Écarté** : dupliquer l'agrégation côté backend (`renewalPlan.js`) — aucune
  donnée supplémentaire n'était nécessaire, la liste existe déjà côté client.

## D-022 — Nouvelle action RENOUVELER : un véhicule productif ne reste plus en PROLONGER indéfiniment
- **Date** : 2026-07-17
- **Signalé par Julien** : sur le détail dépliable "Plan de commande" (D-021),
  des véhicules en retard de 14 à 48 j s'affichaient en PROLONGER simplement
  parce que leur utilisation était ≥ 70 %. Julien : *« le but est aussi de
  faire tourner le parc pour avoir des vh neuf régulièrement […] le but est de
  commander le même vh pour avoir le même niveau de renta »*.
- **Cause racine** : `reco.js#recommander` recommandait PROLONGER dès que
  `utilperc >= seuil`, **sans aucune limite de retard** — un véhicule très
  productif pouvait rester en PROLONGER indéfiniment, même des années après sa
  durée de détention max, ce qui va à l'encontre du renouvellement régulier du
  parc.
- **Décision (clarifiée avec Julien via question à choix)** :
  1. **Déclencheur** : dès que le véhicule est en retard (`joursRestants < 0`,
     donc dès que la durée de détention théorique — VP 24 mois / VU 36 mois,
     ou date Excel — est dépassée), quelle que soit l'utilisation.
  2. **Nouvelle action distincte `RENOUVELER`** (pas une fusion avec SORTIR) :
     signale explicitement "remplacer par un véhicule identique pour garder
     le niveau de rentabilité" — cohérent avec le vocabulaire déjà utilisé au
     niveau catégorie (D-017 : RENOUVELER/À surveiller/Ne pas renouveler).
  - PROLONGER reste valide, mais seulement **avant** l'échéance théorique
    (véhicule productif, rien à décider dans l'immédiat).
  - SORTIR reste inchangé (véhicule peu productif, en retard ou proche de la
    sortie / km élevé) — ne présume pas d'un remplacement automatique.
- **Implémentation** (`backend-pilotage/src/lib/reco.js`) : le test
  `u >= seuil` est désormais scindé en deux branches selon `enRetard` :
  `u >= seuil && enRetard` → RENOUVELER (urgence moyenne, raison mentionnant
  le retard en jours et l'intention de remplacement identique) ; `u >= seuil`
  (implicitement non en retard) → PROLONGER inchangé (urgence basse, plus
  jamais atteint en retard). Score inchangé (déjà proportionnel au retard).
- **`planFlotte.js`** : `parAction` gagne la clé `RENOUVELER` (comptage
  séparé). `groupeMap` (plan groupé agence×catégorie, non affiché
  actuellement côté frontend) gagne un compteur `renouveler` dédié — sans ce
  correctif, RENOUVELER aurait été silencieusement rangé dans "surveiller"
  (seul le `else` final existait avant), une mini-régression de
  catégorisation évitée par la même occasion.
- **Sommes € (`loyerSortir`/`capitalSortir`/`residuelleSortir`/`coutMensuelSortir`)
  volontairement NON étendues à RENOUVELER** : ces véhicules étaient déjà
  exclus de ces totaux quand ils étaient en PROLONGER — aucun changement de
  comportement financier, pas de redéfinition silencieuse d'un chiffre déjà
  utilisé par Julien. Si Julien veut que RENOUVELER compte dans ces totaux
  (le véhicule sort quand même, remplacé ou non), c'est une extension
  ultérieure à valider explicitement, pas incluse ici.
- **Frontend** (`wheelsys-reporting/index.html`) : `flotteActionPill` — pill
  orange pour RENOUVELER (entre vert PROLONGER et rouge SORTIR). Filtre
  dropdown action : `['SORTIR', 'RENOUVELER', 'PROLONGER', 'SURVEILLER']`.
  Bandeau de dégradation (`utilisationDisponible === false`) et badge onglet
  volontairement laissés inchangés (comptage SORTIR seul) — non demandés,
  périmètre minimal.
- **Tests** : `reco.test.js` — 1 cas existant corrigé (retard + util élevée
  → RENOUVELER, plus PROLONGER) + 7 nouveaux cas D-022 (frontière retard
  -1j/0j exacte, seuil exact en retard, seuil personnalisé, raison mentionne
  le retard, score toujours croissant avec le retard, km élevé n'a pas priorité
  sur RENOUVELER). `planFlotte.test.js` — P2 (VP en retard, productif)
  recalculé de PROLONGER vers RENOUVELER, KPI parAction mis à jour
  (SORTIR=2/RENOUVELER=1/PROLONGER=0/SURVEILLER=1), + 1 cas dédié vérifiant
  que `planGroupe` compte bien RENOUVELER à part et non dans surveiller.
  81 tests verts au total (reco 24 + planFlotte 57).
- **Écarté** : tolérance de quelques mois de retard avant bascule (rejeté par
  Julien — dès 0 j) ; fusionner RENOUVELER avec SORTIR (rejeté par Julien —
  action distincte demandée) ; étendre silencieusement les totaux € sans le
  demander explicitement.
- **Addendum (2026-07-17, même jour)** — Julien tranche le point laissé en
  attente : *« il faut inclure l'ensemble des véhicules dans les chiffres pour
  avoir une vision réelle »*. Les sommes € (`loyerJourSortir`,
  `capitalImmobiliseSortir`, `residuelleRecuperableSortir`,
  `coutMensuelSortir`) et le compteur/badge "à sortir" incluent désormais
  **SORTIR + RENOUVELER** (les deux quittent physiquement le parc). Noms de
  variables/API inchangés (pas de renommage en cascade) — seul le filtre de
  sommation est élargi. KPI card "À sortir (recommandé)" et sous-textes des
  cartes € mis à jour pour afficher explicitement le détail SORTIR/RENOUVELER
  et éviter toute ambiguïté sur ce qui est compté. Tests `planFlotte.test.js`
  recalculés (P2, désormais RENOUVELER, contribue à ces sommes) : loyer
  95→155, capital 0→800, coût mensuel 200→450, résiduelle inchangée à 500
  (P2 a une valeur résiduelle de 0). 57 tests planFlotte + 24 reco toujours
  verts.

## D-023 — Onglet "Stats clients" : top clients par CA/agence, objectifs éditables jamais mélangés aux données réelles
- **Date** : 2026-07-19 (vision `/legendary`, exécution directe)
- **Demande Julien** : nouvel onglet listant les 10 clients qui font le plus de
  CA, par agence, avec le nom du client en raccourci vers sa fiche wheelsys.
  Niveau 4 visé : interactif, tuiles animées, aide à la décision, données
  filtrables/triables/**éditables**.
- **Décision — pas de nouvel appel réseau** : l'onglet réutilise `json.allRaw`
  (mêmes contrats que l'onglet "Tous les contrats", même période/agence
  filtrée) déjà chargé par `loadData()`, plus `json.impaye.items` (solde
  impayé 12 mois glissants, indépendant de la période — croisé uniquement pour
  signaler un risque, jamais utilisé comme CA). Agrégation par agence puis par
  client faite côté client (`computeStatsAggregation`), vanilla JS, cohérent
  avec D-013.
- **CA HT ajouté au backend** : `api/report.js#mapRecord` expose désormais
  `caHT: r.netcharge` (D-003) — jusqu'ici seul `facture` (TTC = `custcharge`)
  était renvoyé. Champ additif, aucun autre onglet impacté.
- **Lien client = `clientLink()` existant** (jusqu'ici du code mort, jamais
  appelé) → `corporate.aspx?entityId=`. **Limite connue préexistante, pas
  introduite ici** : pour un client particulier (`drivercodeid`, "Individual
  Renter" D-008, pas de fiche corporate), le lien pointe quand même vers
  `corporate.aspx` faute d'URL documentée pour ce type de fiche (KNOWLEDGE §2
  ne couvre que l'endpoint corporate) — à vérifier avec Julien si besoin.
- **Éditable = objectif de CA par client, jamais les chiffres réels** : par
  principe D-019 (*« si je me base sur des données fausses il est impossible
  de piloter »*), `caHT`/`caTTC` ne sont **jamais éditables** — éditer un
  chiffre réel wheelsys sans traçabilité serait exactement le risque que D-019
  a écarté. Seul un **objectif de CA par client** (`localStorage`, clé
  `wheelsys_stats_objectifs`, jamais envoyé au backend) est éditable, avec une
  barre de progression (CA réel / objectif) — donnée de suivi local, visuelle-
  ment distincte (fond jaune pâle sur l'input) pour ne jamais être confondue
  avec une donnée wheelsys.
- **Aide à la décision** = 3 familles d'insights générés depuis l'agrégation
  courante (pas d'historique, rien de persisté serveur) : concentration Pareto
  (top 3 clients ≥ 60 % du CA agence → risque de dépendance), croisement CA ×
  impayé (client qui rapporte mais doit de l'argent → à relancer), clients
  sous 70 % de leur objectif édité.
- **Seuils de concentration (60 % alerte / 40 % à surveiller) INDICATIFS, non
  validés par Julien** — même philosophie que D-017 (pas de seuil absolu
  inventé sans confirmation) : affichés avec un tooltip explicite "non validé,
  à ajuster si besoin", jamais présentés comme une règle métier figée.
- **Sélecteur Top 10/20/30 par agence** (même pattern que D-017 "prochaines
  sorties") : limite l'affichage (cartes + tableau détaillé) sans jamais
  cacher l'info — badge onglet = nombre de clients affichés ayant un impayé
  (signal actionnable, cohérent avec la sémantique des autres badges rouges).
- **Présentation** : podium animé (hauteur des barres proportionnelle au CA,
  medaille 🥇🥈🥉) + liste classement #4-#N avec barre horizontale, tuiles KPI
  avec count-up, tableau détaillé générique (`initSortableTable`, tri/filtre/
  recherche/export Excel gratuits, comme tous les autres onglets).
- **Écarté** : rendre `caHT`/`caTTC` éditables (contraire à D-019) ; persister
  les objectifs côté backend/Supabase (D-001 non déployé pour cette feature,
  périmètre volontairement 100 % frontend/localStorage comme le reste de
  l'app) ; comparaison historique mois/mois (pas de source de données
  disponible sans nouvel appel réseau, hors scope de cette itération).
- **Tests** : QA fonctionnelle en navigateur (Claude Browser pane) avec jeu de
  données synthétique injecté en console — agrégation, tri, filtre dropdown +
  recherche texte, édition d'objectif + persistance localStorage + recalcul de
  la barre de progression, clic "Voir le détail →" (filtre + scroll), export
  Excel, état vide (0 contrat), pas d'erreur console. Pas de suite de tests
  automatisée (le fichier est un unique `index.html` vanilla JS sans
  framework de test, cohérent avec le reste du projet frontend).

## D-024 — CA facturé (pas checkout), nombre de factures, en-cours exclu, longue durée ≥ 30j
- **Date** : 2026-07-19 (suite directe de D-023, retour de Julien sur le rendu initial)
- **Demande Julien** : « il faut voir le CA facturé sur la periode. je veux
  connaitre exactement le CA facturé, le nombre de facture sur la periode (/
  par mois si periode dépasse 2 mois). si contrat longue durée alors il faut
  ajouter une note CA contrat longue durée en cours = ». Clarifié par 5
  questions à choix avant implémentation (ne pas deviner un chiffre financier,
  cf. historique D-014/D-016) :
  1. **Base de date** = **date de facturation réelle** (choisi par Julien),
     pas la date de départ (checkout) utilisée par tous les autres onglets.
  2. **Notion de "facture"** = **un vrai numéro de facture wheelsys** (choisi
     par Julien) — mais **aucun champ de ce type n'a été identifié** dans les
     données `rentalagreementfinancials` déjà capturées (KNOWLEDGE §4.1/§4.1bis).
     **Fallback implémenté en attendant** : 1 contrat clôturé = 1 facture,
     clairement labellisé comme non confirmé (bandeau + info-bulles).
  3. **Contrats "En cours"** = **exclus du CA facturé, comptés à part** (choisi
     par Julien).
  4. **Seuil "longue durée"** = **durée en jours** (choisi par Julien), valeur
     = **30 jours** (choisi par Julien parmi 30/60/90).
- **Backend** (`api/report.js`) : nouvel appel réseau parallèle (5ᵉ, en plus
  des 4 existants) sur `rentalagreementfinancials` avec **`mtdtype: '1'`**
  (date de facturation) au lieu de `'2'` (checkout) — retourné en plus sous
  `factureRaw` (mappé par le même `mapRecord`, désormais enrichi de `days`/
  `accrueddays`). **`allRaw` (mtdtype=2) inchangé**, toujours utilisé par les
  4 autres onglets — aucune régression sur l'existant.
  - ⚠️ **Ambiguïté non tranchée, à valider en live** : un commentaire du code
    historique (avant D-024) qualifiait `mtdtype=1` de "date de création du
    contrat (trop large, contrats hors période)", alors que KNOWLEDGE.md §4.1
    le documente comme `"invoice"`. Les deux sources ne sont pas
    nécessairement contradictoires (une facture est souvent créée à la
    création du contrat) mais **rien n'a été vérifié sur de vraies données**.
    Julien doit comparer un mois connu entre les deux filtres (ex. un export
    Excel wheelsys "factures du mois" vs le total CA facturé affiché) avant de
    faire confiance au chiffre pour le pilotage.
- **Agrégation** (`computeStatsAggregation`, index.html) : split par contrat
  selon `statut` (dérivé comme avant par intersection avec les contrats
  actifs) — `Clôturé` alimente `caHT`/`caTTC`/`contrats` (= CA facturé + nombre
  de factures) ; `En cours` alimente `enCoursCaHT`/`enCoursCaTTC`/
  `enCoursContrats`, **jamais additionné au CA facturé**. Durée d'un contrat en
  cours (`statsDureeJours`) : priorité à `accrueddays` (jours courus, censé
  refléter le temps réellement écoulé) → repli `days` (durée prévue) → repli
  calcul depuis `checkoutdate` jusqu'à aujourd'hui. **Non validé en live** —
  aucune garantie que `accrueddays` se comporte comme documenté.
- **Regroupement mensuel** (`computeMonthlyBreakdown`) : affiché uniquement si
  la période dépasse **60 jours** (interprétation de « si période dépasse 2
  mois »). Groupe les contrats clôturés par mois — **sur `checkoutdate`, pas
  une date de facturation**, faute de champ dédié visible dans les lignes
  retournées par l'API (le filtre `mtdtype` change quelles lignes reviennent,
  pas quelles colonnes sont présentes). Incohérence documentée, pas cachée.
- **Note "longue durée en cours"** : par client, phrasée au plus près de la
  demande de Julien — *"🕐 [Client] ([Agence]) — CA contrat longue durée en
  cours = [montant] (N contrat(s), J j) — non compté dans le CA facturé."*
  Affichée dans le panneau "Aide à la décision" (scanne **tous** les clients,
  pas seulement le Top N affiché — un contrat longue durée ne doit jamais être
  caché par le sélecteur d'affichage), en sous-texte de la ligne client dans le
  tableau détaillé, et en badge 🕐 sur le nom du client (podium + classement).
- **Nouvelle tuile KPI** "CA en cours (non facturé)" (couleur gris ardoise
  distincte du bleu marine des autres tuiles — signale visuellement "donnée
  différente, pas encore facturée") : total en cours + nombre de contrats +
  nombre de longue durée.
- **Bandeau d'avertissement permanent** (`statsAssumptionsBannerHtml`, style
  `.exemptions-banner`) rappelant les 3 points non validés (mtdtype=1, nombre
  de factures = proxy contrats clôturés, regroupement mensuel sur checkout) —
  jamais présenté comme un chiffre certain, cohérent avec D-019/D-020.
- **Écarté** : deviner le seuil longue durée sans demander (rejeté par
  principe — cf. D-014/D-016, deux corrections dues à des seuils supposés) ;
  inclure les contrats en cours dans le CA facturé (explicitement refusé par
  Julien) ; se contenter du fallback "1 contrat = 1 facture" sans le signaler
  comme non confirmé.
- **Tests** : QA fonctionnelle en navigateur avec jeu de données synthétique
  couvrant contrats clôturés + en cours + longue durée + période de 80 jours
  (> 60j, déclenche le regroupement mensuel) — vérifié : CA facturé exclut
  bien les en-cours, nombre de factures = nombre de clôturés, tuile "CA en
  cours" correcte, note longue durée affichée avec le bon montant/durée,
  regroupement mensuel correct (3 mois), pas d'erreur console.
- **À faire par Julien avant de déployer** (voir ROADMAP Phase 7bis) : valider
  en live que `mtdtype=1` reflète bien une date de facturation réelle, et
  vérifier dans wheelsys (menu Reports ou fiche client) s'il existe un rapport
  ou un champ "numéro de facture" distinct du numéro de contrat — si oui, me
  transmettre le nom du `browser` (ou une capture) pour remplacer le fallback.
- **⚠️ Corrigé le jour même par D-025** — les 2 premiers points "à valider"
  ci-dessus se sont révélés être un vrai bug (pas juste une hypothèse à
  confirmer). Voir D-025.

## D-025 — Correction D-024 : bug de surestimation du CA facturé, remplacement par `invoicesauditreport`
- **Date** : 2026-07-19 (même jour que D-024, testé en live avant tout déploiement)
- **Bug trouvé en testant D-024 avec une vraie session wheelsys** (fournie par
  Julien) : le filtre `mtdtype=1` sur `rentalagreementfinancials` fait
  remonter, pour un contrat facturé plusieurs fois (location longue durée à
  cycle de facturation périodique), le **total cumulé de tout le contrat** dès
  qu'UNE de ses factures tombe dans la période demandée — pas le montant de
  cette seule facture. Exemple réel observé (anonymisé) : un contrat de 274
  jours avec **26 factures** sur sa durée de vie (dont un avoir) ; interrogé
  sur une fenêtre de 3 jours, il remonte ses ~14 000 € HT cumulés en entier.
  Sommer `caHT` sur ces lignes **surestime donc massivement** le CA facturé
  réel dès qu'un contrat multi-facturation est concerné — exactement le genre
  de contrat que la note "longue durée" de D-024 était censée surveiller.
  Bug distinct et cumulatif : le `statut` (Clôturé/En cours) dérivé pour ces
  lignes était également faux, car calculé par intersection avec un ensemble
  de contrats actifs scopé par **date de départ**, alors que les lignes
  `mtdtype=1` sont scopées par **date de facturation** — un contrat démarré
  des mois avant la période mais toujours actif n'apparaissait jamais dans cet
  ensemble.
- **Recherche d'une vraie source par facture** : le rapport
  `rentalagreementfinancials` contient (non documenté avant, KNOWLEDGE §4.1bis
  mis à jour) les champs `custinvoice`/`agentinvoice` — chaînes de vrais
  numéros de facture séparés par virgule (`INV-XXXXXX`, avoirs `CRE-XXXXXX`
  mêlés dans la même chaîne) — mais ne donnent toujours pas le montant propre
  à chaque facture individuelle, donc insuffisant seul pour corriger le bug.
- **Solution retenue : `invoicesauditreport`** — rapport wheelsys jamais
  exploré avant, trouvé par Julien (`/ui/reports/invoicesauditreport.aspx`).
  Testé en live : confirmé comme un **vrai grand livre facture, une ligne =
  une facture**, avec son propre montant (`netamount`/`total`) et sa propre
  date d'émission (`invoicedateclean`) — résout intégralement les deux bugs.
  Champs utiles : `invoice` (`INV-`/`CRE-`), `docinfo` (`"Rental Invoice"` /
  `"Adjustment Rental Invoice"` / `"Adjustment Rental Credit Note"`),
  `partner_name`/`partner_codeid` (identité client, même convention que
  `corporatecodeid`/`corporatename` ailleurs), `station`/`stationname`,
  `void`/`cancelling` (à exclure du CA), `balance`. Les avoirs ont un
  `netamount` déjà négatif → sommer directement donne le CA net sans logique
  de soustraction séparée à maintenir.
- **Backend** (`api/report.js`) : le 5ᵉ appel D-024 (`mtdtype='1'`) est
  remplacé par un appel à `invoicesauditreport` (seul filtre confirmé requis :
  `dddf#dt`). Filtre station appliqué côté backend après réception (pas de
  `edstations` confirmé sur ce rapport). Factures `void`/`cancelling`
  éliminées avant retour. Nouveau **6ᵉ appel** : `enCoursActuel` —
  `rentalagreementfinancials` `mtrtype=2`/`mtdtype=2` sur une **plage large
  fixe** (2015-01-01 → aujourd'hui+2j), **indépendante de la période
  choisie**, pour capter les contrats encore actifs démarrés bien avant la
  fenêtre sélectionnée (répond à la question posée à Julien : "oui, ajouter
  cette vue séparée").
- **Frontend** (`index.html`) : `computeStatsAggregation(factureRaw,
  enCoursActuel, impayeItems)` — nouvelle signature à 3 sources. `factureRaw`
  alimente le CA facturé/nombre de factures/avoirs (agrégation directe, plus
  de split Clôturé/En cours puisque chaque ligne est déjà une vraie facture).
  `enCoursActuel` alimente uniquement le signal "longue durée en cours"
  (≥ 30 j, seuil D-024 inchangé), croisé par client — y compris pour les
  clients **sans aucune facture sur la période** (`enCoursSansFacture`),
  jamais cachés, remontés uniquement dans le panneau "Aide à la décision"
  puisqu'ils n'ont pas de ligne CA à classer.
- **Bandeau d'hypothèses** (`statsAssumptionsBannerHtml`) très allégé — les 2
  points bloquants de D-024 sont résolus, il ne reste qu'une note informative
  sur la portée de la vue "longue durée" (indépendante de la période).
- **Écarté** : diviser proportionnellement `caHT` par le nombre de factures
  d'un contrat multi-facturation pour estimer un montant par cycle (inventerait
  un chiffre non vérifié — mêmes réserves que D-014/D-016, aucune garantie que
  les cycles de facturation soient d'égal montant) ; exclure entièrement les
  contrats multi-facturation du CA (aurait mis à zéro le CA des clients
  longue durée précisément les plus importants pour Julien) ; garder
  `mtdtype=1` en le corrigeant par un calcul dérivé (aucune donnée disponible
  en masse pour reconstituer un montant par facture à partir du total contrat).
- **Tests** : QA fonctionnelle en navigateur avec jeu de données synthétique
  couvrant factures multiples/avoirs/agences multiples, contrats "longue
  durée en cours" avec ET sans facture sur la période, période de 200 jours
  (> 60j, regroupement mensuel), tri/filtre/recherche/objectif éditable/export
  — tous vérifiés fonctionnels. Aucune suite de tests automatisée (cohérent
  avec le reste du frontend, un unique `index.html` vanilla JS).
- **À faire par Julien avant de déployer** (voir ROADMAP Phase 7bis) : tester
  en vrai navigateur avec de vraies données (la QA de cette session utilise un
  jeu de données synthétique, faute de pouvoir garder une session wheelsys
  ouverte depuis le sandbox). Repartir chercher, lors d'une prochaine session
  avec accès live, un éventuel rapport encore plus direct si besoin — non
  bloquant, `invoicesauditreport` est déjà jugé suffisant (choix de Julien).

## D-026 — Aide à la décision repliable/regroupable + bug du lien client identifié (bloque le futur module Credit rating)

- **Date** : 2026-07-19
- **Demande Julien** : la section "Aide à la décision" (Stats clients)
  affichait jusqu'à 53 lignes empilées les unes sous les autres — demande
  d'un système de synthèse, un menu qui se déplie/replie par thématique ou
  par agence. Julien a aussi signalé un lien client cassé ("le lien vers le
  compte client n'est pas bon, cela créé un compte corporate"), avec un
  exemple de lien correct fourni (`corporate.aspx?entityId=71401`).
- **Synthèse repliable** : les insights sont désormais des objets structurés
  `{theme, severity, agence, html}` (`statsBuildInsights`) plutôt que des
  chaînes à plat, regroupés en blocs `<details>` repliables (`statsInsightsHtml`)
  — par thématique par défaut (Concentration client / Impayés à relancer /
  Contrats longue durée en cours / Sous objectif), avec bascule "Par
  thématique / Par agence" (`statsSetInsightGroupBy`). Seuls les groupes
  contenant au moins une alerte "high" (concentration, impayés) sont dépliés
  par défaut ; le choix manuel de l'utilisateur est respecté entre deux
  re-render (`_statsInsightsOpen`).
- **Bug du lien client — root-cause confirmé en direct** (session Chrome sur
  le vrai compte wheelsys, consultation seule, aucune modification) :
  `r.clientEntityId` (alimenté par `partner_codeid` côté `invoicesauditreport`
  et `corporatecodeid`/`drivercodeid` côté `rentalagreementfinancials`) est en
  réalité le **numéro de compte affiché** dans l'en-tête wheelsys ("Corporate
  Customer - 1457", "Individual Renter - 1211"), **pas** le véritable
  `entityId` interne utilisé par les URLs `manage/master/*.aspx?entityId=`.
  Deux numérotations totalement indépendantes. Vérifié sur deux cas réels :
  - BG GLOBAL : référence compte **1457** (= ce que notre app utilisait comme
    "entityId") vs vrai `entityId` **69511** (type *Corporate* →
    `corporate.aspx`).
  - Philippe MALHEIROS : référence compte **1211** vs vrai `entityId`
    **48836** (type *Individual Renter* → `driver.aspx`, jamais
    `corporate.aspx`).
  Un lien construit avec la référence compte pointe donc vers "Record not
  found" (nouvel enregistrement vide) ou, par pure coïncidence numérique,
  vers la fiche d'un **client totalement différent** — pire que pas de lien
  du tout.
- **Découverte en bonus, non demandée mais importante** : `getClientPaymentInfo()`
  (`api/report.js:184-213`, utilisée pour le badge "délai de paiement" affiché
  dans toute l'app, pas seulement Stats) appelle `corporate.aspx/GetEntityData`
  avec ce même `corporatecodeid`/`drivercodeid` erroné. En observant le vrai
  trafic réseau émis par wheelsys lui-même en chargeant une fiche client, le
  point d'entrée réel est `partner.aspx/getPartnerInfo` — `corporate.aspx/GetEntityData`
  ne semble plus exister tel quel côté serveur actuel (réponse HTML de la SPA,
  pas de JSON). Cette fonction est donc très probablement **silencieusement
  cassée depuis un moment** (retourne `null`, badge affiché "—"), indépendamment
  du bug d'ID — à vérifier/refaire avant de s'appuyer dessus pour quoi que ce
  soit.
- **Piste de résolution identifiée** (non branchée) : la barre de recherche
  globale wheelsys appelle `POST /api/entities/globalsearch` et renvoie des
  entrées `{Id, Domain, DisplayValue, EntryType}` où `Id` est le **vrai**
  `entityId` et `EntryType` (`"Driver"` / `"Corporate"` confirmés en direct)
  indique la page cible. Testé avec succès en cliquant la suggestion dans
  l'UI (résout correctement BG GLOBAL → 69511/Corporate et MALHEIROS →
  48836/Driver). Le contrat d'appel exact (nom + forme du champ de recherche
  dans le corps POST) **n'a pas pu être confirmé** : les tentatives directes
  (`searchTerm`, `term`, `query`, `q`, `text`, chaîne brute) renvoient toutes
  une erreur 500 générique, et l'outil de capture réseau bloque volontairement
  la lecture du corps de la requête réelle envoyée par le navigateur (donnée
  jugée sensible/possible jeton de session) — protection légitime, pas
  contournée.
- **Correctif appliqué (stopgap, déployé)** : `clientLink()` (`index.html`)
  n'essaie plus de construire un lien vers wheelsys — affiche le nom client en
  texte simple (`escHtml`) le temps que la résolution `entityId` réelle soit
  rebranchée. Mieux un nom sans lien qu'un lien qui envoie vers le mauvais
  client ou une page vide.
- **Impact direct sur la demande "module Credit rating"** (voir demande du
  jour, plan pas encore écrit) : ce module doit (a) identifier le bon client
  dans wheelsys pour lire/écrire son délai de paiement, (b) lire l'état actuel
  via un vrai endpoint (`getPartnerInfo` à confirmer, pas `GetEntityData`),
  (c) écrire via un endpoint pas encore identifié du tout. Les points (a) et
  (b) sont directement bloqués par ce qui vient d'être découvert : bâtir une
  écriture sur un `entityId` faux risquerait de modifier le compte du
  **mauvais client** en production — donc **aucune écriture ne doit être
  tentée avant** une session de découverte live dédiée (même méthode que
  D-025 pour `invoicesauditreport`) qui confirme (1) le contrat d'appel de
  `/api/entities/globalsearch`, (2) le contrat d'appel réel de
  `getPartnerInfo` (ou équivalent) pour lire le délai de paiement actuel, (3)
  l'existence et le contrat d'un endpoint d'écriture.
- **Écarté** : garder le lien tel quel en espérant que l'ID soit bon "la
  plupart du temps" — écarté, vérifié faux sur 2/2 cas testés et le risque
  (envoyer Julien vers la fiche d'un autre client) est disproportionné par
  rapport au confort d'un lien cliquable.

## D-027 — Résolution du vrai entityId débloquée, lien client réparé (approche assistée), écriture reportée

- **Date** : 2026-07-19 (même jour que D-026, suite directe)
- **Contrat de `/api/entities/globalsearch` confirmé par Julien** (capture
  DevTools en direct sur sa vraie session) : `POST`, **form-urlencoded** (pas
  JSON — c'est ce qui faisait échouer toutes mes tentatives précédentes),
  corps `searchIndex=%<terme>%&exact=F` (le terme est entouré de `%` façon
  SQL `LIKE`, `exact=F` = recherche floue). Réponse : tableau de
  `{Id, Domain, DisplayValue, EntryType}` — `Id` est le vrai `entityId`,
  `EntryType` (`"Corporate"` / `"Driver"` confirmés) indique la page cible
  (`corporate.aspx` / `driver.aspx`).
- **Lecture confirmée aussi** : `POST partner.aspx/getPartnerInfo` avec
  `{tenantId: 387, partnerId: "<entityId>"}` → 200, testé sur deux clients
  différents. `tenantId` semble une constante fixe par tenant wheelsys (à
  reconfirmer si un jour utile, non exploité pour l'instant).
- **Écriture (Credit rating)** : capturée en direct par Julien — postback
  ASP.NET AJAX complet vers `corporate.aspx?modal=1&entityId=<id>`,
  nécessitant un `cachekey` frais lié à un chargement de page précis et le
  renvoi de **tous les champs du formulaire** (~100, y compris des grilles
  encodées en JSON) avec une seule valeur modifiée
  (`corporateCreditRating_combo` — confirmé être le bon champ, menu avec au
  moins : VRT Récep Facture, 30J DDF, 45J DDF, Atradius, Comptant, Ne plus
  louer, Prélèvement).
- **Décision (choix explicite de Julien, question posée directement)** :
  **approche assistée**, pas d'écriture automatique. Reproduire le postback à
  ~100 champs depuis un backend serverless est jugé trop fragile (casse
  silencieusement si wheelsys change son formulaire) et trop risqué (une
  erreur de champ peut toucher autre chose que le Credit rating sur la fiche
  d'un vrai client). Le module ouvrira directement la bonne fiche wheelsys
  (via la résolution ci-dessus) ; c'est Julien/son équipe qui change la
  valeur et clique Save eux-mêmes dans wheelsys. Aucune écriture depuis notre
  code.
- **Implémenté** :
  - `api/resolve-client.js` (nouveau fichier, endpoint Vercel dédié) : reçoit
    `{name}`, appelle `globalsearch` avec le cookie wheelsys de la session
    app (même pattern d'auth que `api/report.js`), retourne les candidats
    `{id, type, label, url}` (URL déjà construite selon `EntryType`).
  - `index.html` : `clientLink(r)` construit un élément cliquable
    (`.client-open`) au lieu du texte simple du stopgap D-026. Au clic,
    `openClientInWheelsys(name, el)` appelle `/api/resolve-client`, prend le
    résultat dont le `label` contient le nom recherché (repli sur le premier
    résultat si aucun ne correspond exactement), et ouvre son `url` dans un
    nouvel onglet. 0 résultat → message clair invitant à chercher
    manuellement dans wheelsys plutôt qu'un lien mort silencieux.
  - QA faite dans le Browser pane avec `fetch('/api/resolve-client')` mocké
    (0 résultat et 1 résultat) — comportement vérifié correct dans les deux
    cas ; pas de test live supplémentaire nécessaire, le contrat vient d'une
    capture réelle de Julien, pas d'une supposition.
- **Sécurité** : les cURL partagés par Julien pour cette découverte
  contenaient un cookie de session wheelsys actif et des données personnelles
  réelles d'un client (nom, email, téléphone, 4 derniers chiffres CB) — rien
  de tout ça n'a été copié dans le code ni dans la documentation ; seuls les
  noms de champs et la structure des requêtes sont retenus ici.
- **Reste non fait** (volontairement, cf. décision ci-dessus) : aucune
  écriture automatique du Credit rating. Si Julien change d'avis plus tard,
  repartir du postback capturé (référencé dans l'historique de conversation,
  pas dans ce fichier) plutôt que de le redécouvrir.

---
_Liés : [instructions.md](./instructions.md) · [KNOWLEDGE.md](./KNOWLEDGE.md) ·
[ROADMAP.md](./ROADMAP.md)_
