# instructions.md — Wheels Report

> **Source de vérité du projet.** Tout développement, toute session et tout
> rapport doivent se conformer à ce fichier. Mis à jour explicitement, jamais
> de dérive silencieuse.

---

## 1. Objectif

Construire un outil de **reporting et de contrôle** au-dessus des API de
`wheelsys.io` (logiciel métier de location de véhicules) pour :

1. **Analyser les pratiques des équipes** — KPIs par agent / agence à partir
   des contrats et opérations.
2. **Contrôle paiement au départ** — vérifier que les clients qui doivent
   payer au départ ont bien payé au moment de la sortie du véhicule.
3. **Contrôle des cautions** — vérifier qu'une caution (dépôt de garantie /
   pré-autorisation) est bien inscrite sur **chaque** contrat.
4. **Contrôle des balances clients** — identifier les impayés (soldes
   débiteurs) par client.

## 2. Périmètre

| Inclus | Exclu (pour l'instant) |
|---|---|
| Lecture des données via API wheelsys (read-only) | Toute écriture / modification dans wheelsys |
| Rapports de contrôle (4 axes ci-dessus) | Facturation, encaissement, relances automatiques |
| Dashboard web + exports Excel/PDF | Synchro temps réel / webhooks |
| Agrégations par agent, agence, période | Modifs sur les contrats |

**Principe : l'outil ne fait que LIRE et ANALYSER. Aucune action sur
wheelsys.** Cela limite drastiquement le risque (auth en lecture seule).

## 3. Contexte d'accès API (critique)

- wheelsys.io n'expose **pas** de documentation API publique ni de liste
  d'endpoints.
- L'API est accessible **une fois connecté** à l'application web
  (`*.wheelsys.io`). Les appels se font via le frontend (XHR/fetch).
- **Méthode de découverte** : relever les appels réseau dans la console du
  navigateur lors de l'utilisation de l'app, puis les documenter dans
  `KNOWLEDGE.md`. Voir `docs/api-capture-guide.md`.
- Tant que les endpoints réels ne sont pas capturés et validés, **tout schéma
  de données est une hypothèse** (marqué `⚠️ HYPOTHÈSE` dans KNOWLEDGE.md).

## 4. Stack cible

- **Backend / scripts** : Node.js (client API + collecte + transformation).
- **Frontend** : React (dashboard).
- **Exports** : Excel (.xlsx) et PDF.
- **Déploiement** : Railway (cohérent avec RentalCheck).
- **Secrets** : variables d'environnement (`.env`, jamais commité).
  `.env.example` fourni.

> Aucune ligne de code métier n'est écrite tant que les endpoints ne sont pas
> capturés. Cette session = **docs + skills uniquement**.

## 5. Les 4 contrôles — définition métier

### 5.1 Paiement au départ
- **Entrée** : contrats avec une condition « paiement au départ » (par
  opposition à paiement différé / à terme / sur facture).
- **Contrôle** : à la date/heure de sortie du véhicule, le montant dû au
  départ doit être encaissé (statut payé / montant payé ≥ montant dû au départ).
- **Anomalie** : véhicule sorti sans paiement enregistré alors qu'il était
  exigé.

### 5.2 Cautions
- **Entrée** : tous les contrats actifs / sur une période.
- **Contrôle** : présence d'une caution (montant > 0, ou pré-autorisation
  CB enregistrée) sur le contrat.
- **Anomalie** : contrat sans caution renseignée.

### 5.3 Balances clients / impayés
- **Entrée** : soldes comptables clients.
- **Contrôle** : solde débiteur (le client doit de l'argent) au-delà d'un
  seuil et/ou d'une ancienneté.
- **Sortie** : liste priorisée des impayés (montant, ancienneté, dernier
  mouvement).

### 5.4 Pratiques des équipes
- Agrégation des 3 contrôles ci-dessus **par agent et par agence**.
- KPIs : taux de cautions manquantes, taux de paiements départ manquants,
  encours d'impayés rattachés, volume de contrats.
- Objectif : objectiver, pas sanctionner — fournir des chiffres fiables.

## 6. Règles de données & finance (NON négociables)

- **Données réelles uniquement.** Jamais de chiffre simulé/fictif présenté
  comme réel. Si une donnée manque → le dire explicitement.
- Vérifier systématiquement : **devise** (EUR attendu), **arrondis**, **frais**,
  **TVA/HT-TTC**, **formules** dans tout calcul.
- Une anomalie détectée est une **alerte à vérifier**, pas une accusation :
  toujours afficher le contrat/agent source pour contrôle manuel.
- Horodatage et fuseau : noter le fuseau des dates wheelsys avant de comparer
  « paiement » vs « sortie ».

## 7. Règles de développement (méthodo Antigravity)

- `instructions.md` = source de vérité (ce fichier).
- Documentation itérative : `KNOWLEDGE.md` (ce qu'on apprend) + `ROADMAP.md`
  (où on va).
- **Mode Planning obligatoire** sur : auth, données, finance, PDF, déploiement,
  bugs flous.
- Plus petit correctif sûr possible. Ne pas sur-concevoir, ne pas élargir le
  périmètre.
- **Aucun commit ni déploiement automatique** — validation manuelle par Julien.
- Guidage pas à pas pour les tâches de code.

### Types de session
| Session | Enchaînement |
|---|---|
| Debug | `/open_session` → `/qa-only` → `/guard + /freeze` → `debug-bug.md` |
| Sécurité | `/open_session` → `/cso` → `/investigate` |
| Express | `/open_session MODE LIGHT` |
| Release | `/open_session` → `/cso` → `/qa` → `/review` → deploy |
| Consolidation | `/open_session` → MAJ KNOWLEDGE.md + ROADMAP.md → `/end_session` |

## 8. Sécurité

- Auth wheelsys en **lecture seule** dans l'usage (aucun appel d'écriture).
- Credentials/tokens : `.env` uniquement, jamais en clair dans le code ni les
  docs ni les logs.
- Données clients = données personnelles → ne pas exporter hors du périmètre
  nécessaire, ne pas logguer de PII inutile.

## 9. Definition of Done (par rapport)

Un rapport est « fait » quand : données issues de l'API réelle, calculs
vérifiés (devise/arrondis/formules), anomalies traçables à la source,
export Excel/PDF généré, et résultat relu par Julien.

---

_Voir aussi : [KNOWLEDGE.md](./KNOWLEDGE.md) · [ROADMAP.md](./ROADMAP.md) ·
[docs/api-capture-guide.md](./docs/api-capture-guide.md)_
