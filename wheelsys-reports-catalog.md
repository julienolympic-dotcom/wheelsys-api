# Catalogue des rapports wheelsys — répertoire de référence

> Capturé le 2026-07-19 par lecture du menu **Reports** (`lutam.wheelsys.io`),
> compte "Service Account". **Consultation uniquement — aucune modification,
> aucun rapport exécuté/soumis.** Extraction faite en lisant directement la
> structure du menu déroulant (`ul.dropdown-menu.multi-level`), pas en cliquant
> un par un.
>
> **82 rapports** répertoriés sur 9 catégories (KNOWLEDGE.md §8bis mentionnait
> "86" d'une session précédente — écart non expliqué : rôle du compte utilisé,
> évolution de wheelsys depuis juin, ou légère différence de méthode de
> comptage. Pas de quoi s'inquiéter, mais à garder en tête si un rapport
> attendu manque ici).
>
> **Comment piocher dedans** : chaque ligne donne le nom affiché dans wheelsys
> et le slug `browser` à utiliser tel quel dans l'appel déjà utilisé partout
> dans ce projet :
> ```json
> POST /ui/reports/exreportpreview.aspx/GenerateReportData
> { "browser": "<slug>", "title": "<slug>", "filters": "[...]" }
> ```
> Les filtres requis ne sont **pas** documentés ici (il faut les découvrir à
> l'usage, comme pour tous les rapports déjà intégrés — appeler avec
> `filters: "[]"` renvoie en général une erreur listant le ou les champs
> obligatoires, sauf exception comme `invoicesauditreport` qui répond avec un
> code 500 générique sur filtre manquant, cf. KNOWLEDGE §4.1ter). Avant
> d'intégrer un nouveau rapport, prévoir une petite session de découverte des
> filtres + un test live comme celui fait pour `invoicesauditreport` (D-025).

---

## Déjà intégrés dans `wheelsys-reporting` (référence rapide)

| browser | Utilisé pour |
|---|---|
| `rentalagreementfinancials` | Paiements départ, Cautions, Impayés, Tous les contrats (KNOWLEDGE §4.1) |
| `preauthorizations` | Cautions réelles (KNOWLEDGE §4.2) — ⚠️ absent du menu Reports actuel, voir note en fin de fichier |
| `revenueperstationreport` | CA HT par agence, backend-pilotage (KNOWLEDGE §4.3) |
| `fleetutilizationreport` | Rotation flotte, cockpit (KNOWLEDGE §4.4) |
| `vehiclelistreport` | Plan de flotte / défleet (KNOWLEDGE §10) |
| `invoicesauditreport` | CA facturé, onglet Stats clients (KNOWLEDGE §4.1ter, D-025) |
| `customerbalancereport` | Exploré (session 2026-06-24), pas encore branché dans l'app |
| `unpaidrentalsreport` | Exploré, pas encore branché |
| `paymentsjournal` | Exploré, pas encore branché |
| `periodincomereport` | Exploré, pas encore branché |
| `bookedvsrented` | Exploré, pas encore branché |

---

## 1. Booking Reports (2)
| Nom wheelsys | browser |
|---|---|
| Reservations Journal | `reservationjournal` |
| Reservations Financial | `reservationfinancial` |

## 2. Rental Reports (13)
| Nom wheelsys | browser |
|---|---|
| Daily Check-Outs / Check-Ins Report | `dailypickupreturn` |
| Deliveries Journal Report | `rentaldeliveriesjournal` |
| Collection Journal Report | `rentalcollectionjournal` |
| Lost Fuel and Mileage Report | `carcheckreport` |
| Rental Agreement Financials Report | `rentalagreementfinancials` ✅ déjà utilisé |
| Detailed Rentals Report | `detailedrentalreport` |
| Non Revenue Tickets Report | `nonrevenuereport` |
| Fuel Audit Report | `fuelauditreport` |
| Rental Exchanges Report | `rentalexchanges` |
| Rental Extensions Report | `rentalextensions` |
| Renters List | `renterslist` |
| Airline Miles Report | `airlinemilesreport` |
| Lost Revenue Report | `lostrevenuereport` |

## 3. Sales Reports (4)
| Nom wheelsys | browser |
|---|---|
| Booked vs Rented Revenue | `bookedvsrented` |
| Extra Sales Report | `extrasalesrpt` |
| Incremental Sales Report | `incrementalsalesrpt` |
| Sales Comparison Report | `salescomparisonreport` |

## 4. Fleet Reports (23)
| Nom wheelsys | browser |
|---|---|
| Fleet Activity Report | `fleetactivityreport` |
| Fleet Utilization Report | `fleetutilizationreport` ✅ déjà utilisé |
| Fleet Depreciation Report | `depreciationreport` |
| Claims Report | `claimsreport` |
| Vehicle List Report | `vehiclelistreport` ✅ déjà utilisé |
| Fleet Maintenance Journal | `fleetmaintenancejournal` |
| Fleet Maintenance PO Report | `fleetmaintenanceporeport` |
| Fleet Expenses Journal | `fleetexpensesjournal` |
| Traffic Violation Report | `trafficviolation` |
| CO2 Emissions Report | `co2emissions` |
| Fleet Damages Report | `fleetdamages` |
| Fleet Damages List Report | `fleetdamageslist` |
| Insurance Expiration Report | `carinsurancecheck` |
| Green Card Expiration Report | `greencardcheck` |
| Road Assistance Expiration Report | `carroadassistancecheck` |
| MOT Expiration Report | `carmotcheck` |
| Fire Extinguisher Expiration Report | `carfireextinguishercheck` |
| Fleet Aging Journal | `fleetagingjournal` |
| Planned Defleet Report | `planneddefleetreport` — 👀 pertinent pour le module Plan de flotte (D-009) |
| Fleet PnL Report | `fleetpnlreport` — 👀 pertinent pour le Cockpit flotte (couche finance, D-012) |
| *Fleet Import Template* | — (pas un rapport, formulaire d'import) |
| Vehicle equipment Report | `vehicleequipmentreport` |
| Current Situation Report | `currentsituationreport` |

## 5. Agent Reports (5)
| Nom wheelsys | browser |
|---|---|
| Sales Performance Report | `salesperformancereport` |
| Agent Commission Report | `agentcommission` |
| Agent Vouchers Report | `agentvouchersreport` |
| Agent Vehicle Subrentals | `vehiclesubrentals` |
| Agent Rental Days | `agentrentaldays` |

## 6. Financial Reports (21) — la plus riche pour le pilotage CA/clients
| Nom wheelsys | browser |
|---|---|
| Invoices Audit Report | `invoicesauditreport` ✅ déjà utilisé (D-025) |
| Rental Invoices Audit | `rentalinvoicesauditreport` — 👀 variante à comparer avec invoicesauditreport, jamais testée |
| Payments Journal | `paymentsjournal` |
| Cash Transactions Journal | `dailycash` |
| Bank Transactions Journal | `banktransactions` |
| Cheque Transactions Journal | `dailycheque` |
| Credit Card Transactions Journal | `creditcard` |
| Prepayment Transactions Journal | `prepaymentjournal` |
| Sales Invoices Journal | `salesinvoices` — 👀 nom proche d'invoicesauditreport, à comparer |
| Purchase Invoices Journal | `purchaseinvoices` |
| Unpaid Invoices Report | `unpaidinvoicesreport` — 👀 pourrait remplacer/compléter le calcul impayés actuel (basé sur custbalance) |
| Customer Balance Report | `customerbalancereport` |
| Customer Ledger Report | `customerledgerreport` — 👀 grand livre par client, pertinent pour un futur historique client détaillé |
| Revenue Analysis Report | `shortlongtermrevenueanalysis` — 👀 nom suggère une distinction court/long terme déjà native côté wheelsys, à vérifier avant de garder notre propre seuil 30j (D-024) |
| Unpaid Rentals Report | `unpaidrentalsreport` |
| Uninvoiced Rental Charges Report | `uninvoicedrentalchargesreport` — 👀 **candidat direct** pour remplacer/valider la vue "contrats actifs en cours" de D-025 |
| Accrued Revenue Report | `accruedrevenuereport` — 👀 pertinent pour la note "CA contrat longue durée en cours" (D-024/D-025) |
| Period Income Report | `periodincomereport` |
| Estimated Monthly Revenue Report | `estimatedmonthlyrevenuereport` — 👀 pourrait aider le découpage mensuel (D-025) |
| Revenue per Station Report | `revenueperstationreport` ✅ déjà utilisé |
| Monthly Rental Revenue Report | `monthlyrentalrevenuereport` — 👀 alternative native au regroupement mensuel fait à la main (D-025) |

## 7. Stock Inventory Reports (8)
| Nom wheelsys | browser |
|---|---|
| Inventory Report | `inventoryreport` |
| Inventory Balance Sheet | `inventorybalancesheet` |
| Inventory Finance History | `inventoryfinancehistory` |
| Equipment Journal Report | `equipmentjournal` |
| Equipment Utilization Report | `equipmentutilization` |
| Tires on Vehicle Report | `tiresonvehiclereport` |
| Tires Inventory Report | `tiresinventoryreport` |
| Tires Activity Report | `tiresactivityreport` |

## 8. Security & Compliance (3)
| Nom wheelsys | browser |
|---|---|
| User Authorization Report | `userauthorizationreport` |
| Role Permissions Summary | `rolepermissionssummary` |
| PAN Data Audit Log Report | `pandataauditlogreport` |

## 9. System Reports (3)
| Nom wheelsys | browser |
|---|---|
| Sequence Numbering Report | `verifysequencenumberingreport` |
| Multiple Sequence Prefixes Report | `multiplesequenceprefixesreport` |
| Documents Pending Signing Report | `documentspendingsigningreport` |

---

## Notes

- **`preauthorizations`** (utilisé par `getPreAuthBatch` dans `api/report.js`
  pour les cautions) **n'apparaît dans aucune des 9 catégories** de ce menu.
  Le rapport répond pourtant toujours (utilisé quotidiennement dans l'app) —
  probablement accessible par appel direct sans entrée dans ce menu, ou classé
  sous un libellé différent que je n'ai pas identifié. Pas bloquant (l'app
  fonctionne), juste une incohérence à noter si le menu est ré-exploré un jour.
- 👀 = piste identifiée pendant cette capture, jamais testée en live — à
  qualifier (champs réels, filtres requis) avant toute intégration, même
  pattern que pour `invoicesauditreport` (D-025) : ne jamais faire confiance
  au nom seul, toujours vérifier les champs réels sur un appel live avant de
  bâtir une feature financière dessus.
- Cette capture ne dit rien des **filtres requis** ni des **champs de
  réponse** de chacun de ces 82 rapports — seulement qu'ils existent et leur
  nom d'appel (`browser`). C'est un point de départ pour piocher, pas une
  documentation de champs (cf. KNOWLEDGE.md pour les rapports déjà creusés en
  détail).

---
_Lié à : [KNOWLEDGE.md](./KNOWLEDGE.md) §8bis · [DECISIONS.md](./DECISIONS.md) D-025_
