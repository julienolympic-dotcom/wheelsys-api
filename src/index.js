// wheelsys-api — librairie cliente wheelsys.io (read-only, compte de service).
//
// Point d'entrée unique : voir README.md pour l'usage.

export { ClientWheelsys, clientDepuisEnv } from './client.js';
export {
  RAPPORT_CONTRATS_FINANCIERS,
  construireFiltresContratsFinanciers,
  contratsFinanciers,
} from './rapports.js';
export { enrichirParPlaque } from './enrichissement.js';
export {
  formaterTelephone,
  normaliserNomPersonne,
  normaliserPlaque,
  parseDateWheelsys,
} from './normalisation.js';
