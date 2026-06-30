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
- [ ] **9.6** Restitution : onglet « Plan de flotte » (4 états) + export Excel

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
```

---

## Backlog / questions ouvertes
- ❓ Endpoint corporate `GetEntityData` — retourne-t-il `paymenttype` / `paymentdelay` ?
- ❓ La plage du rapport preauthorizations doit-elle être élargie (ex. J-30 au lieu de = plage checkout) ?
- ❓ Montants HT ou TTC dans `custcharge` ?

---
_Liés : [instructions.md](./instructions.md) · [KNOWLEDGE.md](./KNOWLEDGE.md)_
