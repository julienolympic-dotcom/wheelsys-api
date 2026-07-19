# ROADMAP.md — Wheels Report

> Où on va. Phases séquentielles.

---

## Phase 0 — Initialisation ✅
- [x] `instructions.md`, `KNOWLEDGE.md`, `ROADMAP.md`
- [x] Docs et structure de projet

## Phase 1 — Découverte API ✅
- [x] Instance wheelsys identifiée : `lutam.wheelsys.io`
- [x] Auth reverse-engineerée (ASP.NET cookies + VIEWSTATE)
- [x] Endpoints principaux documentés dans KNOWLEDGE.md §3
- [x] Modèle de données réel capturé (§4)

## Phase 2 — Client API (lecture seule) ✅
- [x] Proxy backend Node.js avec auth automatique
- [x] `api/report.js` — appels GenerateReportData
- [x] `.env.example` + secrets Vercel

## Phase 3 — Rapports de contrôle ✅ (90%)
- [x] **R1 — Cautions manquantes** — jointure preauthorizations × rentalagreementfinancials
- [x] **R2 — Paiements départ** — custbalance > 0, détail modes paiement
- [x] **R3 — Balances / impayés** — groupé par client, tri montant
- [ ] **Validation finale cautions** — fix field matching `rental` ↔ `displaydocno` en attente confirmation

## Phase 4 — Dashboard web ✅ (live)
- [x] App Vercel déployée : `wheelsys-reporting.vercel.app`
- [x] Auth par identifiants wheelsys (per-user, JWT signé)
- [x] Sélecteur agence (chargé dynamiquement), plage dates, raccourcis
- [x] Liens directs vers fiches contrats wheelsys (`?entityId=`)
- [x] `deploy.bat` pour redéploiement facile

## Phase 5 — Enrichissement données 🔜
- [ ] **Délai de paiement client** : trouver endpoint `corporate.aspx/GetEntityData` ou équivalent pour récupérer les conditions de paiement par client
- [ ] **Colonne délai paiement** dans les tableaux (Départ / Retour / X jours)
- [ ] Filtres avancés : agent, statut contrat, montant minimum
- [ ] Export Excel / PDF du rapport

## Phase 6 — Industrialisation
- [ ] Rapport email automatique (ex. chaque matin à 8h — Vercel Cron)
- [ ] Historisation des KPIs pour suivi de tendance
- [ ] Multi-agences avec vue de synthèse direction

## Phase 7 — Pilotage CA Côte d'Azur (live artifact) 🔜
> Périmètre : 4 agences SLV/GJ/NCE/GR. Endpoints validés 2026-06-12
> (`revenueperstationreport`, `fleetutilizationreport`, `rentalagreementfinancials`).
> Classification Utilitaire/Tourisme validée (D-007). Type client Pro/Particulier
> validé (D-008) : `corporatecodeid` non null = Pro, null = Particulier.

- [x] **7.1** Nouveau service Railway dédié (read-only wheelsys, cf. D-004) — code créé dans `/backend-pilotage` (non déployé, en attente credentials + revue Julien) :
      - `GET /api/ca-par-agence?from=&to=` → `revenueperstationreport`
        (netamount = CA HT, par agence SLV/GJ/NCE/GR) — voir KNOWLEDGE.md §9.1
      - `GET /api/rotation?from=&to=` → `fleetutilizationreport` agrégé par
        `cargroup`×`station` (rotation, utilperc) — voir KNOWLEDGE.md §9.2
      - `GET /api/rpd?from=&to=` → `rentalagreementfinancials` agrégé,
        RPD = `netcharge/days`, par agence × catégorie (Util./Tourisme, D-007)
        × type client (Pro/Particulier, D-008) — voir KNOWLEDGE.md §9.3
- [ ] **7.2** Live artifact Cowork (3 vues : CA HT par agence, rotation par
      catégorie/agence, RPD par type client/agence/catégorie)
- [ ] **7.3** Fréquence de refresh + filtres date par défaut (à définir)

## Phase 7bis — Stats clients par agence ✅ 2026-07-19 (D-023)
- [x] Onglet "📊 Stats clients" dans `wheelsys-reporting/index.html` : top clients
      par CA HT/agence (podium animé + tableau détaillé), aide à la décision
      (concentration, croisement impayés, objectifs éditables), lien fiche client
      wheelsys. 100 % frontend, réutilise `json.allRaw`/`json.impaye` déjà chargés.
- [x] `caHT` (netcharge, D-003) ajouté au payload backend `api/report.js`.
- [x] D-024 (2026-07-19) : CA basé sur la date de facturation (mtdtype=1, pas
      checkout) — ⚠️ **approche buggée, remplacée le jour même par D-025**
      (surestimation du CA sur les contrats multi-facturation), conservée
      seulement pour l'historique (KNOWLEDGE §19.1).
- [x] D-025 (2026-07-19, même jour, testé en live avant tout déploiement) :
      CA facturé recalculé depuis `invoicesauditreport` (vrai grand livre
      facture, 1 ligne = 1 facture, testé en live avec la session de Julien),
      nombre de factures réel (plus un proxy), nouvelle vue "contrats actifs
      en ce moment" (`json.enCoursActuel`, indépendante de la période) pour
      le signal longue durée, regroupement mensuel sur la vraie date de
      facturation. Détail : DECISIONS.md D-025, KNOWLEDGE §4.1ter/§19.2.
- [x] Julien a testé en vrai navigateur avec de vraies données — a confirmé le
      risque anticipé ci-dessus : le lien client pointait vers un mauvais
      `entityId` (numéro de compte affiché, pas l'`entityId` interne réel) et
      utilisait toujours `corporate.aspx`, jamais `driver.aspx` pour un
      "Individual Renter". Root-cause confirmé en direct, lien désactivé en
      stopgap (texte simple, plus de lien cassé). Détail complet : DECISIONS.md
      D-026, KNOWLEDGE §4.1/§4.1ter.
- [x] "Aide à la décision" repliable/regroupable (par thématique ou par
      agence) au lieu d'un empilement à plat — D-026.
- [ ] **Reste à faire** (bloquant pour rebrancher le lien client ET pour le futur
      module "Credit rating", cf. Phase 10 ci-dessous) : session de découverte
      live dédiée pour confirmer le contrat d'appel de `POST
      /api/entities/globalsearch` (résout le vrai `entityId` + type
      Corporate/Driver — piste identifiée mais body POST exact non confirmé,
      essais `searchTerm`/`term`/`query`/`q`/`text` tous en 500) et de
      `partner.aspx/getPartnerInfo` (vrai endpoint de lecture fiche client,
      remplace `corporate.aspx/GetEntityData` qui semble mort côté serveur).
- [ ] Seuils de concentration 40 %/60 % (indicatifs, non validés) et seuil
      longue durée 30 jours — à ajuster si besoin dans `STATS_LONGUE_DUREE_JOURS`.
- [ ] Relire le diff (`index.html` + `DECISIONS.md`/`KNOWLEDGE.md`) et
      committer/déployer (`wheelsys-reporting/deploy.bat`) si validé.

## Phase 10 — Module "Credit rating" (délai de paiement client) 🔜 — PLAN À ÉCRIRE
> Demande Julien (2026-07-19) : depuis Stats clients, ouvrir une fenêtre de
> paramétrage du délai de paiement (Credit rating) d'un client, et que la
> sélection mette à jour la fiche directement dans wheelsys. **Première
> fonctionnalité d'écriture du projet** (tout le reste est lecture seule).
- [ ] **Bloqué tant que non résolu** (D-026) : identification fiable du bon
      client wheelsys (`entityId` réel, pas le numéro de compte) — écrire sur
      le mauvais `entityId` modifierait le compte d'un **autre client réel**
      en production.
- [ ] Session de découverte live (même rigueur que D-025) pour confirmer :
      (1) contrat d'appel `/api/entities/globalsearch`, (2) lecture du délai
      de paiement actuel (`getPartnerInfo` ou équivalent, `corporate.aspx/GetEntityData`
      confirmé mort), (3) endpoint d'écriture (pas encore identifié) + son
      contrat exact (quel champ, quelles valeurs autorisées pour "Credit
      rating").
- [ ] Une fois les endpoints confirmés : UI (fenêtre de sélection du délai,
      confirmation explicite avant écriture — action irréversible sur données
      de production réelles), plan détaillé à proposer à Julien avant tout code.

## Phase 8 — Reporting email automatique par agence 🔜
> Paramétrable : fréquence, destinataires, seuil d'alerte.

- [ ] **8.1** Table Supabase `email_settings` :
      `{ id, station_code, recipients (text[]), frequency ('2x_week'|'weekly'|'daily'),
         send_days (int[] — ex. [1,4] = lundi+jeudi), send_time ('08:00'),
         enabled, threshold (0.80) }`
- [ ] **8.2** Vercel Cron (`vercel.json`) : `"0 7 * * 1,4"` (lun + jeu 7h UTC = 8h Paris)
      → `GET /api/email-report` — déclenché automatiquement
- [ ] **8.3** Endpoint `/api/email-report` :
      - lit `email_settings` (Supabase) pour les agences `enabled = true`
      - appelle le rapport wheelsys pour la semaine courante par agence
      - calcule score conformité + anomalies (même logique que dashboard)
      - génère HTML email récapitulatif (cautions manquantes + soldes départ + impayés)
      - envoie via Resend (`RESEND_API_KEY` en env Vercel) aux destinataires configurés
- [ ] **8.4** Page config email dans le dashboard (onglet ⚙️) :
      - par agence : activer/désactiver, ajouter/supprimer emails, choisir fréquence
      - bouton "Tester maintenant" (envoie un email de test immédiat)
- [ ] **8.5** Déduplication : une seule alerte par agence × semaine ISO (contrainte unique
      sur table `email_log` — cohérent avec D-006)

**Stack** : Resend (déjà prévu D-006), Vercel Cron (inclus dans le plan Free/Pro),
Supabase (D-001 — à déployer avant). Aucun serveur supplémentaire requis.

## Phase 9 — Plan de flotte / défleet automatique 🔜 (Planning ✅ 2026-06-24)
> Pilotage des renouvellements : dates de sortie de parc + alertes groupées +
> reco rotation. Règle figée D-009. Source : Vehicle List Report (KNOWLEDGE §10).
> Parc actuel in-scope = **472 vh** (VP 248 · VU 206 · vide 17 · PL 1 exclu).

- [x] **9.1** Capture endpoint `vehiclelistreport` + champs réels (KNOWLEDGE §10)
- [x] **9.2** Règle D-009 (VP +2 / VU +3, `plannedexitdate` prioritaire, saisonnier
      mi-septembre togglable) + table de 9 cas limites
- [x] **9.3** ✅ 2026-06-25 — Moteur `rules.js` (`classeVehicule`, `dureeDetention`,
      `computeDateSortie`, `isParcPresent`) + `test/rules.test.js` (20 tests, 9 cas D-009) — vert
- [x] **9.4** ✅ 2026-06-25 — `lib/planFlotte.js` + route `GET /api/plan-flotte?horizon=12&saisonnier=off`,
      `test/planFlotte.test.js` (20 tests) + **smoke live OK** (468 présents in-scope, KNOWLEDGE §11)
- [ ] **9.4bis** Séparer alertes `dépassé` (`joursRestants < 0`) vs `à venir`
      (`0..horizon`) + tri « prochaines sorties » sur positives (cf. piège §11, propo D-010)
- [ ] **9.5** Rotation durée de détention (`fleetutilizationreport` entrée→aujourd'hui,
      Decimal.js) par catégorie + reco ≥/<70 % + alertes groupées (catégorie × fenêtre)
- [~] **9.6** Restitution : onglet « Plan de flotte » dans `wheelsys-reporting/index.html`
      ✅ 2026-06-25 — 4 états (loading/data/empty/error+retry), split **dépassé** (joursRestants<0)
      vs **à venir** (0..horizon), filtres horizon + toggle saisonnier, export Excel par table.
      Reste : renseigner `PILOTAGE_API` (URL Railway) après deploy backend + redéployer le front.
      `deploy.bat` backend créé (push GitHub → Railway auto-deploy).

---

## NEXT — Prochaine session

```
[2026-06-05] Valider fix cautions (preAuthSource api + 0 faux positifs) — ref session 2
[2026-06-05] Trouver endpoint délai paiement client (corporate tab) — ref session 2
[2026-06-05] Ajouter export Excel (.xlsx) des 3 onglets — ref session 2
[2026-06-23] Déployer v1.5 (exemptions cautions + départs, tables compactes) — deploy.bat
[2026-06-23] Phase 8 email reporting : déployer Supabase (D-001) en prérequis
[2026-06-24] Phase 9.3 — coder rules.js (fonctions pures) + tester 9 cas limites D-009 (sandbox) — ✅ FAIT 2026-06-25
[2026-06-24] Phase 9.4 — route /api/plan-flotte + smoke live — ✅ FAIT 2026-06-25 (468 présents in-scope)
[2026-06-25] Phase 9.4bis — séparer alertes dépassé/à venir + tri prochaines sur positives — ref session plan-flotte
[2026-06-25] Arrêter D-010 (2 buckets dépassé/à venir) avec Julien avant 9.4bis
[2026-06-25] Phase 9.5 — rotation durée de détention + reco 70 % (Decimal.js, fleetutilizationreport) — Planning conseillé
[2026-06-25] Relâcher engines package.json backend-pilotage à ">=20" (warning EBADENGINE sur node 24)
[2026-06-25] backend-pilotage : Julien valide le code relu puis déploie Railway (credentials .env déjà en place) — aucun deploy auto
[2026-06-25] backend-pilotage : `git push` du commit 12e04eb (Blocs 3-4, déjà commité local sur `main`, ahead 1) après relecture — repo GitHub wheels-backend-pilotage
[2026-06-25] Repo parent : exécuter le nettoyage préparé — `.gitignore` racine (créé) + `git rm -r --cached wheelsys-reporting/node_modules` + commit ; réparer l'index si « unknown index entry format » (`Remove-Item .git\index -Force ; git reset`)
[2026-06-25] Repo parent (optionnel) : mettre à jour le pointeur sous-module backend-pilotage vers 12e04eb (sinon le parent reste sur le commit du 12/06)
[2026-06-30] Azure : app registration (Graph app-only, Sites.Selected + admin consent) + vars Railway GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET + FINANCE_SHARE_URL → active la finance temps réel — ✅ FAIT 2026-07-13 (Xefi, cf. D-012)
[2026-06-30] Construire le COCKPIT UI v2 : file d'actions € (SORTIR/PROLONGER/SURVEILLER + raison + éco), KPIs €, filtres/tri/recherche — ✅ FAIT 2026-07-14 (onglet "🎯 Cockpit flotte", wheelsys-reporting/index.html). Reste hors scope volontaire : calendrier des sorties, plan groupé achat, leviers what-if — à faire en Phase 2 si besoin.
[2026-07-14] Tester le cockpit v2 dans un vrai navigateur (le sandbox ne peut pas ouvrir de navigateur) : ouvrir wheelsys-reporting/index.html, onglet 🎯 Cockpit flotte, vérifier filtres dropdown (agence/classe/action/urgence) + recherche + tri + export Excel + bascule "tout le parc"
[2026-06-30] Tester la chaîne finance live (Graph→xlsx→merge) une fois Azure prêt ; vérifier financeDisponible=true et un échantillon (ex. FD-780-TN) — ✅ FAIT 2026-07-13 (smoke-finance.js, 520 véhicules mappés)
[2026-07-14] Relire le diff cockpit v2 (index.html, dans le repo parent sans remote — KNOWLEDGE §12) et committer si validé, puis redéployer (wheelsys-reporting/deploy.bat = vercel --prod)
[2026-07-14] backend-pilotage : commit 83464b7 poussé sur origin/main (reco.js/finance.js/graph.js/financeSource.js + fix coutDetentionMensuel) — Railway redéploie automatiquement. Vérifier le dashboard Railway puis recharger le cockpit pour confirmer action/urgence/finance renseignés
[2026-06-30] Confirmer avec Julien : seuil utilisation 70 % et fenêtre « 12 mois glissants » (D-011)
[2026-07-14] Fix D-014 (garde horizon SORTIR) + D-015 (avdays, catégorie retirée, mise en page) — relancer `node test/reco.test.js` + `node test/planFlotte.test.js` en LOCAL (troncature sandbox, cf. KNOWLEDGE §14) avant de committer backend-pilotage puis pousser (deploy.bat)
[2026-07-14] Après déploiement backend : recharger le cockpit, vérifier que HL-431-TH (ou équivalent hors horizon) passe bien en SURVEILLER et que la colonne Utilisation affiche "X j dispo" sous le %
[2026-07-14] Vérifier visuellement dans un vrai navigateur : conteneur élargi (onglet Cockpit flotte) + barre de défilement en haut synchronisée avec le bas — le sandbox ne peut pas ouvrir de navigateur
[2026-07-14] Fix D-016 (2e bug SORTIR — fenêtre fixe 90j + seuil km 90000, corrige D-014) — tests verts (84/84 : reco 17, planFlotte 47, rules 20). Committer backend-pilotage puis deploy.bat. Confirmer avec Julien si 90 j (fenêtre fixe) correspond à sa réalité terrain, sinon ajuster FENETRE_SORTIE_JOURS_DEFAUT dans reco.js
[2026-07-14] D-017 Plan de renouvellement — construit (backend renewalPlan.js + route + front vignette/top-flop/tableau plan de commande), 25 tests offline verts + 121 tests backend au total (reco 17, planFlotte 47, rules 20, finance 12, renewalPlan 25). RIEN DÉPLOYÉ.
[2026-07-14] Avant de committer backend-pilotage : lancer node test/reco.test.js, test/planFlotte.test.js, test/renewalPlan.test.js, test/rules.test.js, test/finance.test.js EN LOCAL (le sandbox a eu une troncature bash récurrente sur planFlotte.js, cf. KNOWLEDGE §16 — fichier confirmé correct via Read + copie /tmp, mais Julien doit avoir le vrai vert local avant de pousser)
[2026-07-14] CRITIQUE avant de faire confiance à "Rotation détention" en prod : lancer node test/smoke-renewal-plan.js EN LOCAL — valide que avdays (fenêtre large wheelsys) reflète la présence réelle du véhicule, pas la largeur de plage demandée. Si le smoke test dit "HYPOTHÈSE REJETÉE", revenir vers Claude avant d'activer cette mesure
[2026-07-14] Tester visuellement le plan de renouvellement dans un vrai navigateur (vignette 10/20/30, cartes top/flop, tableau plan de commande, export Excel) — le sandbox ne peut pas ouvrir de navigateur
[2026-07-16] D-018 (Excel = source de vérité du parc, exclut les véhicules hors fichier) + D-019 (date sortie Excel prime sur wheelsys, sourceDateSortie traçable) — 100 tests verts (finance 21, rules 25, planFlotte 54). RIEN DÉPLOYÉ. Committer puis deploy.bat (backend + front)
[2026-07-16] Après déploiement : recharger le cockpit, vérifier HK-348-VV → dateSortie = 2026-05-29 avec pastille "contrat Excel" (pas 2026-11-30). Lancer test/smoke-coherence-dates.js en local pour mesurer l'ampleur du problème sur tout le parc (isolé vs systémique) et repérer d'éventuels cas "Excel non parsable" à corriger dans le fichier
[2026-07-16] Tester visuellement en vrai navigateur : sous-nav sticky, clic vignette "Prochaines sorties" → filtre + scroll + flash sur la ligne, colonnes Catégorie/Type séparées, pastille source de date
[2026-07-19] D-024 : CA facturé (mtdtype=1) + en-cours exclu/compté à part + note longue durée (30j) + regroupement mensuel (>60j) — RIEN COMMITÉ. AVANT DE DÉPLOYER : valider en live que mtdtype=1 = vraie date de facturation, et vérifier si wheelsys a un numéro de facture distinct (voir D-024)
[2026-07-19] D-023 : onglet "Stats clients" (top clients par CA/agence, aide à la décision, objectifs éditables en localStorage) — puis D-024 (CA facturé, mtdtype=1, ⚠️ buggé) corrigé le jour même par D-025 (invoicesauditreport, vrai grand livre facture, testé en live). RIEN COMMITÉ. Relire le diff (index.html + api/report.js) et déployer (deploy.bat) si validé. Tester en vrai navigateur avec de vraies données (voir Phase 7bis)
[2026-07-16] D-020 : hiérarchie 3 niveaux date sortie (Excel exact > durée financement Excel colonne Q, plafonnée > règle générique classe), plannedexitdate (wheelsys) totalement abandonné du calcul — 118 tests verts (finance 26, rules 36, planFlotte 56). RIEN DÉPLOYÉ. Committer puis deploy.bat (backend + front)
[2026-07-17] Confirmé par Julien : 24 mois = durée max de détention des VP (symétrique VU 36 mois) — plafond tier 2 D-020 validé pour les deux classes, aucun changement de code
[2026-07-17] D-021 : détail dépliable (+/-) des véhicules à rendre par catégorie dans "Plan de commande" — 100 % frontend (data.alertesHorizon déjà disponible), 8 tests logiques verts (harnais Node isolé). RIEN DÉPLOYÉ. Committer puis deploy.bat front. Tester visuellement en vrai navigateur : clic +/-, alignement de la ligne détail, comportement au tri/recherche
[2026-07-17] D-022 : nouvelle action RENOUVELER (véhicule productif mais en retard → remplacer par un identique, plus de PROLONGER indéfiniment) — reco.js + planFlotte.js (parAction, groupeMap) + frontend (pill orange, filtre dropdown). 81 tests verts (reco 24, planFlotte 57). RIEN DÉPLOYÉ. Committer puis deploy.bat (backend + front)
[2026-07-17] Après déploiement D-022 : recharger le cockpit, vérifier que les véhicules avec retard + utilisation ≥ 70 % affichent bien "RENOUVELER" (pastille orange) et non plus "PROLONGER" — visible notamment dans le détail dépliable du Plan de commande (D-021)
[2026-07-17] Tranché par Julien : « inclure l'ensemble des véhicules dans les chiffres pour avoir une vision réelle » — RENOUVELER inclus dans les KPI € (coût mensuel/capital immobilisé/résiduelle) et le badge/compteur "à sortir", en plus de SORTIR. 57 tests planFlotte + 24 reco verts. RIEN DÉPLOYÉ. Committer puis deploy.bat (backend + front)
[2026-07-16] Après déploiement D-020 : recharger le cockpit, vérifier qu'un véhicule avec dureeFinancementMois renseigné (colonne Q Excel) mais sans dateSortiePrevue affiche bien la pastille "estimé (durée financement)" et la bonne date (fleetentry + durée, plafonnée)
```

---

## Backlog / questions ouvertes
- ❓ Endpoint corporate `GetEntityData` — retourne-t-il `paymenttype` / `paymentdelay` ?
- ❓ La plage du rapport preauthorizations doit-elle être élargie (ex. J-30 au lieu de = plage checkout) ?
- ❓ Montants HT ou TTC dans `custcharge` ?

---
_Liés : [instructions.md](./instructions.md) · [KNOWLEDGE.md](./KNOWLEDGE.md)_
