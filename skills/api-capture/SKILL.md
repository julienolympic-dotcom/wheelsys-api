---
name: api-capture
description: Relever et documenter les endpoints API wheelsys depuis la console réseau du navigateur, puis mettre à jour KNOWLEDGE.md. Utiliser au démarrage du projet ou quand un appel manque.
---

# Skill : Capture d'endpoints API wheelsys

## Quand l'utiliser
- Phase 1 du projet (découverte de l'API).
- Quand un rapport a besoin d'une donnée dont l'endpoint n'est pas encore
  documenté dans `KNOWLEDGE.md` §3.

## Procédure
1. Suivre `docs/api-capture-guide.md` (inspecteur réseau, filtre Fetch/XHR).
2. Pour chaque action métier ciblée, relever : méthode, path, params, champs
   de réponse utiles, pagination.
3. Documenter le **mécanisme d'auth** (jamais le secret) dans KNOWLEDGE.md §2.
4. Remplir le catalogue d'endpoints (KNOWLEDGE.md §3) et passer les lignes en
   `✅ VALIDÉ`.
5. Corriger le modèle de données §4 selon la réalité observée (lever les
   `⚠️ HYPOTHÈSE`).

## Règles
- **Lecture seule** : n'observer que des consultations, jamais déclencher
  d'écriture pour « voir l'appel ».
- **Aucun secret** dans les docs : pas de cookie/token réel, pas de HAR commité.
- Anonymiser les exemples de réponse (valeurs clients → `xxx`).

## Sortie attendue
KNOWLEDGE.md à jour : auth + base URL + endpoints clés `✅ VALIDÉ`, avec
pagination documentée.
