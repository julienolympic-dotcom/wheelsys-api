// Enrichissement d'un dossier (assistance, SAV…) à partir d'une plaque
// d'immatriculation, via le rapport rentalagreementfinancials.
//
// Colonnes ATTESTÉES par la production sur ce rapport : stationfromcode, days,
// corporatecodeid, cargroup, netcharge (et plateno sur les rapports flotte).
// Les colonnes plaque / nom client / téléphone / dates ne sont pas garanties :
// elles sont DÉTECTÉES à l'exécution par motifs de clés, et les clés réellement
// renvoyées sont journalisées une fois pour validation au premier run.
//
// Règle d'or : enrichirParPlaque ne lève JAMAIS d'exception et renvoie null en
// cas d'échec — l'enrichissement n'est jamais bloquant pour le consommateur.

import {
  formaterTelephone,
  normaliserNomPersonne,
  normaliserPlaque,
  parseDateWheelsys,
} from './normalisation.js';
import { construireFiltresContratsFinanciers, RAPPORT_CONTRATS_FINANCIERS } from './rapports.js';

// Fenêtre de recherche des check-out : un contrat encore actif a démarré
// « récemment » ; au-delà, on considère la plaque introuvable (best-effort).
const FENETRE_JOURS_DEFAUT = 120;

let clesRapportLoggees = false;
let nonConfigureLogge = false;

function estScalaireNonVide(v) {
  return (typeof v === 'string' && v.trim() !== '') || typeof v === 'number';
}

/** Première valeur scalaire non vide dont la clé matche un des motifs (dans l'ordre). */
function champParMotifs(ligne, motifs) {
  for (const motif of motifs) {
    for (const [cle, v] of Object.entries(ligne)) {
      if (motif.test(cle) && estScalaireNonVide(v)) return v;
    }
  }
  return null;
}

/** Téléphone plausible (≥ 6 chiffres) dans une ligne de rapport. */
function telephoneDansLigne(ligne) {
  const brut = champParMotifs(ligne, [/mobile/i, /portable/i, /phone/i, /^gsm/i, /^tel/i]);
  if (brut === null) return null;
  return String(brut).replace(/\D/g, '').length >= 6 ? String(brut) : null;
}

/** La ligne porte-t-elle la plaque cible ? Clés plaque d'abord, sinon balayage. */
function lignePortePlaque(ligne, plaqueCible) {
  const direct = champParMotifs(ligne, [/plate/i, /immat/i, /^reg(istration)?(no|num)?$/i]);
  if (direct !== null) return normaliserPlaque(direct) === plaqueCible;
  return Object.values(ligne).some(
    (v) => typeof v === 'string' && v.length <= 15 && normaliserPlaque(v) === plaqueCible
  );
}

/** La ligne mentionne-t-elle ce nom (insensible casse/accents/ordre des tokens) ? */
function ligneMentionneNom(ligne, nom) {
  const cible = normaliserNomPersonne(nom);
  if (!cible) return false;
  const tokensCible = cible.split(' ').sort().join(' ');
  return Object.values(ligne).some((v) => {
    if (typeof v !== 'string') return false;
    const n = normaliserNomPersonne(v);
    return n !== null && (n === cible || n.split(' ').sort().join(' ') === tokensCible);
  });
}

function dateDepartDe(ligne) {
  return parseDateWheelsys(champParMotifs(ligne, [/checkout/i, /dateout|outdate/i, /pickup/i]));
}

function dateRetourDe(ligne) {
  return parseDateWheelsys(champParMotifs(ligne, [/checkin/i, /datein|indate/i, /due|return/i]));
}

/** Contrat « actif » best-effort : nom du conducteur si fourni, puis contrats
 *  encore ouverts (pas de check-in passé), puis check-out le plus récent. */
function choisirContrat(candidats, nomConducteur) {
  let retenus = candidats;
  if (nomConducteur) {
    const parNom = retenus.filter((l) => ligneMentionneNom(l, nomConducteur));
    if (parNom.length > 0) retenus = parNom;
  }
  const maintenant = Date.now();
  const ouverts = retenus.filter((l) => {
    const retour = dateRetourDe(l);
    return retour === null || retour.getTime() >= maintenant;
  });
  if (ouverts.length > 0) retenus = ouverts;
  return [...retenus].sort(
    (a, b) => (dateDepartDe(b)?.getTime() ?? 0) - (dateDepartDe(a)?.getTime() ?? 0)
  )[0];
}

/**
 * Retrouve le contrat actif portant la plaque et en extrait les informations
 * du dossier. Renvoie null (jamais d'exception) si le client n'est pas
 * configuré, si la plaque est introuvable ou en cas d'erreur réseau.
 *
 * @param {import('./client.js').ClientWheelsys} client
 * @param {string} plaque  Plaque, normalisée ou non (AB123CD, ab-123-cd…).
 * @param {string|null} [nomConducteur]  Nom du conducteur (ex. extrait d'un
 *   mail SAVE) pour départager plusieurs contrats sur la même plaque.
 * @param {object} [options]
 * @param {number} [options.fenetreJours=120]  Fenêtre de recherche des
 *   check-out, en jours avant aujourd'hui.
 * @returns {Promise<{
 *   numeroContrat: string,
 *   client: { intitule: string|null, nom: string|null, numero: string|null } | null,
 *   telephoneConducteur: string|null,
 *   nomConducteur: string|null,
 *   agenceDepart: string|null,
 *   dateDepart: string|null,
 *   dateRetourPrevue: string|null,
 * } | null>}
 */
export async function enrichirParPlaque(client, plaque, nomConducteur = null, options = {}) {
  try {
    const cible = normaliserPlaque(plaque);
    if (!cible) return null;
    if (!client.estConfigure()) {
      if (!nonConfigureLogge) {
        nonConfigureLogge = true;
        console.warn(
          'Wheelsys : tenant (ou baseUrl) / username / password manquants — ' +
            'enrichissement désactivé (non bloquant). Voir WHEELSYS_TENANT / ' +
            'WHEELSYS_BASE_URL / WHEELSYS_USERNAME / WHEELSYS_PASSWORD.'
        );
      }
      return null;
    }

    const fenetreJours = Number(options.fenetreJours) > 0 ? Number(options.fenetreJours) : FENETRE_JOURS_DEFAUT;
    const to = new Date();
    const from = new Date(to.getTime() - fenetreJours * 24 * 60 * 60 * 1000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const lignes = await client.genererRapport(
      RAPPORT_CONTRATS_FINANCIERS,
      construireFiltresContratsFinanciers(iso(from), iso(to))
    );

    const candidats = (Array.isArray(lignes) ? lignes : []).filter(
      (l) => l && typeof l === 'object' && lignePortePlaque(l, cible)
    );
    if (candidats.length === 0) {
      console.log(
        `Wheelsys : aucun contrat pour ${cible} (${RAPPORT_CONTRATS_FINANCIERS}, check-out ${iso(from)} → ${iso(to)})`
      );
      return null;
    }

    if (!clesRapportLoggees) {
      clesRapportLoggees = true;
      console.log(
        `Wheelsys (debug) : clés ${RAPPORT_CONTRATS_FINANCIERS} = ${Object.keys(candidats[0]).join(', ')}`
      );
    }

    const ligne = choisirContrat(candidats, nomConducteur);

    const numeroContrat = String(
      champParMotifs(ligne, [
        /^agreementno$/i,
        /agreement(no|num|number)/i,
        /(contract|rental|doc(ument)?)(no|num|number)/i,
        /^rano$/i,
      ]) ?? ''
    );
    const nomClient = champParMotifs(ligne, [/(customer|client|renter)(full)?name/i]);
    const numeroClient =
      champParMotifs(ligne, [/^(customer|client)(no|num|number|code|id)$/i]) ??
      ligne.corporatecodeid ??
      null;
    const nomConducteurLigne = champParMotifs(ligne, [/driver(full)?name/i]);
    const agenceDepart =
      (estScalaireNonVide(ligne.stationfromcode) ? ligne.stationfromcode : null) ??
      champParMotifs(ligne, [/stationfrom(name|code)?/i, /^station(name|code)?$/i]);
    const dateDepart = dateDepartDe(ligne);
    const dateRetour = dateRetourDe(ligne);

    console.log(`Wheelsys : ${cible} → contrat ${numeroContrat || '(sans numéro)'}`);

    return {
      numeroContrat,
      client:
        nomClient !== null || numeroClient !== null
          ? {
              intitule: nomClient !== null ? String(nomClient) : null,
              nom: nomClient !== null ? String(nomClient) : null,
              numero: numeroClient !== null ? String(numeroClient) : null,
            }
          : null,
      telephoneConducteur: formaterTelephone(telephoneDansLigne(ligne)),
      nomConducteur: nomConducteurLigne !== null ? String(nomConducteurLigne) : null,
      agenceDepart: agenceDepart !== null ? String(agenceDepart) : null,
      dateDepart: dateDepart ? dateDepart.toISOString() : null,
      dateRetourPrevue: dateRetour ? dateRetour.toISOString() : null,
    };
  } catch (e) {
    console.warn(`Wheelsys : enrichissement impossible pour ${plaque} — ${e.message}`);
    return null;
  }
}
