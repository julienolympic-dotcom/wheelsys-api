// Tests de la librairie wheelsys-api, sans réseau : fetch est remplacé par un
// faux serveur qui rejoue les échanges observés en production (login ASP.NET
// Web Forms → cookies, puis POST GenerateReportData → { d: { data: "<json>" } }).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ClientWheelsys,
  clientDepuisEnv,
  construireFiltresContratsFinanciers,
  normaliserPlaque,
  parseDateWheelsys,
} from '../src/index.js';

const CONFIG = {
  tenant: 'monagence',
  username: 'service.readonly@example.test',
  password: 'motdepasse-factice',
};

// Ligne rentalagreementfinancials : colonnes attestées en production
// (stationfromcode, days, corporatecodeid, cargroup, netcharge) + colonnes
// plausibles que le client doit détecter par motifs (plaque, client, téléphone…).
const LIGNE_ACTIVE = {
  agreementno: 'RA-2026-0042',
  plateno: 'GH-456-IJ',
  customername: 'SARL EXEMPLE BTP',
  customerno: 'C00123',
  drivername: 'Marie Exemple',
  mobilephone: '0612345678',
  stationfromcode: 'NCE',
  checkoutdate: '/Date(1789000000000)/', // format ASP.NET observé sur les stacks Web Forms
  checkindate: null,
  days: 12,
  corporatecodeid: 77,
  cargroup: 'U3',
  netcharge: 540.5,
};

const LIGNE_CLOTUREE = {
  ...LIGNE_ACTIVE,
  agreementno: 'RA-2026-0007',
  drivername: 'Paul Ancien',
  mobilephone: '0499000000',
  checkoutdate: '2026-06-01T08:00:00',
  checkindate: '2026-06-05T18:00:00', // check-in passé → contrat clôturé
};

function fauxServeur({
  lignes = [],
  compteurs,
  loginKo = false,
  premierRapport401 = false,
  rapportAttendu = 'rentalagreementfinancials',
}) {
  return async (entree, init = {}) => {
    const url = String(entree);
    if (url.includes('/sign-in/default.aspx')) {
      if ((init.method || 'GET') === 'GET') {
        compteurs.getLogin += 1;
        return new Response(
          '<input id="__VIEWSTATE" value="VS123" /><input id="__VIEWSTATEGENERATOR" value="GEN456" />',
          { status: 200, headers: { 'set-cookie': 'ASP.NET_SessionId=abc; path=/' } }
        );
      }
      compteurs.postLogin += 1;
      assert.ok(String(init.body).includes('tbEmail_text='), 'le POST login envoie tbEmail_text');
      if (loginKo) return new Response('login refusé', { status: 200 }); // pas de 302, pas de /ui
      return new Response('', {
        status: 302,
        headers: { location: '/ui/', 'set-cookie': '.ASPXAUTH=jeton; path=/' },
      });
    }
    if (url.includes('/ui/reports/exreportpreview.aspx/GenerateReportData')) {
      compteurs.rapport += 1;
      assert.ok(String(init.headers?.Cookie || '').includes('ASP.NET_SessionId=abc'));
      const corps = JSON.parse(init.body);
      assert.equal(corps.browser, rapportAttendu);
      compteurs.derniersFiltres = JSON.parse(corps.filters);
      if (premierRapport401 && compteurs.rapport === 1) return new Response('', { status: 401 });
      return new Response(JSON.stringify({ d: { data: JSON.stringify(lignes) } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`URL inattendue dans le test : ${url}`);
  };
}

async function avecFetch(faux, corps) {
  const original = globalThis.fetch;
  globalThis.fetch = faux;
  try {
    return await corps();
  } finally {
    globalThis.fetch = original;
  }
}

test('helpers : normalisation plaque et dates ASP.NET « /Date(ms)/ »', () => {
  assert.equal(normaliserPlaque(' gh-456 ij '), 'GH456IJ');
  assert.equal(normaliserPlaque(null), '');
  assert.equal(parseDateWheelsys('/Date(1789000000000)/').getTime(), 1789000000000);
  assert.equal(parseDateWheelsys('2026-06-05T18:00:00').getFullYear(), 2026);
  assert.equal(parseDateWheelsys('n/a'), null);
  assert.equal(parseDateWheelsys(null), null);
});

test('clientDepuisEnv : variables WHEELSYS_* reprises (tenant ou base URL)', () => {
  const client = clientDepuisEnv({
    WHEELSYS_TENANT: 'monagence',
    WHEELSYS_USERNAME: 'u',
    WHEELSYS_PASSWORD: 'p',
    WHEELSYS_AGENCE: 'NCE',
  });
  assert.equal(client.tenant, 'monagence');
  assert.equal(client.baseUrl, 'https://monagence.wheelsys.io');
  assert.equal(client.agence, 'NCE');
  assert.ok(client.estConfigure());

  const viaUrl = clientDepuisEnv({
    WHEELSYS_BASE_URL: 'https://monagence.wheelsys.io/',
    WHEELSYS_USERNAME: 'u',
    WHEELSYS_PASSWORD: 'p',
  });
  assert.equal(viaUrl.tenant, 'monagence');
  assert.ok(viaUrl.estConfigure());

  assert.ok(!clientDepuisEnv({}).estConfigure());
});

test('tenant déduit de baseUrl quand tenant est absent', () => {
  const client = new ClientWheelsys({
    baseUrl: 'https://monagence.wheelsys.io/',
    username: 'u',
    password: 'p',
  });
  assert.equal(client.tenant, 'monagence');
  assert.equal(client.baseUrl, 'https://monagence.wheelsys.io');
  assert.ok(client.estConfigure());
});

test('genererRapport : wrapper générique — nom du rapport et filtres transmis tels quels', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  const lignes = [{ stationcode: 'NCE', revenue: 1234.5 }];
  await avecFetch(
    fauxServeur({ lignes, compteurs, rapportAttendu: 'revenueperstationreport' }),
    async () => {
      const client = new ClientWheelsys(CONFIG);
      const filtres = [
        { FilterName: 'dddf#dt', ControlName: 'rptdddfdt', FilterType: 'ftDateRange', Required: true, Value: '2026-01-01|2026-01-31', Caption: 'Date range' },
      ];
      const rows = await client.genererRapport('revenueperstationreport', filtres);
      assert.deepEqual(rows, lignes);
      assert.deepEqual(compteurs.derniersFiltres, filtres);
      // Alias historique callReport : même comportement, session réutilisée.
      assert.deepEqual(await client.callReport('revenueperstationreport', filtres), lignes);
      assert.equal(compteurs.postLogin, 1);
      assert.equal(compteurs.rapport, 2);
    }
  );
});

test('construireFiltresContratsFinanciers : filtres prod (tous contrats, date check-out, toutes stations)', () => {
  const filtres = construireFiltresContratsFinanciers('2026-01-01', '2026-01-31');
  const parNom = Object.fromEntries(filtres.map((f) => [f.FilterName, f.Value]));
  assert.deepEqual(parNom, {
    'mtrtype': '3',
    'mtdtype': '2',
    'dddf#dt': '2026-01-01|2026-01-31',
    'mtstationmode': '1',
    'edstations': null,
  });
});

test('non configuré (tenant/login/mot de passe manquants) : null sans appel réseau', async () => {
  await avecFetch(
    () => {
      throw new Error('appel réseau interdit : client non configuré');
    },
    async () => {
      assert.equal(await new ClientWheelsys({}).enrichirParPlaque('AB123CD'), null);
      assert.equal(
        await new ClientWheelsys({ baseUrl: 'https://monagence.wheelsys.io/' }).enrichirParPlaque('AB123CD'),
        null
      );
      assert.equal(await new ClientWheelsys(CONFIG).enrichirParPlaque(null), null);
    }
  );
});

test('enrichissement complet : login puis rapport, contrat retrouvé par plaque', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  const autreLigne = { ...LIGNE_ACTIVE, agreementno: 'RA-2026-0001', plateno: 'ZZ-999-ZZ' };
  await avecFetch(fauxServeur({ lignes: [autreLigne, LIGNE_ACTIVE], compteurs }), async () => {
    const client = new ClientWheelsys(CONFIG);
    const resultat = await client.enrichirParPlaque('GH456IJ', 'Marie Exemple');
    assert.deepEqual(resultat, {
      numeroContrat: 'RA-2026-0042',
      client: { intitule: 'SARL EXEMPLE BTP', nom: 'SARL EXEMPLE BTP', numero: 'C00123' },
      telephoneConducteur: '06 12 34 56 78',
      nomConducteur: 'Marie Exemple',
      agenceDepart: 'NCE',
      dateDepart: new Date(1789000000000).toISOString(),
      dateRetourPrevue: null,
    });
    assert.equal(compteurs.getLogin, 1);
    assert.equal(compteurs.postLogin, 1);
    assert.equal(compteurs.rapport, 1);
    assert.ok(compteurs.derniersFiltres.some((f) => f.FilterName === 'dddf#dt'));

    // Session en cache : un second appel ne refait pas le login.
    await client.enrichirParPlaque('GH456IJ');
    assert.equal(compteurs.postLogin, 1);
    assert.equal(compteurs.rapport, 2);
  });
});

test('fenetreJours (options) : borne basse de la plage dddf#dt rapprochée', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  await avecFetch(fauxServeur({ lignes: [LIGNE_ACTIVE], compteurs }), async () => {
    await new ClientWheelsys(CONFIG).enrichirParPlaque('GH456IJ', null, { fenetreJours: 7 });
    const plage = compteurs.derniersFiltres.find((f) => f.FilterName === 'dddf#dt').Value;
    const [from, to] = plage.split('|');
    const ecartJours = Math.round((new Date(to) - new Date(from)) / (24 * 60 * 60 * 1000));
    assert.equal(ecartJours, 7);
  });
});

test('deux contrats sur la plaque : préfère celui encore ouvert (pas de check-in passé)', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  await avecFetch(
    fauxServeur({ lignes: [LIGNE_CLOTUREE, LIGNE_ACTIVE], compteurs }),
    async () => {
      const resultat = await new ClientWheelsys(CONFIG).enrichirParPlaque('GH456IJ');
      assert.equal(resultat.numeroContrat, 'RA-2026-0042');
      assert.equal(resultat.nomConducteur, 'Marie Exemple');
    }
  );
});

test('nom du conducteur fourni : départage plusieurs contrats (ordre Nom/Prénom toléré)', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  const autreOuvert = {
    ...LIGNE_ACTIVE,
    agreementno: 'RA-2026-0050',
    drivername: 'Jean Autre',
    mobilephone: '0700000000',
    checkindate: null,
  };
  await avecFetch(fauxServeur({ lignes: [autreOuvert, LIGNE_ACTIVE], compteurs }), async () => {
    const resultat = await new ClientWheelsys(CONFIG).enrichirParPlaque('GH456IJ', 'EXEMPLE Marie');
    assert.equal(resultat.numeroContrat, 'RA-2026-0042');
    assert.equal(resultat.telephoneConducteur, '06 12 34 56 78');
  });
});

test('plaque absente du rapport : null, sans exception', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  await avecFetch(fauxServeur({ lignes: [LIGNE_ACTIVE], compteurs }), async () => {
    assert.equal(await new ClientWheelsys(CONFIG).enrichirParPlaque('XX000XX'), null);
  });
});

test('session expirée (401 sur le rapport) : purge du cache, re-login, second essai', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  await avecFetch(
    fauxServeur({ lignes: [LIGNE_ACTIVE], compteurs, premierRapport401: true }),
    async () => {
      const resultat = await new ClientWheelsys(CONFIG).enrichirParPlaque('GH456IJ');
      assert.equal(resultat.numeroContrat, 'RA-2026-0042');
      assert.equal(compteurs.getLogin, 2);
      assert.equal(compteurs.postLogin, 2);
      assert.equal(compteurs.rapport, 2);
    }
  );
});

test('login refusé ou panne réseau : null, jamais d’exception (règle d’or provider)', async () => {
  const compteurs = { getLogin: 0, postLogin: 0, rapport: 0 };
  await avecFetch(fauxServeur({ lignes: [], compteurs, loginKo: true }), async () => {
    assert.equal(await new ClientWheelsys(CONFIG).enrichirParPlaque('GH456IJ'), null);
  });
  await avecFetch(
    () => {
      throw new Error('ECONNREFUSED');
    },
    async () => {
      assert.equal(await new ClientWheelsys(CONFIG).enrichirParPlaque('GH456IJ'), null);
    }
  );
});
