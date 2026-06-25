---
name: report-paiement-depart
description: Contrôle paiement au départ — détecter les contrats où le paiement était exigé à la sortie du véhicule mais n'a pas été encaissé. Produit anomalies + export Excel/PDF.
---

# Skill : Contrôle paiement au départ

## Objectif
Vérifier que les clients devant **payer au départ** ont bien payé au moment de
la sortie du véhicule (R2).

## Pré-requis
- Endpoints `contrats` + `paiements` `✅ VALIDÉ`.
- Valeur exacte de `payment_terms` correspondant à « au départ » (confirmer —
  KNOWLEDGE.md §5.1).
- Fuseau horaire des dates wheelsys connu.

## Logique
1. Filtrer les contrats où `payment_terms = "au départ"`.
2. Ne garder que ceux dont la sortie (`checkout_at`) est passée.
3. Anomalie si `amount_paid < amount_due_checkout` (avec tolérance d'arrondi
   ±0,01 €).
4. Optionnel : vérifier que le paiement (`paid_at`) est bien au plus tard à la
   sortie.

## Sortie
- Anomalies : réf. contrat, agence, agent, client, `checkout_at`, montant dû,
  montant payé, écart.
- Synthèse : **% paiements départ manquants** + encours non encaissé, par
  agence/agent.
- Export Excel + PDF.

## Vérifications obligatoires
- **Fuseau horaire** aligné entre `checkout_at` et `paid_at` avant comparaison.
- Devise, arrondis (tolérance, pas `==`), HT/TTC cohérents.
- Anomalie = alerte à vérifier, source toujours affichée.
- Données réelles uniquement.
