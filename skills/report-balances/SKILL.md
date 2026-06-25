---
name: report-balances
description: Contrôle des balances clients — identifier les soldes débiteurs (impayés) dans wheelsys, priorisés par montant et ancienneté. Produit une liste + export Excel/PDF.
---

# Skill : Contrôle des balances clients (impayés)

## Objectif
Identifier les clients en solde débiteur (impayés) pour relance/contrôle (R3).

## Pré-requis
- Endpoint `balances` / soldes clients `✅ VALIDÉ`.
- **Signe du solde** confirmé : débiteur = positif ou négatif ? (KNOWLEDGE.md §4).

## Logique
1. Récupérer les soldes clients (gérer pagination).
2. Filtrer les soldes débiteurs au-delà du seuil (défaut **> 0 €**).
3. Trier par montant décroissant puis par ancienneté (`oldest_unpaid_at`).

## Sortie
- Liste priorisée : client, montant dû, ancienneté, dernier mouvement.
- Total des impayés + nb de clients concernés.
- Buckets d'ancienneté (0-30 / 31-60 / 61-90 / 90+ jours) si la donnée existe.
- Export Excel + PDF.

## Vérifications obligatoires
- **Devise** identique avant tout total ; ne pas sommer des devises mixtes.
- **Signe** du solde vérifié pour ne pas inverser créditeurs/débiteurs.
- Pagination complète avant calcul du total (sinon total faux).
- Données réelles uniquement ; donnée manquante → signalée.
