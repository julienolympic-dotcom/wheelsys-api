// Rapports wheelsys prêts à l'emploi.
//
// Le designer de rapports wheelsys expose chaque rapport sous un nom
// (« browser ») et une liste de filtres. Le wrapper générique est
// ClientWheelsys#genererRapport(nomRapport, filtres) ; ce module fournit les
// filtres ÉPROUVÉS EN PRODUCTION (wheels-backend-pilotage) pour le rapport
// « rentalagreementfinancials » (contrats + montants), utilisé notamment par
// l'enrichissement par plaque.
//
// Colonnes attestées sur ce rapport : stationfromcode, days, corporatecodeid,
// cargroup, netcharge (et plateno sur les rapports flotte).

export const RAPPORT_CONTRATS_FINANCIERS = 'rentalagreementfinancials';

/**
 * Filtres du rapport rentalagreementfinancials :
 *   - mtrtype=3 : tous les contrats ;
 *   - mtdtype=2 : plage interprétée sur la date de check-out ;
 *   - dddf#dt   : plage de dates « from|to » (ISO AAAA-MM-JJ) ;
 *   - mtstationmode=1 + edstations=null : toutes les stations.
 */
export function construireFiltresContratsFinanciers(fromIso, toIso) {
  return [
    { FilterName: 'mtrtype', ControlName: 'rptmtrtype', FilterType: 'ftMemTypeSingle', Required: true, Value: '3', Caption: 'Rentals' },
    { FilterName: 'mtdtype', ControlName: 'rptmtdtype', FilterType: 'ftMemTypeSingle', Required: true, Value: '2', Caption: 'Date basis' },
    { FilterName: 'dddf#dt', ControlName: 'rptdddfdt', FilterType: 'ftDateRange', Required: true, Value: `${fromIso}|${toIso}`, Caption: 'Date range' },
    { FilterName: 'mtstationmode', ControlName: 'rptmtstationmode', FilterType: 'ftMemTypeSingle', Required: true, Value: '1', Caption: 'Station selection' },
    { FilterName: 'edstations', ControlName: 'rptedstations', FilterType: 'ftStation', Required: false, Value: null, Caption: 'Stations' },
  ];
}

/**
 * Exécute le rapport rentalagreementfinancials sur une plage de check-out
 * [from, to] (dates ISO AAAA-MM-JJ) et renvoie les lignes.
 */
export function contratsFinanciers(client, { from, to }) {
  return client.genererRapport(RAPPORT_CONTRATS_FINANCIERS, construireFiltresContratsFinanciers(from, to));
}
