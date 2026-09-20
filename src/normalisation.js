// Normalisation de valeurs métier utilisées par les rapports wheelsys :
// plaques d'immatriculation, dates ASP.NET, téléphones, noms de personnes.

/** Normalise une immatriculation : majuscules, sans tirets/espaces (AB123CD). */
export function normaliserPlaque(valeur) {
  return String(valeur ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Date wheelsys : ISO ou format ASP.NET « /Date(ms)/ ». null si illisible. */
export function parseDateWheelsys(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const ms = String(valeur).match(/\/Date\((-?\d+)/);
  const d = ms ? new Date(Number(ms[1])) : new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Téléphone : format lisible FR (« 06 12 34 56 78 ») si 10 chiffres, sinon tel quel. */
export function formaterTelephone(brut) {
  if (brut === null || brut === undefined) return null;
  const texte = String(brut).trim();
  if (!texte) return null;
  const chiffres = texte.replace(/\D/g, '');
  if (chiffres.length === 10) return chiffres.replace(/(\d{2})(?=\d)/g, '$1 ');
  return texte;
}

/** Normalise un nom de personne : majuscules, sans accents ni ponctuation. */
export function normaliserNomPersonne(nom) {
  if (!nom) return null;
  const n = String(nom)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return n || null;
}
