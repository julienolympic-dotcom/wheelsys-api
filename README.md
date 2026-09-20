# wheelsys-api

Librairie Node.js (ESM, **zéro dépendance runtime**, Node ≥ 20) pour consommer
les données de `wheelsys.io` (logiciel métier de location de véhicules) avec un
**compte de service en lecture seule** :

- **Login** ASP.NET Web Forms sur `https://<tenant>.wheelsys.io` (session mise
  en cache ~25 minutes, re-login automatique si elle expire) ;
- **Rapports** via `POST /ui/reports/exreportpreview.aspx/GenerateReportData` :
  wrapper générique `genererRapport(nomRapport, filtres)` + filtres prêts à
  l'emploi pour `rentalagreementfinancials` (contrats + montants) ;
- **Enrichissement par plaque** : `enrichirParPlaque(plaque, nomConducteur,
  options)` retrouve le contrat actif d'un véhicule et en extrait numéro de
  contrat, client, conducteur, téléphone, agence et dates — sans jamais lever
  d'exception (`null` en cas d'échec).

Le transport est celui éprouvé en production par `wheels-backend-pilotage`
(même famille d'instances `*.wheelsys.io`) ; le code d'enrichissement est
extrait du connecteur `assistance-connector`, tests compris.

## Installation depuis un autre projet

Dans le `package.json` du projet consommateur :

```json
{
  "dependencies": {
    "wheelsys-api": "github:julienolympic-dotcom/wheelsys-api#v0.1.0"
  }
}
```

(`#v0.1.0` = tag figé, recommandé ; `#master` suit la branche par défaut.)

> **Repo privé et build Railway (ou tout CI)** : `npm install` d'une dépendance
> `github:` sur un repo **privé** échoue sans authentification. Deux options :
>
> 1. passer le repo `wheelsys-api` en **public** (rien à configurer) ; ou
> 2. le laisser privé et fournir un **token GitHub** au build : créer un token
>    (fine-grained, lecture seule du repo) et déclarer la dépendance en
>    `git+https://x-access-token:${GITHUB_TOKEN}@github.com/julienolympic-dotcom/wheelsys-api.git#v0.1.0`
>    avec la variable `GITHUB_TOKEN` définie dans les variables du service
>    Railway (jamais dans le code ni dans le repo).

## Usage

```js
import { ClientWheelsys, clientDepuisEnv, contratsFinanciers } from 'wheelsys-api';

// 1) Configuration explicite…
const client = new ClientWheelsys({
  tenant: 'olcda',            // ou baseUrl: 'https://olcda.wheelsys.io'
  username: 'compte.service@example.com',
  password: '…',
  agence: 'NCE',              // optionnel, informatif
});

// …ou depuis les variables d'environnement WHEELSYS_*
const client2 = clientDepuisEnv(process.env);

// 2) Enrichissement par plaque (jamais d'exception : null si introuvable/échec)
const dossier = await client.enrichirParPlaque('AB123CD', 'Marie Exemple', {
  fenetreJours: 120, // fenêtre de recherche des check-out (défaut : 120 jours)
});
// → { numeroContrat, client: { intitule, nom, numero } | null,
//     telephoneConducteur, nomConducteur, agenceDepart,
//     dateDepart, dateRetourPrevue } | null

// 3) Rapport contrats + montants sur une plage de check-out
const lignes = await contratsFinanciers(client, { from: '2026-01-01', to: '2026-01-31' });

// 4) N'importe quel autre rapport wheelsys (wrapper générique)
const ca = await client.genererRapport('revenueperstationreport', [
  { FilterName: 'dddf#dt', ControlName: 'rptdddfdt', FilterType: 'ftDateRange', Required: true, Value: '2026-01-01|2026-01-31', Caption: 'Date range' },
  // … autres filtres du rapport
]);
```

Rapports déjà utilisés en production par les projets Olympic Location :
`rentalagreementfinancials`, `fleetutilizationreport`,
`revenueperstationreport`, `vehiclelistreport` (voir aussi
`wheelsys-reports-catalog.md` à la racine du repo).

## Variables d'environnement (helper `clientDepuisEnv`)

| Variable | Rôle |
|---|---|
| `WHEELSYS_TENANT` | Sous-domaine de l'instance (`olcda` pour `olcda.wheelsys.io`) |
| `WHEELSYS_BASE_URL` | Alternative : URL complète `https://<tenant>.wheelsys.io` |
| `WHEELSYS_USERNAME` | Compte de service (login e-mail) |
| `WHEELSYS_PASSWORD` | Mot de passe du compte de service |
| `WHEELSYS_AGENCE` | Optionnelle, informative (les rapports couvrent toutes les stations) |

`client.estConfigure()` renvoie `false` tant que tenant + identifiants ne sont
pas fournis ; `enrichirParPlaque` renvoie alors `null` sans appel réseau
(un avertissement est journalisé une seule fois).

## API

| Export | Description |
|---|---|
| `ClientWheelsys` | Client (options `{ tenant, baseUrl, username, password, agence }`) : `login()`, `getSession()`, `genererRapport(nomRapport, filtres)`, `callReport(...)` (alias), `enrichirParPlaque(plaque, nomConducteur, options)`, `estConfigure()` |
| `clientDepuisEnv(env)` | Construit un `ClientWheelsys` depuis les variables `WHEELSYS_*` |
| `contratsFinanciers(client, { from, to })` | Rapport `rentalagreementfinancials` sur une plage de check-out |
| `construireFiltresContratsFinanciers(from, to)` | Filtres prod de ce rapport |
| `enrichirParPlaque(client, plaque, nomConducteur, options)` | Variante fonction de la méthode |
| `normaliserPlaque`, `parseDateWheelsys`, `formaterTelephone`, `normaliserNomPersonne` | Helpers de normalisation |

## Tests

```bash
npm test   # node --test — faux serveur, aucun appel réseau réel
```

Les colonnes des rapports ne sont pas toutes documentées par wheelsys : les
champs plaque / client / téléphone / dates sont détectés par motifs de clés,
et les clés réellement renvoyées sont journalisées une fois au premier run
pour validation (même approche best-effort que le connecteur d'origine).
