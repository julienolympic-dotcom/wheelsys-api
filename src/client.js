// Client wheelsys.io — login compte de service + rapports GenerateReportData.
//
// Transport éprouvé en production (wheels-backend-pilotage, même famille
// d'instances *.wheelsys.io) :
//   - login ASP.NET Web Forms sur https://<tenant>.wheelsys.io/sign-in/default.aspx
//     (__VIEWSTATE + champs tbEmail_text / tbPassword_text), cookies de session
//     mis en cache ~25 minutes ;
//   - rapports via POST /ui/reports/exreportpreview.aspx/GenerateReportData
//     (corps { browser, title, filters }, réponse json.d.data à re-parser),
//     avec re-login unique si la session a expiré (401/403).

import { enrichirParPlaque } from './enrichissement.js';

const SESSION_TTL_MS = 25 * 60 * 1000;

export class ClientWheelsys {
  /**
   * @param {object} options
   * @param {string} [options.tenant]   Sous-domaine de l'instance (ex. « olcda »
   *   pour olcda.wheelsys.io) ; à défaut, déduit de baseUrl.
   * @param {string} [options.baseUrl]  URL de l'instance (https://<tenant>.wheelsys.io).
   * @param {string} [options.username] Compte de service (login e-mail).
   * @param {string} [options.password] Mot de passe du compte de service.
   * @param {string} [options.agence]   Code agence, informatif uniquement (les
   *   rapports couvrent toutes les stations).
   */
  constructor({ tenant, baseUrl, username, password, agence } = {}) {
    const depuisUrl = String(baseUrl || '').match(/^https?:\/\/([^./]+)\.wheelsys\.io/i);
    this.tenant = String(tenant || (depuisUrl ? depuisUrl[1] : '')).trim();
    this.baseUrl = `https://${this.tenant}.wheelsys.io`;
    this.username = username || '';
    this.password = password || '';
    this.agence = agence || '';
    this.session = { cookie: null, expires: 0 };
  }

  estConfigure() {
    return Boolean(this.tenant && this.username && this.password);
  }

  // Login ASP.NET Web Forms (VIEWSTATE).
  async login() {
    const loginUrl = `${this.baseUrl}/sign-in/default.aspx?ReturnUrl=%2fui%2f`;

    const getResp = await fetch(loginUrl, { redirect: 'follow' });
    const html = await getResp.text();
    const initCookies = (getResp.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);

    const extraire = (id) =>
      (html.match(new RegExp(`id="${id}"\\s+value="([^"]*)"`, 'i')) || [])[1] || '';

    const corps = new URLSearchParams({
      '__EVENTTARGET': '',
      '__EVENTARGUMENT': '',
      '__VIEWSTATE': extraire('__VIEWSTATE'),
      '__VIEWSTATEGENERATOR': extraire('__VIEWSTATEGENERATOR'),
      'ctl00$coreBody$hdfUpdatingPassword': '0',
      'ctl00$coreBody$hdfEmail': '',
      'ctl00$coreBody$FortNoxStateHidden': extraire('FortNoxStateHidden'),
      'ctl00$coreBody$FortNoxStationHidden': extraire('FortNoxStationHidden'),
      'tbEmail_text': this.username,
      'tbPassword_text': this.password,
      'ctl00$coreBody$btnActualSignin': 'Sign-in',
    });

    const postResp = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initCookies.join('; '),
      },
      body: corps.toString(),
      redirect: 'manual',
    });

    const postCookies = (postResp.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
    const jar = [...initCookies];
    for (const c of postCookies) {
      const nom = c.split('=')[0];
      const idx = jar.findIndex((x) => x.split('=')[0] === nom);
      if (idx >= 0) jar[idx] = c;
      else jar.push(c);
    }

    const location = postResp.headers.get('location') || '';
    if (postResp.status !== 302 && !location.includes('/ui')) {
      throw new Error('Login wheelsys échoué — vérifier username / password (WHEELSYS_USERNAME / WHEELSYS_PASSWORD)');
    }
    return jar.join('; ');
  }

  async getSession() {
    if (this.session.cookie && Date.now() < this.session.expires) return this.session.cookie;
    const cookie = await this.login();
    this.session = { cookie, expires: Date.now() + SESSION_TTL_MS };
    return cookie;
  }

  /**
   * Wrapper générique GenerateReportData : exécute n'importe quel rapport
   * wheelsys (« browser » du designer de rapports) avec ses filtres, et renvoie
   * les lignes (tableau d'objets). Re-login unique si la session a expiré.
   *
   * Rapports connus des projets Olympic Location : rentalagreementfinancials,
   * fleetutilizationreport, revenueperstationreport, vehiclelistreport.
   *
   * @param {string} nomRapport  Nom du rapport (paramètre « browser »).
   * @param {Array<object>} filtres  Filtres au format wheelsys
   *   ({ FilterName, ControlName, FilterType, Required, Value, Caption }).
   */
  async genererRapport(nomRapport, filtres, retenter = true) {
    const cookie = await this.getSession();

    const resp = await fetch(`${this.baseUrl}/ui/reports/exreportpreview.aspx/GenerateReportData`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie,
      },
      body: JSON.stringify({ browser: nomRapport, title: nomRapport, filters: JSON.stringify(filtres) }),
    });

    if (resp.status === 401 || resp.status === 403) {
      this.session = { cookie: null, expires: 0 };
      if (retenter) return this.genererRapport(nomRapport, filtres, false);
      throw new Error('SESSION_EXPIRED');
    }
    if (!resp.ok) throw new Error(`API wheelsys HTTP ${resp.status}`);

    const json = await resp.json();
    return JSON.parse(json.d.data);
  }

  /** Alias historique (nom utilisé par wheels-backend-pilotage). */
  callReport(browser, filtres, retenter = true) {
    return this.genererRapport(browser, filtres, retenter);
  }

  /**
   * Enrichissement d'un dossier à partir d'une plaque d'immatriculation.
   * Renvoie null en cas d'échec, d'absence de configuration ou de contrat
   * introuvable : JAMAIS d'exception (règle d'or des providers).
   * Voir src/enrichissement.js pour le détail et la forme du résultat.
   */
  enrichirParPlaque(plaque, nomConducteur = null, options = {}) {
    return enrichirParPlaque(this, plaque, nomConducteur, options);
  }
}

/**
 * Construit un client depuis des variables d'environnement WHEELSYS_* :
 * WHEELSYS_TENANT (ou WHEELSYS_BASE_URL), WHEELSYS_USERNAME, WHEELSYS_PASSWORD,
 * WHEELSYS_AGENCE (optionnelle).
 */
export function clientDepuisEnv(env = process.env) {
  return new ClientWheelsys({
    tenant: env.WHEELSYS_TENANT || '',
    baseUrl: env.WHEELSYS_BASE_URL || '',
    username: env.WHEELSYS_USERNAME || '',
    password: env.WHEELSYS_PASSWORD || '',
    agence: env.WHEELSYS_AGENCE || '',
  });
}
