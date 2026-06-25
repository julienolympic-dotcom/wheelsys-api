# skills/ — Skills de reporting Wheels Report

Chaque sous-dossier contient un `SKILL.md` (procédure réutilisable) pour une
tâche récurrente du projet. Elles s'appuient toutes sur la source de vérité
`../instructions.md` et le modèle documenté dans `../KNOWLEDGE.md`.

| Skill | Rôle | Pré-requis |
|---|---|---|
| `api-capture` | Relever / mettre à jour les endpoints wheelsys depuis la console | accès à l'app |
| `report-cautions` | Contrôle : contrats sans caution | endpoints contrats `✅ VALIDÉ` |
| `report-paiement-depart` | Contrôle : paiement exigé au départ non encaissé | contrats + paiements |
| `report-balances` | Contrôle : soldes débiteurs / impayés | endpoint balances |
| `report-pratiques-equipes` | Agrégation des contrôles par agent / agence | R1-R3 disponibles |

> Règle commune : **lecture seule**, **données réelles uniquement**, calculs
> financiers vérifiés (devise / arrondis / formules), anomalies traçables à la
> source. Aucune n'est codée tant que ses endpoints ne sont pas validés.
