/** 管理ページ（/admin）。合言葉を入れると、日ごとのまとめを種類別に見られる。投稿の文は textContent で出す */
export const ADMIN_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>池づくり ご意見まとめ</title>
<style>
  :root { --bg: #f4efe2; --card: #fcf9f0; --ink: #24392d; --soft: #6b7d6f; --line: rgba(36,57,45,.12); --leaf: #3d9b6e; --tint: #e3f2e8; --bad: #c8553d; --idea: #3a7194; --cmt: #b0561f; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 "M PLUS Rounded 1c", system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 20px 16px 60px; }
  h1 { font-size: 20px; margin: 0 0 14px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; }
  button, input { font: inherit; }
  button { border: 0; border-radius: 999px; padding: 6px 14px; background: var(--tint); color: var(--ink); font-weight: 700; cursor: pointer; }
  button.on { background: var(--leaf); color: #fff; }
  #login input { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; }
  .days { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  .days button { flex-shrink: 0; font-size: 13px; }
  .sum { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .sum b { font-size: 22px; }
  .pill { border-radius: 999px; padding: 1px 10px; font-size: 13px; font-weight: 700; }
  .k-bug { background: #fbe9e4; color: var(--bad); } .k-idea { background: #e4eff5; color: var(--idea); } .k-comment { background: #f8e6d3; color: var(--cmt); }
  h2 { font-size: 16px; margin: 18px 0 8px; display: flex; gap: 8px; align-items: center; }
  .item { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); }
  .item:first-of-type { border-top: 0; }
  .n { flex-shrink: 0; min-width: 40px; text-align: center; font-weight: 800; color: var(--soft); }
  .n.many { color: var(--bad); }
  .msg { white-space: pre-wrap; word-break: break-word; }
  .meta { font-size: 12px; color: var(--soft); margin-top: 2px; }
  .muted { color: var(--soft); font-size: 13px; }
  .err { color: var(--bad); }
  .tabs { display: flex; gap: 6px; margin-bottom: 12px; }
  .bl-title { font-weight: 700; }
  .bl-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .s-open { background: #fbe9e4; color: var(--bad); } .s-doing { background: #fdf1d6; color: #9a6a00; } .s-done { background: var(--tint); color: #2a7552; } .s-wontfix { background: #ececec; color: var(--soft); }
  select { align-self: flex-start; font: inherit; font-size: 13px; border: 1px solid var(--line); border-radius: 8px; padding: 2px 6px; background: #fff; }
  details summary { cursor: pointer; font-size: 12px; color: var(--soft); }
  a { color: var(--idea); }
</style>
</head>
<body>
<main>
  <h1 data-t>ご意見まとめ</h1>
  <form id="login" class="card" hidden>
    <label><span data-t>合言葉</span><input type="password" name="key" autocomplete="current-password" required /></label>
    <button class="on" data-t>見る</button> <span class="err" id="loginErr"></span>
  </form>
  <div id="app" hidden>
    <div class="tabs"><button id="tabDays" class="on" data-t>日ごとのまとめ</button><button id="tabBacklog" data-t>改善リスト</button></div>
    <div id="daysPane">
      <div class="card"><div class="days" id="days"></div></div>
      <div id="view"></div>
    </div>
    <div id="backlogPane" hidden>
      <div class="card"><div class="days" id="statuses"></div></div>
      <div id="backlog"></div>
    </div>
  </div>
</main>
<script>
// 開発者向けの画面なので日本語が基本。ブラウザが日本語でなければ英語で出す
const EN = navigator.language && !navigator.language.startsWith('ja') ? {
  'ご意見まとめ': 'Feedback digest', '合言葉': 'Passphrase', '見る': 'Open', '日ごとのまとめ': 'Daily digests', '改善リスト': 'Backlog',
  '不具合': 'Bug', '要望・アイデア': 'Request / idea', '感想': 'Impression',
  '未対応': 'Open', '対応中': 'In progress', '済': 'Done', '見送り': "Won't fix", 'すべて': 'All',
  ' 件': ' items', '（今日・集計中）': ' (today, in progress)', 'バージョン: ': 'Versions: ',
  'ほかに ': '', ' 種類の投稿は件数が少ないため省略': ' more kinds omitted (few posts)',
  'この日の投稿はありません': 'No posts on this day', '読み込み中…': 'Loading…', '読み込めませんでした': "Couldn't load",
  '今日': 'Today', '合言葉が違います': 'Wrong passphrase',
  'まだ項目はありません。毎日のルーチンがまとめを読んで足していきます': 'No items yet. The daily routine adds them from the digests',
  '投稿の例 ': 'Sample posts ', '変えられませんでした': "Couldn't update",
} : null;
const tr = (s) => (EN && EN[s] != null ? EN[s] : s);
if (EN) {
  document.documentElement.lang = 'en';
  document.title = 'Feedback digest';
  document.querySelectorAll('[data-t]').forEach((e) => (e.textContent = tr(e.textContent)));
}
const KINDS = { bug: tr('不具合'), idea: tr('要望・アイデア'), comment: tr('感想') };
let key = '';
try { key = localStorage.getItem('fb-key') || ''; } catch {}
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const STATUSES = { open: tr('未対応'), doing: tr('対応中'), done: tr('済'), wontfix: tr('見送り') };

async function get(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
  if (r.status === 401) throw new Error('key');
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function fmt(ms) { return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function render(d) {
  const v = $('#view'); v.replaceChildren();
  const head = el('div', 'card');
  const sum = el('div', 'sum');
  sum.append(el('b', '', d.total + tr(' 件')), el('span', 'muted', d.day + (d.live ? tr('（今日・集計中）') : '')));
  for (const k in KINDS) sum.append(el('span', 'pill k-' + k, KINDS[k] + ' ' + d.counts[k]));
  head.append(sum);
  const vers = Object.entries(d.versions || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + '×' + n).join('  ');
  if (vers) head.append(el('div', 'meta', tr('バージョン: ') + vers));
  if (d.truncated) head.append(el('div', 'meta', tr('ほかに ') + d.truncated + tr(' 種類の投稿は件数が少ないため省略')));
  v.append(head);
  for (const k in KINDS) {
    const list = d.items[k] || [];
    if (!list.length) continue;
    const h = el('h2'); h.append(el('span', 'pill k-' + k, KINDS[k]), el('span', 'muted', list.length + tr(' 件')));
    const box = el('div', 'card');
    for (const it of list) {
      const row = el('div', 'item');
      // 前の形式（同じ文面を束ねていた頃）のまとめだけ件数を出す
      if (it.count > 1) row.append(el('div', 'n' + (it.count >= 5 ? ' many' : ''), '×' + it.count));
      const body = el('div');
      body.append(el('div', 'msg', it.message));
      const env = Object.entries(it.env || {}).filter(([k]) => k !== 'ブラウザ').map(([k, x]) => k + ': ' + x).join(' / ');
      body.append(el('div', 'meta', fmt(it.first) + (it.count > 1 ? ' 〜 ' + fmt(it.last) : '') + ' · ' + (it.version || '?') + (env ? ' · ' + env : '')));
      if (it.env && it.env['ブラウザ']) body.append(el('div', 'meta', it.env['ブラウザ']));
      row.append(body); box.append(row);
    }
    v.append(h, box);
  }
  if (!d.total) v.append(el('p', 'muted', tr('この日の投稿はありません')));
}

async function show(path, btn) {
  document.querySelectorAll('.days button').forEach((b) => b.classList.toggle('on', b === btn));
  $('#view').replaceChildren(el('p', 'muted', tr('読み込み中…')));
  try { render(await get(path)); } catch (e) { $('#view').replaceChildren(el('p', 'err', tr('読み込めませんでした') + '（' + e.message + '）')); }
}

async function start() {
  try {
    const list = await get('/api/digests');
    $('#login').hidden = true; $('#app').hidden = false;
    const days = $('#days'); days.replaceChildren();
    const today = el('button', '', tr('今日')); today.onclick = () => show('/api/today', today); days.append(today);
    for (const d of list) {
      const b = el('button', '', d.day.slice(5).replace('-', '/') + ' (' + d.total + ')');
      b.onclick = () => show('/api/digests/' + d.day, b); days.append(b);
    }
    const first = days.children[list.length ? 1 : 0];
    first.click();
  } catch (e) {
    $('#app').hidden = true; $('#login').hidden = false;
    if (key) $('#loginErr').textContent = e.message === 'key' ? tr('合言葉が違います') : tr('読み込めませんでした');
  }
}

let statusFilter = '';
function renderBacklog(list) {
  const v = $('#backlog'); v.replaceChildren();
  if (!list.length) { v.append(el('p', 'muted', tr('まだ項目はありません。毎日のルーチンがまとめを読んで足していきます'))); return; }
  const box = el('div', 'card');
  for (const it of list) {
    const row = el('div', 'item');
    row.append(el('div', 'n' + (it.count >= 10 ? ' many' : ''), '×' + it.count));
    const body = el('div'); body.style.flex = '1';
    const head = el('div', 'bl-head');
    head.append(el('span', 'pill k-' + it.kind, KINDS[it.kind] || it.kind), el('span', 'bl-title', it.title));
    body.append(head);
    body.append(el('div', 'meta', it.first_day + (it.last_day !== it.first_day ? ' 〜 ' + it.last_day : '')));
    if (it.note) body.append(el('div', 'meta', it.note));
    if (it.pr) {
      const m = el('div', 'meta');
      if (/^https:\\/\\/github\\.com\\//.test(it.pr)) { const a = el('a', '', it.pr); a.href = it.pr; a.target = '_blank'; a.rel = 'noopener'; m.append('PR: ', a); } else m.append('PR: ' + it.pr);
      body.append(m);
    }
    if (it.samples && it.samples.length) {
      const d = el('details'); d.append(el('summary', '', tr('投稿の例 ') + it.samples.length + tr(' 件')));
      for (const smp of it.samples) d.append(el('div', 'msg meta', '・' + smp));
      body.append(d);
    }
    const sel = el('select'); sel.className = 's-' + it.status;
    for (const k in STATUSES) { const o = el('option', '', STATUSES[k]); o.value = k; o.selected = k === it.status; sel.append(o); }
    sel.onchange = async () => {
      try { await get('/api/backlog/' + it.id, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) }); sel.className = 's-' + sel.value; }
      catch { sel.value = it.status; alert(tr('変えられませんでした')); }
    };
    row.append(body, sel); box.append(row);
  }
  v.append(box);
}

async function showBacklog() {
  const bar = $('#statuses'); bar.replaceChildren();
  for (const [k, label] of [['', tr('すべて')], ...Object.entries(STATUSES)]) {
    const b = el('button', k === statusFilter ? 'on' : '', label);
    b.onclick = () => { statusFilter = k; showBacklog(); };
    bar.append(b);
  }
  $('#backlog').replaceChildren(el('p', 'muted', tr('読み込み中…')));
  try { renderBacklog(await get('/api/backlog' + (statusFilter ? '?status=' + statusFilter : ''))); }
  catch (e) { $('#backlog').replaceChildren(el('p', 'err', tr('読み込めませんでした') + '（' + e.message + '）')); }
}

function tab(which) {
  $('#tabDays').classList.toggle('on', which === 'days');
  $('#tabBacklog').classList.toggle('on', which === 'backlog');
  $('#daysPane').hidden = which !== 'days';
  $('#backlogPane').hidden = which !== 'backlog';
  if (which === 'backlog') showBacklog();
}
$('#tabDays').onclick = () => tab('days');
$('#tabBacklog').onclick = () => tab('backlog');

$('#login').onsubmit = (e) => {
  e.preventDefault();
  key = new FormData(e.target).get('key');
  try { localStorage.setItem('fb-key', key); } catch {}
  start();
};
start();
</script>
</body>
</html>`;
