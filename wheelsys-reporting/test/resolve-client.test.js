// test/resolve-client.test.js — Vérifie l'ordre de repli D-028
// (numéro de compte d'abord, repli sur le nom si 0 résultat) décrit dans
// DECISIONS.md. `fetch` est mocké (aucun appel réseau réel vers wheelsys) ;
// `./auth` est mocké via le cache de modules pour simuler une session valide
// sans dépendre de la logique de login.
//
// Lancer : npm test  (depuis wheelsys-reporting/)

const test   = require('node:test');
const assert = require('node:assert/strict');

const authPath = require.resolve('../api/auth.js');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { verify: () => ({ wheelsysCookie: 'mock-wls-cookie' }) },
};

const handler = require('../api/resolve-client.js');

process.env.WHEELSYS_TENANT = 'testtenant';

function makeReq(body) {
  return {
    method:  'POST',
    headers: { authorization: 'Bearer irrelevant-mock-verifies-anything' },
    body,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body:       null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(obj)    { this.body = obj; return this; },
    end()        { return this; },
  };
  return res;
}

// Résultat simulé de l'API globalsearch wheelsys pour un `searchIndex` donné.
function wheelsysEntity(displayValue, id = 1) {
  return { Id: id, Domain: 'testtenant', DisplayValue: displayValue, EntryType: 'Corporate' };
}

function mockFetch(responsesBySearchIndex) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const params      = new URLSearchParams(opts.body);
    const searchIndex = params.get('searchIndex');
    calls.push(searchIndex);
    const data = responsesBySearchIndex[searchIndex] ?? [];
    return { ok: true, status: 200, json: async () => data };
  };
  return calls;
}

test('essaie le numéro de compte en premier et ne cherche pas par nom s\'il matche', async () => {
  const calls = mockFetch({
    '%1457%': [wheelsysEntity('Corporate Customer - 1457 CLIBAT AMENAGEMENT')],
  });

  const req = makeReq({ name: 'CLIBAT AMENAGEMENT', accountNumber: '1457' });
  const res = makeRes();
  await handler(req, res);

  assert.deepEqual(calls, ['%1457%'], 'le nom ne doit pas être cherché si le numéro matche déjà');
  assert.equal(res.body.ok, true);
  assert.equal(res.body.results.length, 1);
});

test('replie sur le nom si la recherche par numéro de compte ne donne rien (D-028)', async () => {
  const calls = mockFetch({
    '%9999%':              [],
    '%CLIBAT AMENAGEMENT%': [wheelsysEntity('Corporate Customer - 1457 CLIBAT AMENAGEMENT')],
  });

  const req = makeReq({ name: 'CLIBAT AMENAGEMENT', accountNumber: '9999' });
  const res = makeRes();
  await handler(req, res);

  assert.deepEqual(calls, ['%9999%', '%CLIBAT AMENAGEMENT%'], 'ordre : numéro d\'abord, puis nom en repli');
  assert.equal(res.body.ok, true);
  assert.equal(res.body.results.length, 1);
});

test('ne cherche que par nom si accountNumber est absent (compat D-027)', async () => {
  const calls = mockFetch({
    '%CLIBAT AMENAGEMENT%': [wheelsysEntity('Corporate Customer - 1457 CLIBAT AMENAGEMENT')],
  });

  const req = makeReq({ name: 'CLIBAT AMENAGEMENT' });
  const res = makeRes();
  await handler(req, res);

  assert.deepEqual(calls, ['%CLIBAT AMENAGEMENT%']);
  assert.equal(res.body.ok, true);
});

test('renvoie results: [] si numéro ET nom ne donnent rien', async () => {
  mockFetch({ '%9999%': [], '%Inconnu%': [] });

  const req = makeReq({ name: 'Inconnu', accountNumber: '9999' });
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.results, []);
});

test('400 si ni name ni accountNumber', async () => {
  const req = makeReq({});
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
});
