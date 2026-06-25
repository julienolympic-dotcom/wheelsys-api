# Guide — Capturer les endpoints API wheelsys depuis la console

> wheelsys ne publie pas de doc API. On reconstruit le catalogue d'endpoints
> en **observant les appels réseau** que le front fait pendant qu'on utilise
> l'app. Objectif : remplir KNOWLEDGE.md §2 (auth) et §3 (endpoints).
>
> ⚠️ **Lecture seule.** On observe, on ne déclenche aucune action d'écriture
> volontaire. On ne note jamais un token/cookie réel dans les docs.

---

## 1. Ouvrir l'inspecteur réseau

1. Connecte-toi à ton instance wheelsys (`https://<ton-sous-domaine>.wheelsys.io`).
2. Ouvre les DevTools : `F12` (ou `Ctrl+Shift+I`).
3. Onglet **Network** (Réseau).
4. Filtre sur **Fetch/XHR** (on ne veut pas les images/css).
5. Coche **Preserve log** (conserver le journal) pour garder les appels lors
   des changements de page.

## 2. Reproduire chaque action métier

Pour chaque besoin du projet, fais l'action dans l'app et regarde les appels
qui apparaissent. Cible en priorité :

| Action à faire dans l'app | Endpoint qu'on cherche |
|---|---|
| Ouvrir la liste des contrats / locations | Liste des contrats |
| Ouvrir un contrat précis | Détail contrat (caution, paiement) |
| Ouvrir l'onglet paiements d'un contrat | Paiements |
| Ouvrir la fiche / les soldes d'un client | Balances clients |
| Ouvrir un écran filtré par agence/agent | Params de filtrage |

## 3. Relever pour chaque appel utile

Clique sur l'appel dans la liste → onglets **Headers** / **Payload** /
**Response**. Note dans KNOWLEDGE.md §3 :

- **Méthode** : GET / POST…
- **URL** : le *path* (ex. `/api/v2/contracts`) — pas besoin du domaine complet.
- **Query params / payload** : surtout les filtres (période, agence, agent, id).
- **Réponse** : les **noms de champs** qui nous intéressent
  (caution, montant payé, statut, dates…). Copie un exemple **anonymisé**
  (remplace les vraies valeurs clients par `xxx`).
- **Pagination** : y a-t-il `page`, `limit`, `offset`, `next` ? Combien
  d'éléments par page ?

## 4. Documenter l'auth (sans secret)

Dans l'onglet **Headers** d'un appel, regarde **Request Headers** :
- Y a-t-il un `Cookie` (auth par session) ou un `Authorization: Bearer …`
  (auth par token) ?
- Note **le mécanisme** dans KNOWLEDGE.md §2.
- **Ne copie jamais la valeur réelle** du cookie/token. Écris par ex.
  « auth par cookie de session `wheelsys_session` » — pas la valeur.

## 5. Astuce : exporter proprement

- Clic droit sur un appel → **Copy → Copy as cURL** : capture méthode, URL,
  headers et body d'un coup. Colle-le dans un fichier de travail **local**
  (jamais commité, car contient l'auth) puis recopie dans KNOWLEDGE.md la
  version **anonymisée et sans secret**.
- Tu peux aussi **Save all as HAR** : fichier complet des échanges. ⚠️ un HAR
  contient les cookies/tokens → à traiter comme un secret, ne pas commiter.

## 6. Critère de fin (Phase 1)

La capture est suffisante quand, dans KNOWLEDGE.md, on a `✅ VALIDÉ` pour :
mécanisme d'auth + base URL + les 5 endpoints du §3 (contrats, détail,
paiements, balances, agents) avec leurs champs clés et la pagination.

---
_Liés : [../KNOWLEDGE.md](../KNOWLEDGE.md) · [../instructions.md](../instructions.md)_
