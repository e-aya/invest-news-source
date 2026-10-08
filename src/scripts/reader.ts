// 読者ごとの機能（あとで読む・既読・ウォッチ銘柄・テーマ・相互RSS）。
// すべて端末内（localStorage）だけで完結し、URLは一切変えない（クロール対策）。
// 保存領域が使えない環境（プライベートブラウズ等）でも、表示が崩れないようにする。

type Store = { saved: string[]; read: string[]; watch: string[]; lastVisit: number; lastSeen: number };
const KEY = 'zim:v1';

function load(): Store {
  const empty: Store = { saved: [], read: [], watch: [], lastVisit: 0, lastSeen: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}
function save(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できなくても動作は続ける */ }
}

const store = load();
// 30分以上あいだが空いたら「前回の訪問」とみなす（ウォッチ銘柄の「新着」判定に使う）
if (Date.now() - store.lastSeen > 30 * 60 * 1000) store.lastVisit = store.lastSeen;
store.lastSeen = Date.now();
save(store);

// 公開中の記事IDの一覧（削除済み記事が保存データに残っていても無視するため）
const published = new Set<string>(
  JSON.parse(document.getElementById('published-ids')?.textContent || '[]'),
);
if (published.size) {
  store.saved = store.saved.filter((id) => published.has(id));
  store.read = store.read.filter((id) => published.has(id));
}

function toggle(list: string[], v: string) {
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1); else list.push(v);
  return i < 0;
}

/* ---------- テーマ ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) =>
  b.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  }),
);

/* ---------- あとで読む ---------- */
function renderSaved() {
  document.querySelectorAll<HTMLElement>('[data-saved-count]').forEach((el) => {
    el.textContent = store.saved.length ? String(store.saved.length) : '';
  });
  document.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => {
    const on = store.saved.includes(b.dataset.save!);
    b.setAttribute('aria-pressed', String(on));
    const label = b.querySelector('[data-label]');
    if (label) label.textContent = on ? 'あとで読む に保存済み' : 'あとで読む';
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) =>
  b.addEventListener('click', () => { toggle(store.saved, b.dataset.save!); save(store); renderSaved(); }),
);

/* ---------- 既読 ---------- */
function renderRead() {
  document.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
    el.classList.toggle('is-read', store.read.includes(el.dataset.card!));
  });
}
// 記事を最後（著者ボックス）まで読んだら既読にする
const endMark = document.querySelector<HTMLElement>('[data-read-mark]');
if (endMark && 'IntersectionObserver' in window) {
  const id = endMark.dataset.readMark!;
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting) && !store.read.includes(id)) {
      store.read.push(id);
      save(store);
      io.disconnect();
    }
  });
  io.observe(endMark);
}

/* ---------- 読了バー ---------- */
const bar = document.querySelector<HTMLElement>('[data-progress]');
if (bar) {
  const body = document.querySelector<HTMLElement>('[data-article-body]');
  const onScroll = () => {
    if (!body) return;
    const r = body.getBoundingClientRect();
    const total = r.height - innerHeight;
    const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
    bar.style.width = `${(p * 100).toFixed(1)}%`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- ウォッチ銘柄 ---------- */
type TickerInfo = { code: string; name: string; url: string; latest: number };
const tickers: Record<string, TickerInfo> = JSON.parse(document.getElementById('ticker-index')?.textContent || '{}');

function renderWatch() {
  document.querySelectorAll<HTMLButtonElement>('[data-watch]').forEach((b) => {
    const code = b.dataset.watch!;
    const on = store.watch.includes(code);
    b.setAttribute('aria-pressed', String(on));
    const label = b.querySelector('[data-label]');
    if (label) label.textContent = on ? `${code} をウォッチ中` : `${code} をウォッチ`;
  });
  const box = document.querySelector<HTMLElement>('[data-watch-list]');
  if (box) {
    const items = store.watch.filter((c) => tickers[c]);
    const wrap = box.closest<HTMLElement>('[data-watch-panel]');
    if (wrap) wrap.hidden = items.length === 0;
    box.replaceChildren(
      ...items.map((c) => {
        const t = tickers[c];
        const a = document.createElement('a');
        a.className = 'chip';
        a.href = t.url;
        a.innerHTML = `<span class="num"></span><span></span>`;
        a.children[0].textContent = t.code;
        a.children[1].textContent = t.name;
        if (t.latest > store.lastVisit && store.lastVisit > 0) {
          const n = document.createElement('span');
          n.className = 'new';
          n.textContent = '新着';
          a.append(n);
        }
        return a;
      }),
    );
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-watch]').forEach((b) =>
  b.addEventListener('click', () => { toggle(store.watch, b.dataset.watch!); save(store); renderWatch(); }),
);

/* ---------- シリーズ一覧の絞り込み（URLは変えない） ---------- */
document.querySelectorAll<HTMLElement>('[data-filter-group]').forEach((group) => {
  const list = document.querySelector<HTMLElement>(group.dataset.filterGroup!);
  const buttons = group.querySelectorAll<HTMLButtonElement>('[data-filter]');
  const apply = (mode: string) => {
    buttons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === mode)));
    list?.querySelectorAll<HTMLElement>('[data-item]').forEach((li) => {
      const id = li.dataset.item!;
      const show = mode === 'all' || (mode === 'unread' && !store.read.includes(id)) || (mode === 'saved' && store.saved.includes(id));
      li.hidden = !show;
    });
  };
  buttons.forEach((b) => b.addEventListener('click', () => apply(b.dataset.filter!)));
  apply('all');
});
// 既読数の進捗
document.querySelectorAll<HTMLElement>('[data-series-progress]').forEach((el) => {
  const ids: string[] = JSON.parse(el.dataset.seriesProgress || '[]');
  const n = ids.filter((id) => store.read.includes(id)).length;
  const count = el.querySelector('[data-count]');
  const fill = el.querySelector<HTMLElement>('[data-fill]');
  if (count) count.textContent = String(n);
  if (fill) fill.style.width = `${ids.length ? Math.round((n / ids.length) * 100) : 0}%`;
});

/* ---------- あとで読む一覧ページ ---------- */
const savedList = document.querySelector<HTMLElement>('[data-saved-list]');
if (savedList) {
  savedList.querySelectorAll<HTMLElement>('[data-item]').forEach((li) => {
    li.hidden = !store.saved.includes(li.dataset.item!);
  });
  const empty = document.querySelector<HTMLElement>('[data-saved-empty]');
  if (empty) empty.hidden = store.saved.length > 0;
}

/* ---------- 相互RSS ---------- */
type RssItem = { feed: string; blog: string; title: string; link: string; date: number };
const rssBox = document.querySelector<HTMLElement>('[data-rss]');
if (rssBox) {
  const list = rssBox.querySelector<HTMLElement>('[data-rss-list]')!;
  const select = rssBox.querySelector<HTMLSelectElement>('[data-rss-select]')!;
  let items: RssItem[] = [];
  let maxInAll = 2;
  const ago = (t: number) => {
    const m = Math.max(1, Math.round((Date.now() - t) / 60000));
    return m < 60 ? `${m}分前` : m < 1440 ? `${Math.round(m / 60)}時間前` : `${Math.round(m / 1440)}日前`;
  };
  const render = () => {
    const src = select.value;
    let view: RssItem[];
    if (src === 'all') {
      const per: Record<string, number> = {};
      view = items.filter((i) => (per[i.feed] = (per[i.feed] || 0) + 1) <= maxInAll).slice(0, 8);
    } else {
      view = items.filter((i) => i.feed === src).slice(0, 6);
    }
    list.replaceChildren(
      ...view.map((i) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = i.link;
        a.target = '_blank';
        a.rel = 'noopener';
        const t = document.createElement('span'); t.className = 't'; t.textContent = i.title;
        const b = document.createElement('span'); b.className = 'b'; b.textContent = `${i.blog}　${ago(i.date)}`;
        a.append(t, b); li.append(a);
        return li;
      }),
    );
    if (!view.length) list.innerHTML = '<li class="note" style="padding:10px 0">記事を取得できませんでした</li>';
  };
  try { const v = localStorage.getItem('rss-src'); if (v && [...select.options].some((o) => o.value === v)) select.value = v; } catch {}
  select.addEventListener('change', () => { try { localStorage.setItem('rss-src', select.value); } catch {} render(); });
  fetch('/api/rss')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d: { items: RssItem[]; maxInAll?: number }) => { items = d.items; maxInAll = d.maxInAll ?? 2; render(); })
    .catch(() => { list.innerHTML = '<li class="note" style="padding:10px 0">記事を取得できませんでした</li>'; });
}

renderSaved();
renderRead();
renderWatch();
