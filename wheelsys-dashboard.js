/**
 * Wheelsys — Dashboard de Contrôle Équipes
 * ==========================================
 * Usage : coller dans la console navigateur sur lutam.wheelsys.io
 *         OU créer un bookmarklet avec le contenu de wheelsys-bookmarklet.txt
 *
 * Contrôles effectués :
 *  1. Paiements au départ  — départs du jour avec solde client > 0
 *  2. Cautions             — contrats du mois sans caution (excess = 0)
 *  3. Balances impayées    — contrats actifs + fermés ce mois avec custbalance > 0
 */

(async function WheelsDashboard() {
  // ── Éviter les doubles clics ──────────────────────────────────────────────
  const PANEL_ID = 'wls-ctrl-panel';
  const existing = document.getElementById(PANEL_ID);
  if (existing) { existing.remove(); return; }

  // ── Helpers date ─────────────────────────────────────────────────────────
  function toDateStr(d) {
    return d.toISOString().slice(0, 10);
  }
  const today    = new Date();
  const todayStr = toDateStr(today);
  const firstDay = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastDay  = toDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const monthRange = `${firstDay}|${lastDay}`;
  const todayRange = `${todayStr}|${todayStr}`;

  // ── Appel API Wheelsys ────────────────────────────────────────────────────
  async function callReport(browser, filters) {
    const resp = await fetch('/ui/reports/exreportpreview.aspx/GenerateReportData', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        browser,
        title: browser,
        filters: JSON.stringify(filters)
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return JSON.parse(json.d.data);
  }

  // Filtres standards pour rentalagreementfinancials
  // mtrtype : 2=Actifs, 3=Tous, 1=Fermés
  // mtdtype : 2=Check-out date, 3=Check-in date, 1=Invoice date
  // mtstationmode : 1=Check-outs, 2=Check-ins
  function buildFilters({ mtrtype, mtdtype, dateRange, mtstationmode = '1' }) {
    return [
      { FilterName: 'mtrtype',      ControlName: 'rptmtrtype',      FilterType: 'ftMemTypeSingle', Required: true,  Value: mtrtype,       Caption: 'Rentals'          },
      { FilterName: 'mtdtype',      ControlName: 'rptmtdtype',      FilterType: 'ftMemTypeSingle', Required: true,  Value: mtdtype,       Caption: 'Date basis'       },
      { FilterName: 'dddf#dt',      ControlName: 'rptdddfdt',       FilterType: 'ftDateRange',     Required: true,  Value: dateRange,     Caption: 'Date range'       },
      { FilterName: 'mtstationmode',ControlName: 'rptmtstationmode',FilterType: 'ftMemTypeSingle', Required: true,  Value: mtstationmode, Caption: 'Station selection' },
      { FilterName: 'edstations',   ControlName: 'rptedstations',   FilterType: 'ftStation',       Required: false, Value: null,          Caption: 'Stations'         },
    ];
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    position: 'fixed', top: '60px', right: '20px', width: '720px', maxHeight: '85vh',
    background: '#fff', border: '1px solid #ddd', borderRadius: '10px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)', zIndex: '999999',
    fontFamily: 'Manrope, Segoe UI, sans-serif', fontSize: '13px',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
  });

  panel.innerHTML = `
    <div style="background:#1a2e4a;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-radius:10px 10px 0 0;flex-shrink:0">
      <span style="font-weight:700;font-size:15px">🚗 Contrôle Équipes — ${todayStr}</span>
      <button id="wls-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">✕</button>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid #eee;flex-shrink:0">
      <button class="wls-tab" data-tab="depart"  style="${tabStyle(true)} ">💳 Paiements départ</button>
      <button class="wls-tab" data-tab="caution" style="${tabStyle(false)}">🔐 Cautions</button>
      <button class="wls-tab" data-tab="impaye"  style="${tabStyle(false)}">⚠️ Impayés</button>
    </div>
    <div id="wls-content" style="overflow-y:auto;padding:16px;flex:1">
      <div style="text-align:center;padding:40px;color:#888">⏳ Chargement des données...</div>
    </div>
  `;
  document.body.appendChild(panel);

  function tabStyle(active) {
    return `padding:10px 20px;border:none;background:${active ? '#fff' : '#f7f8fa'};cursor:pointer;font-size:13px;font-weight:${active ? '700' : '400'};border-bottom:${active ? '2px solid #1a2e4a' : '2px solid transparent'};color:${active ? '#1a2e4a' : '#666'}`;
  }

  document.getElementById('wls-close').onclick = () => panel.remove();

  // ── Chargement des données ────────────────────────────────────────────────
  let datasets = {};

  async function loadAll() {
    const content = document.getElementById('wls-content');
    try {
      // 1. Départs du jour (tous contrats, date checkout = aujourd'hui)
      const departData = await callReport('rentalagreementfinancials', buildFilters({
        mtrtype: '3', mtdtype: '2', dateRange: todayRange, mtstationmode: '1'
      }));

      // 2. Contrats du mois (tous, date checkout)
      const monthData = await callReport('rentalagreementfinancials', buildFilters({
        mtrtype: '3', mtdtype: '2', dateRange: monthRange, mtstationmode: '1'
      }));

      // Analyses
      datasets = {
        // Départs du jour avec solde non nul
        depart: departData.filter(r => (r.custbalance || 0) > 0.01),
        departTotal: departData.length,

        // Contrats du mois sans caution
        caution: monthData.filter(r => !r.excess || r.excess <= 0),
        cautionTotal: monthData.length,

        // Contrats du mois avec solde impayé
        impaye: monthData
          .filter(r => (r.custbalance || 0) > 0.01)
          .sort((a, b) => b.custbalance - a.custbalance),
        impayeTotal: monthData.length,
      };

      // Mettre à jour les badges onglets
      panel.querySelectorAll('.wls-tab').forEach(btn => {
        const tab = btn.dataset.tab;
        const count = datasets[tab]?.length || 0;
        if (count > 0) {
          btn.innerHTML = btn.innerHTML.replace(/(\s*<span.*)?$/, '') +
            ` <span style="background:#e53935;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px">${count}</span>`;
        }
      });

      renderTab('depart');

    } catch (err) {
      content.innerHTML = `<div style="color:#c00;padding:20px">❌ Erreur : ${err.message}<br><small>Vérifiez que vous êtes connecté à wheelsys.</small></div>`;
    }
  }

  // ── Rendu des onglets ─────────────────────────────────────────────────────
  function fmt(n) {
    return (n || 0).toFixed(2).replace('.', ',') + ' €';
  }
  function fmtDate(d) {
    if (!d) return '—';
    return d.slice(0, 10);
  }
  function badge(txt, color) {
    return `<span style="background:${color};color:#fff;border-radius:4px;padding:2px 7px;font-size:11px">${txt}</span>`;
  }

  function renderTab(tab) {
    const content = document.getElementById('wls-content');

    // Mettre à jour le style des onglets
    panel.querySelectorAll('.wls-tab').forEach(btn => {
      const active = btn.dataset.tab === tab;
      btn.style.fontWeight = active ? '700' : '400';
      btn.style.background = active ? '#fff' : '#f7f8fa';
      btn.style.borderBottom = active ? '2px solid #1a2e4a' : '2px solid transparent';
      btn.style.color = active ? '#1a2e4a' : '#666';
    });

    if (tab === 'depart') {
      const rows = datasets.depart || [];
      const total = datasets.departTotal || 0;
      const anomalies = rows.length;

      content.innerHTML = `
        <div style="margin-bottom:12px">
          <strong>Départs du ${todayStr}</strong> — ${total} contrat(s) —
          ${anomalies === 0
            ? badge('✓ Tous payés', '#2e7d32')
            : badge(`${anomalies} solde(s) non nul(s)`, '#e53935')}
        </div>
        ${anomalies === 0
          ? '<div style="color:#2e7d32;padding:20px;text-align:center">✅ Tous les départs du jour ont un solde à zéro.</div>'
          : buildTable(
              ['Contrat', 'Client', 'Départ', 'Facturé', 'Payé', 'Solde', 'Mode paiement'],
              rows.map(r => [
                `<a href="/ui/manage/master/rental.aspx?id=${r.id}" target="_blank" style="color:#1a2e4a;text-decoration:none;font-weight:600">${r.displaydocno || r.rano}</a>`,
                r.customer || '—',
                fmtDate(r.checkoutdate),
                fmt(r.custcharge),
                fmt(r.custpayments),
                `<strong style="color:#e53935">${fmt(r.custbalance)}</strong>`,
                paymentModes(r)
              ])
            )
        }
      `;
    }

    else if (tab === 'caution') {
      const rows = datasets.caution || [];
      const total = datasets.cautionTotal || 0;

      content.innerHTML = `
        <div style="margin-bottom:12px">
          <strong>Contrats du mois (${firstDay} → ${lastDay})</strong> — ${total} total —
          ${rows.length === 0
            ? badge('✓ Toutes les cautions sont renseignées', '#2e7d32')
            : badge(`${rows.length} caution(s) manquante(s)`, '#e53935')}
        </div>
        ${rows.length === 0
          ? '<div style="color:#2e7d32;padding:20px;text-align:center">✅ Tous les contrats du mois ont une caution enregistrée.</div>'
          : buildTable(
              ['Contrat', 'Client', 'Départ', 'Retour', 'Caution', 'Montant facturé'],
              rows.map(r => [
                `<a href="/ui/manage/master/rental.aspx?id=${r.id}" target="_blank" style="color:#1a2e4a;text-decoration:none;font-weight:600">${r.displaydocno || r.rano}</a>`,
                r.customer || '—',
                fmtDate(r.checkoutdate),
                fmtDate(r.checkindate),
                `<strong style="color:#e53935">${fmt(r.excess)}</strong>`,
                fmt(r.custcharge)
              ])
            )
        }
      `;
    }

    else if (tab === 'impaye') {
      const rows = datasets.impaye || [];
      const total = datasets.impayeTotal || 0;
      const totalDu = rows.reduce((s, r) => s + (r.custbalance || 0), 0);

      // Regrouper par client
      const byClient = {};
      rows.forEach(r => {
        const k = r.customer || 'Inconnu';
        if (!byClient[k]) byClient[k] = { count: 0, total: 0, contracts: [] };
        byClient[k].count++;
        byClient[k].total += r.custbalance || 0;
        byClient[k].contracts.push(r);
      });

      const clientRows = Object.entries(byClient)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([client, data]) => [
          client,
          data.count,
          `<strong style="color:#e53935">${fmt(data.total)}</strong>`,
          data.contracts.map(r =>
            `<a href="/ui/manage/master/rental.aspx?id=${r.id}" target="_blank" style="color:#1a2e4a;font-size:11px">${r.displaydocno || r.rano}</a>`
          ).join(', ')
        ]);

      content.innerHTML = `
        <div style="margin-bottom:12px">
          <strong>Impayés — mois en cours</strong> — ${total} contrats analysés —
          ${rows.length === 0
            ? badge('✓ Aucun impayé', '#2e7d32')
            : badge(`${rows.length} contrats — Total : ${fmt(totalDu)}`, '#e53935')}
        </div>
        ${rows.length === 0
          ? '<div style="color:#2e7d32;padding:20px;text-align:center">✅ Aucun impayé sur le mois en cours.</div>'
          : buildTable(
              ['Client', 'Nb contrats', 'Total dû', 'Contrats'],
              clientRows
            )
        }
        ${rows.length > 0 ? `
        <div style="margin-top:16px;border-top:1px solid #eee;padding-top:12px">
          <details>
            <summary style="cursor:pointer;font-weight:600;color:#1a2e4a">Détail par contrat (${rows.length})</summary>
            <div style="margin-top:8px">
            ${buildTable(
              ['Contrat', 'Client', 'Départ', 'Retour', 'Facturé', 'Payé', 'Solde'],
              rows.map(r => [
                `<a href="/ui/manage/master/rental.aspx?id=${r.id}" target="_blank" style="color:#1a2e4a;text-decoration:none;font-weight:600">${r.displaydocno || r.rano}</a>`,
                r.customer || '—',
                fmtDate(r.checkoutdate),
                fmtDate(r.checkindate) || badge('En cours', '#1565c0'),
                fmt(r.custcharge),
                fmt(r.custpayments),
                `<strong style="color:#e53935">${fmt(r.custbalance)}</strong>`
              ])
            )}
            </div>
          </details>
        </div>` : ''}
      `;
    }
  }

  function buildTable(headers, rows) {
    const ths = headers.map(h => `<th style="text-align:left;padding:7px 10px;white-space:nowrap;font-weight:600;color:#555">${h}</th>`).join('');
    const trs = rows.map((row, i) =>
      `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
        ${row.map(cell => `<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0">${cell}</td>`).join('')}
      </tr>`
    ).join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f4f6f9">${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
  }

  function paymentModes(r) {
    const modes = [];
    if (r.cashpaid  > 0) modes.push(`Espèces: ${fmt(r.cashpaid)}`);
    if (r.cardpaid  > 0) modes.push(`Carte: ${fmt(r.cardpaid)}`);
    if (r.chequepaid > 0) modes.push(`Chèque: ${fmt(r.chequepaid)}`);
    if (r.bankpaid  > 0) modes.push(`Virement: ${fmt(r.bankpaid)}`);
    return modes.length > 0 ? modes.join('<br>') : badge('Aucun', '#e53935');
  }

  // ── Events ────────────────────────────────────────────────────────────────
  panel.querySelectorAll('.wls-tab').forEach(btn => {
    btn.onclick = () => renderTab(btn.dataset.tab);
  });

  // ── Démarrage ─────────────────────────────────────────────────────────────
  await loadAll();

})();
