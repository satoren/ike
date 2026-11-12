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
</style>
</head>
<body>
<main>
  <h1>ご意見まとめ</h1>
  <form id="login" class="card" hidden>
    <label>合言葉<input type="password" name="key" autocomplete="current-password" required /></label>
    <button class="on">見る</button> <span class="err" id="loginErr"></span>
  </form>
  <div id="app" hidden>
    <div class="card"><div class="days" id="days"></div></div>
    <div id="view"></div>
  </div>
</main>
<script>
const KINDS = { bug: '不具合', idea: '要望・アイデア', comment: '感想' };
let key = '';
try { key = localStorage.getItem('fb-key') || ''; } catch {}
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

async function get(path) {
  const r = await fetch(path, { headers: { Authorization: 'Bearer ' + key } });
  if (r.status === 401) throw new Error('key');
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function fmt(ms) { return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function render(d) {
  const v = $('#view'); v.replaceChildren();
  const head = el('div', 'card');
  const sum = el('div', 'sum');
  sum.append(el('b', '', d.total + ' 件'), el('span', 'muted', d.day + (d.live ? '（今日・集計中）' : '')));
  for (const k in KINDS) sum.append(el('span', 'pill k-' + k, KINDS[k] + ' ' + d.counts[k]));
  head.append(sum);
  const vers = Object.entries(d.versions || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + '×' + n).join('  ');
  if (vers) head.append(el('div', 'meta', 'バージョン: ' + vers));
  if (d.truncated) head.append(el('div', 'meta', 'ほかに ' + d.truncated + ' 種類の投稿は件数が少ないため省略'));
  v.append(head);
  for (const k in KINDS) {
    const list = d.items[k] || [];
    if (!list.length) continue;
    const h = el('h2'); h.append(el('span', 'pill k-' + k, KINDS[k]), el('span', 'muted', list.length + ' 種類'));
    const box = el('div', 'card');
    for (const it of list) {
      const row = el('div', 'item');
      row.append(el('div', 'n' + (it.count >= 5 ? ' many' : ''), '×' + it.count));
      const body = el('div');
      body.append(el('div', 'msg', it.message));
      const env = Object.entries(it.env || {}).filter(([k]) => k !== 'ブラウザ').map(([k, x]) => k + ': ' + x).join(' / ');
      body.append(el('div', 'meta', fmt(it.first) + (it.count > 1 ? ' 〜 ' + fmt(it.last) : '') + ' · ' + (it.version || '?') + (env ? ' · ' + env : '')));
      if (it.env && it.env['ブラウザ']) body.append(el('div', 'meta', it.env['ブラウザ']));
      row.append(body); box.append(row);
    }
    v.append(h, box);
  }
  if (!d.total) v.append(el('p', 'muted', 'この日の投稿はありません'));
}

async function show(path, btn) {
  document.querySelectorAll('.days button').forEach((b) => b.classList.toggle('on', b === btn));
  $('#view').replaceChildren(el('p', 'muted', '読み込み中…'));
  try { render(await get(path)); } catch (e) { $('#view').replaceChildren(el('p', 'err', '読み込めませんでした（' + e.message + '）')); }
}

async function start() {
  try {
    const list = await get('/api/digests');
    $('#login').hidden = true; $('#app').hidden = false;
    const days = $('#days'); days.replaceChildren();
    const today = el('button', '', '今日'); today.onclick = () => show('/api/today', today); days.append(today);
    for (const d of list) {
      const b = el('button', '', d.day.slice(5).replace('-', '/') + ' (' + d.total + ')');
      b.onclick = () => show('/api/digests/' + d.day, b); days.append(b);
    }
    const first = days.children[list.length ? 1 : 0];
    first.click();
  } catch (e) {
    $('#app').hidden = true; $('#login').hidden = false;
    if (key) $('#loginErr').textContent = e.message === 'key' ? '合言葉が違います' : '読み込めませんでした';
  }
}

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
