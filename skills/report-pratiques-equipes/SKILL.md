---
name: report-pratiques-equipes
description: Analyse des pratiques des équipes — agréger les contrôles (cautions, paiement au départ, impayés) par agent et par agence pour objectiver les pratiques. Produit un tableau de bord KPIs + export Excel/PDF.
---

# Skill : Analyse des pratiques des équipes

## Objectif
Objectiver les pratiques par **agent** et par **agence** en agrégeant les
contrôles R1-R3 (R4). But : fournir des chiffres fiables, pas sanctionner.

## Pré-requis
- Rapports `report-cautions`, `report-paiement-depart`, `report-balances`
  disponibles.
- Référentiel agents / agences `✅ VALIDÉ`.

## Logique
1. Lancer les 3 contrôles sur la même période.
2. Grouper par agent et par agence.
3. Calculer les KPIs :
   - `% contrats sans caution`
   - `% paiements départ manquants`
   - `encours impayés (€)` rattaché
   - `nb contrats` (volume, pour contextualiser les %)

## Sortie
- Tableau KPIs par agent et par agence, triable.
- Synthèse direction (PDF) + détail (Excel).
- Vue tendance si historisation disponible (Phase 6).

## Vérifications obligatoires
- Toujours afficher le **volume** à côté des % (un 100% sur 1 contrat n'est pas
  un 100% sur 200).
- Mêmes période et devise pour tous les KPIs.
- KPI = indicateur à interpréter, pas un verdict. Anomalies traçables à la
  source.
- Données réelles uniquement.
