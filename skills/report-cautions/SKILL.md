---
name: report-cautions
description: Contrôle des cautions — détecter les contrats wheelsys sans caution (dépôt de garantie) inscrite. Produit la liste des anomalies et un export Excel/PDF.
---

# Skill : Contrôle des cautions

## Objectif
Vérifier qu'une caution est bien inscrite sur **chaque** contrat sur la période
demandée. C'est le rapport POC le plus simple (R1).

## Pré-requis
- Endpoints `contrats` (liste + détail) `✅ VALIDÉ` dans KNOWLEDGE.md.
- Savoir où vit la caution : champ `deposit_amount` / `deposit_type` ou
  pré-autorisation CB (confirmer — cf. KNOWLEDGE.md §5.2).

## Logique
1. Récupérer tous les contrats de la période (gérer la **pagination**).
2. Pour chaque contrat, anomalie si : pas de caution, montant = 0, ou
   `deposit_type = aucune`.
3. Vérifier que la pré-autorisation CB est bien prise en compte si elle compte
   comme caution.

## Sortie
- Liste d'anomalies : réf. contrat, agence, agent, client, dates, montant
  caution (ou absence), lien/identifiant pour contrôle manuel.
- Synthèse : nb contrats, nb sans caution, **% sans caution**, ventilé par
  agence/agent.
- Export Excel (détail + synthèse) et PDF (synthèse).

## Vérifications obligatoires
- Devise EUR confirmée. Montants en TTC ou non ? (cf. KNOWLEDGE.md §6).
- Une anomalie = alerte à vérifier, pas une accusation : toujours afficher la
  source.
- Données réelles uniquement ; si une donnée manque, le signaler explicitement.
