// Fampay bot control — bot server ke andar chalta hai, yahan se start/stop/settings/logs
const $ = (id) => document.getElementById(id);
const esc = A.esc;
const ENV_LABEL = { GMAIL_CLIENT_ID: 'GMAIL_CLIENT_ID', GMAIL_CLIENT_SECRET: 'GMAIL_CLIENT_SECRET', GMAIL_REFRESH_TOKEN: 'GMAIL_REFRESH_TOKEN', FIREBASE_CREDENTIALS_B64: 'FIREBASE_CREDENTIALS_B64' };
let timer = null, formFilled = false;

const kv = (k, v) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
A.envRows = (env) => Object.entries(env).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${v ? '✅ set' : '❌ missing'}</span></div>`).join('');

function paint(b, logs){
  const pill = $('bot-pill');
  const map = { running: ['Running', 'ok'], starting: ['Starting', 'warn'], stopped: ['Stopped', ''], error: ['Error', 'err'], not_configured: ['Env missing', 'err'] };
  const [t, c] = map[b.status] || [b.status, ''];
  pill.innerText = t; pill.className = 'pill ' + c;
  const dot = $('bot-dot'); if(dot) dot.className = 'bot-dot ' + (b.status === 'running' ? 'on' : (b.status === 'error' || b.status === 'not_configured') ? 'bad' : '');
  $('bot-kv').innerHTML =
    kv('Gmail', b.gmail_connected ? '✅ ' + esc(b.gmail_account || 'connected') : '❌ not connected') +
    kv('Mails mile (last poll)', b.emails_found) + kv('Last poll', b.last_run ? new Date(b.last_run).toLocaleTimeString() : '—') +
    kv('Last poll mein save', b.last_saved) + kv('Total save (is run mein)', b.total_saved) +
    kv('Interval', b.settings.poll_interval + 's') + kv('Processed cache', b.processed_cached);
  $('bot-env').innerHTML = A.envRows(b.env);
  if(!formFilled){ $('bot-int').value = b.settings.poll_interval; $('bot-q').value = b.settings.query; formFilled = true; }
  const lb = $('bot-log'), atEnd = lb.scrollHeight - lb.scrollTop - lb.clientHeight < 30;
  lb.innerHTML = logs.length ? logs.map(l => `<div class="${l.l === 'error' ? 'e' : l.l === 'warn' ? 'w' : l.l === 'ok' ? 'k' : ''}">${esc(l.t.slice(11, 19))} ${esc(l.m)}</div>`).join('') : '<div>Abhi koi log nahi</div>';
  if(atEnd) lb.scrollTop = lb.scrollHeight;
}

Object.assign(window.A, {
  async botLoad(){
    try{ const r = await A.api('/api/bot/status'); paint(r.bot, r.logs); }catch(e){ if(!timer) A.fail(e); }
  },
  async botDeposits(){
    try{
      const r = await A.api('/api/bot/deposits');
      $('bot-deps').innerHTML = r.deposits.length ? r.deposits.map(d => `
        <div class="row"><div><div class="row-t">₹${esc(d.amount)}</div><div class="row-s">${d.utr ? 'UTR '+esc(d.utr) : ''}${d.utr && d.txnId ? ' · ' : ''}${d.txnId ? 'TxnID '+esc(d.txnId) : ''}${(!d.utr && !d.txnId) ? esc(d.id) : ''} · ${esc(d.source||'')} · ${A.fmtAgo(d.receivedAt)}</div></div>
        <div class="btn-row" style="gap:6px;">
        <button class="btn btn-success mini" title="Successful maan kar history mein bhejo" onclick="A.botUseDep('${esc(d.id)}')"><i class="fa-solid fa-check"></i></button>
        <button class="btn btn-danger mini" data-p="fampay_deposits/${esc(d.id)}" onclick="A.botDelDep(this.dataset.p)"><i class="fa-solid fa-trash"></i></button>
        </div></div>`).join('')
        : '<span class="muted">Koi unclaimed deposit nahi ✓</span>';
    }catch(e){ $('bot-deps').innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  },
  openAddTxn(){ $('at-amount').value=''; $('at-utr').value=''; $('at-txn').value=''; document.getElementById('m-addtxn').classList.add('show'); setTimeout(()=>$('at-amount').focus(),150); },
  async addTxnSubmit(){
    const amount = parseFloat($('at-amount').value), utr = $('at-utr').value.trim(), txnId = $('at-txn').value.trim();
    if(!amount || amount <= 0){ A.toast('Sahi amount daalo','err'); return; }
    if(!utr && !txnId){ A.toast('UTR ya Transaction ID mein se ek do','err'); return; }
    try{
      await A.api('/api/bot/deposits', { body: { amount, utr, txnId } });
      A.toast('Transaction add ho gaya ✓'); A.closeModal('m-addtxn'); A.botDeposits();
    }catch(e){ A.fail(e); }
  },
  async botUseDep(id){
    try{ await A.api('/api/bot/deposits/'+encodeURIComponent(id)+'/use', { body: {} }); A.toast('History mein move ho gaya ✓'); A.botDeposits(); A.botHistLoad(); }
    catch(e){ A.fail(e); }
  },
  async botHistLoad(){
    try{
      const range = $('bot-hist-range').value;
      const r = await A.api('/api/bot/deposits/history?range='+range);
      $('bot-hist').innerHTML = r.history.length ? r.history.map(h => `
        <div class="row"><div><div class="row-t">₹${esc(h.amount)}</div><div class="row-s">${h.utr ? 'UTR '+esc(h.utr) : ''}${h.utr && h.txnId ? ' · ' : ''}${h.txnId ? 'TxnID '+esc(h.txnId) : ''} · ${A.fmtAgo(h.usedAt)}</div></div></div>`).join('')
        : '<span class="muted">Is period mein koi successful deposit nahi</span>';
    }catch(e){ $('bot-hist').innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  },
  botHistDownload(){
    const range = $('bot-hist-range').value;
    window.open('/api/bot/deposits/history/export?range='+range, '_blank');
  },
  async botHistDeleteOld(){
    const v = await A.askDanger({ title: 'Purani history delete?', text: 'Range mein chuni hui se purani saari history hamesha ke liye delete ho jayegi (CSV download pehle kar lo agar chahiye).', backup: null, okLabel: 'Delete' });
    if(!v) return;
    const range = $('bot-hist-range').value;
    const days = { today: 1, '7d': 7, '30d': 30, all: 0 }[range] ?? 7;
    try{ const r = await A.api('/api/bot/deposits/history/delete-old', { body: { days, pin: v.pin } }); A.toast(r.deleted + ' purane entries delete ✓'); A.botHistLoad(); }
    catch(e){ A.fail(e); }
  },
  botOpen(){ formFilled = false; A.botLoad(); A.botDeposits(); A.botHistLoad(); clearInterval(timer); timer = setInterval(() => { A.botLoad(); }, 4000); },
  botClose(){ clearInterval(timer); timer = null; },

  async botAct(a){
    try{ const r = await A.api('/api/bot/' + a, { method: 'POST' }); A.toast(r.message); setTimeout(A.botLoad, 600); if(a === 'poll') setTimeout(A.botDeposits, 3000); }
    catch(e){ A.fail(e); }
  },
  async botSave(){
    try{
      await A.api('/api/bot/settings', { body: { poll_interval: parseInt($('bot-int').value, 10), query: $('bot-q').value } });
      A.toast('Bot settings save'); formFilled = false; A.botLoad();
    }catch(e){ A.fail(e); }
  },
  async botClear(){
    const v = await A.askDanger({ title: 'Saare mails dobara scan?', text: 'Processed list saaf hogi. Duplicate UTR phir bhi dobara save nahi honge.', backup: null, okLabel: 'Rescan', danger: false });
    if(!v) return;
    try{ await A.api('/api/bot/clear-processed', { body: { pin: v.pin } }); A.toast('Done — next poll mein rescan'); A.botLoad(); }catch(e){ A.fail(e); }
  },
  async botDelDep(path){
    const v = await A.askDanger({ title: 'Deposit entry delete?', text: path, okLabel: 'Delete' });
    if(!v) return;
    try{
      const r = await A.api('/api/data/delete-doc', { body: { path, recursive: false, pin: v.pin, backup: v.backup } });
      await A.trackJob(r.job, 'Delete'); A.botDeposits();
    }catch(e){ A.fail(e); }
  }
});
