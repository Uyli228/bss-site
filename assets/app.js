/* Вулик — сайт і візуальний редактор.
   Весь вміст лежить у content.json. Картинки — у папці uploads/.
   Редагування: олівець справа внизу → вхід за GitHub-токеном → зміни прямо на сторінці → «Зберегти». */

const REPO = 'Uyli228/bss-site';
const BRANCH = 'main';
const CONTENT_FILE = 'content.json';
const TOKEN_KEY = 'bss_token';

const state = {
  content: null,
  editing: false,
  token: null,
  dirty: false,
  localImages: {} // щойно завантажені картинки, поки GitHub Pages їх не опублікував
};

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- DOM-хелпер ---------- */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const imgUrl = (p) => state.localImages[p] || p;
const hasImageData = (dt) => dt && [...dt.types].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html');

function toast(msg, bad) {
  const t = $('[data-toast]');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), bad ? 6000 : 3000);
}

function markDirty() {
  state.dirty = true;
  updateAdminBar();
  render();
}

/* ---------- GitHub API ---------- */
async function gh(path, opts = {}) {
  const res = await fetch('https://api.github.com/' + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + state.token,
      Accept: 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (!res.ok) {
    let msg = res.status + '';
    try { msg += ' ' + (await res.json()).message; } catch (e) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function getFileSha(path) {
  try { return (await gh(`repos/${REPO}/contents/${path}?ref=${BRANCH}`)).sha; } catch (e) { return undefined; }
}

async function putFile(path, b64, message) {
  const sha = await getFileSha(path);
  return gh(`repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: b64, branch: BRANCH, sha })
  });
}

/* ---------- Завантаження вмісту ---------- */
async function loadContent() {
  if (state.token) {
    try {
      const f = await gh(`repos/${REPO}/contents/${CONTENT_FILE}?ref=${BRANCH}`);
      state.content = JSON.parse(b64ToUtf8(f.content));
      return;
    } catch (e) { console.warn('API load failed, fallback', e); }
  }
  const res = await fetch(CONTENT_FILE + '?t=' + Date.now());
  state.content = await res.json();
}

async function saveContent() {
  const btn = $('[data-save]');
  btn.disabled = true;
  btn.textContent = 'Зберігаю…';
  try {
    await putFile(CONTENT_FILE, utf8ToB64(JSON.stringify(state.content, null, 2) + '\n'), 'Оновлено вміст сайту');
    state.dirty = false;
    toast('Збережено! На сайті для всіх оновиться за 1–2 хвилини.');
  } catch (e) {
    toast('Не вдалося зберегти: ' + e.message, true);
  }
  btn.disabled = false;
  btn.textContent = 'Зберегти';
  updateAdminBar();
}

/* ---------- Картинки ---------- */
async function compressImage(file) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file);
  const max = 1600;
  if (file.size < 400 * 1024 && bmp.width <= max && bmp.height <= max) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
}

async function uploadImage(file) {
  const f = await compressImage(file);
  const ext = (f.name.match(/\.(\w+)$/) || [, 'png'])[1].toLowerCase();
  const base = f.name.replace(/\.\w+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'img';
  const path = `uploads/${Date.now().toString(36)}-${base}.${ext}`;
  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  await putFile(path, dataUrl.split(',')[1], 'Завантажено картинку ' + path);
  state.localImages[path] = dataUrl;
  return path;
}

/* ---------- Картинки з інших сайтів (перетягування, вставка, посилання) ---------- */
// Посилання з фандом-вікі ведемо на оригінал, без зменшених копій
function cleanImageUrl(url) {
  return url.replace(/\/revision\/latest\/(scale-to-width-down|scale-to-width|smart|thumbnail|top-crop|zoom-crop)[^?]*/, '/revision/latest');
}

function nameFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const i = parts.indexOf('revision');
    return decodeURIComponent(i > 0 ? parts[i - 1] : parts[parts.length - 1] || 'image');
  } catch (e) { return 'image'; }
}

// "Vicious_Bee.png" → "Vicious Bee"
const titleFromName = (name) => name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').trim();

// Дістає картинки з перетягування або вставки: файли, <img> з іншого сайту або посилання
function imageSources(dt) {
  const files = [...(dt.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) return files.map((file) => ({ file, name: file.name }));
  const html = dt.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const urls = [...doc.querySelectorAll('img')].map((img) => img.getAttribute('data-src') || img.getAttribute('src')).filter((u) => /^https?:/.test(u || ''));
    if (urls.length) return [...new Set(urls)].map((u) => ({ url: cleanImageUrl(u), name: nameFromUrl(u) }));
  }
  const uri = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split('\n').map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s) && (/\.(png|jpe?g|gif|webp|svg)(\/|\?|$)/i.test(s) || s.includes('static.wikia')));
  return uri.map((u) => ({ url: cleanImageUrl(u), name: nameFromUrl(u) }));
}

const mdImage = (x) => `![${x.title}](${x.path})`;

// Щойно завантажені картинки ще не опубліковані — показуємо їх з пам'яті
function fixLocalImages(root) {
  root.querySelectorAll('img').forEach((img) => {
    const s = img.getAttribute('src');
    if (state.localImages[s]) img.src = state.localImages[s];
  });
  return root;
}

// Поле приймає картинки: перетягування й Ctrl+V
function acceptImages(el, onImages) {
  el.addEventListener('dragover', (e) => {
    if (!hasImageData(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('drop-hover');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-hover'));
  el.addEventListener('drop', async (e) => {
    el.classList.remove('drop-hover');
    const sources = imageSources(e.dataTransfer);
    if (!sources.length) return;
    e.preventDefault();
    e.stopPropagation();
    onImages(await storeImages(sources));
  });
  el.addEventListener('paste', async (e) => {
    const sources = imageSources(e.clipboardData).filter((s) => s.file);
    if (!sources.length) return;
    e.preventDefault();
    onImages(await storeImages(sources));
  });
}

function insertAtCursor(ta, text) {
  const before = ta.value.slice(0, ta.selectionStart);
  const pad = before && !before.endsWith('\n') ? '\n\n' : '';
  ta.setRangeText(pad + text + '\n', ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

// Зберігає картинку в репозиторій. Якщо сайт не дає її скачати — лишає пряме посилання.
async function storeImage(src) {
  if (src.file) return uploadImage(src.file);
  try {
    // фандом віддає 404 на запити з чужим Referer, а браузер може закешувати ту 404
    const res = await fetch(src.url, { referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('не картинка');
    const ext = blob.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    return await uploadImage(new File([blob], titleFromName(src.name) + '.' + ext, { type: blob.type }));
  } catch (e) {
    console.warn('Не вдалося скопіювати, лишаю посилання', src.url, e);
    return src.url;
  }
}

async function storeImages(sources) {
  const paths = [];
  for (let i = 0; i < sources.length; i++) {
    toast(`Завантажую картинки… ${i + 1} з ${sources.length}`);
    paths.push({ path: await storeImage(sources[i]), title: titleFromName(sources[i].name) });
  }
  toast(sources.length > 1 ? `Додано ${sources.length} картинок ✓` : 'Картинку додано ✓');
  return paths;
}

// Перетягування на сторінку в режимі редагування: шукаємо найближчий елемент з _onDrop
function dropTarget(el) {
  for (; el && el !== document; el = el.parentNode) if (el._onDrop) return el;
  return null;
}
let dropHover = null;
function setDropHover(el) {
  if (dropHover === el) return;
  if (dropHover) dropHover.classList.remove('drop-hover');
  dropHover = el;
  if (el) el.classList.add('drop-hover');
}
document.addEventListener('dragover', (e) => {
  if (!state.editing || !hasImageData(e.dataTransfer)) return;
  e.preventDefault();
  setDropHover(dropTarget(e.target));
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) setDropHover(null); });
document.addEventListener('drop', async (e) => {
  if (!state.editing || !hasImageData(e.dataTransfer)) return;
  e.preventDefault();
  const target = dropTarget(e.target);
  setDropHover(null);
  if (e.target.closest('.overlay')) return; // у вікні редагування працює своя зона
  if (!target) return toast('Перетягни картинку на картку, блок або на сторінку підкатегорії', true);
  const sources = imageSources(e.dataTransfer);
  if (!sources.length) return toast('Тут немає картинки', true);
  const images = await storeImages(sources);
  target._onDrop(images);
  markDirty();
});
// Ctrl+V картинки прямо на сторінку підкатегорії
document.addEventListener('paste', async (e) => {
  if (!state.editing || e.target.closest('input, textarea, .overlay')) return;
  const target = $('.page');
  if (!target || !target._onDrop) return;
  const sources = imageSources(e.clipboardData).filter((s) => s.file);
  if (!sources.length) return;
  e.preventDefault();
  target._onDrop(await storeImages(sources));
  markDirty();
});

/* ---------- Роутинг ---------- */
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'c' && parts[1]) return { cat: parts[1], sub: parts[2] };
  return {};
}
const findCat = (id) => state.content.categories.find((c) => c.id === id);

/* ---------- Відображення ---------- */
function render() {
  const c = state.content;
  if (!c) return;
  document.body.classList.toggle('editing', state.editing);
  document.title = c.site.title;
  $('[data-site-title]').textContent = c.site.title;

  const r = route();
  renderNav(r);
  const main = $('[data-main]');
  main.replaceChildren();

  if (!r.cat) return main.append(renderHome());
  const cat = findCat(r.cat);
  if (!cat) return main.append(notFound());
  if (!r.sub) return main.append(renderCategory(cat));
  const sub = (cat.subs || []).find((s) => s.id === r.sub);
  if (!sub) return main.append(notFound());
  main.append(renderSub(cat, sub));
  requestAnimationFrame(applyFocus);
}

function notFound() {
  return h('div', { class: 'hero' }, h('h1', {}, 'Сторінку не знайдено'), h('p', {}, h('a', { href: '#/' }, 'На головну')));
}

function renderNav(r) {
  const nav = $('[data-nav]');
  nav.replaceChildren(
    h('a', { href: '#/', class: !r.cat ? 'active' : null }, h('span', { class: 'nav-ic' }, '🏠'), 'Головна'),
    ...state.content.categories.map((c) =>
      h('a', { href: '#/c/' + c.id, class: r.cat === c.id ? 'active' : null }, c.icon ? h('span', { class: 'nav-ic' }, c.icon) : null, c.title)
    )
  );
}

function media(item, cls = 'card-media') {
  if (item.image) return h('div', { class: cls }, h('img', { src: imgUrl(item.image), alt: '', loading: 'lazy' }));
  if (item.icon) return h('div', { class: cls + ' emoji' }, item.icon);
  return null;
}

function tools(list, index, onEdit, label) {
  if (!state.editing) return null;
  const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  const move = (d) => {
    const j = index + d;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    markDirty();
  };
  return h('div', { class: 'tools' },
    h('button', { title: 'Вище', onclick: stop(() => move(-1)) }, '↑'),
    h('button', { title: 'Нижче', onclick: stop(() => move(1)) }, '↓'),
    onEdit ? h('button', { title: 'Редагувати', onclick: stop(onEdit) }, '✎') : null,
    h('button', { title: 'Видалити', class: 'danger', onclick: stop(() => {
      if (confirm(`Видалити ${label}? Це можна буде скасувати, лише не натискаючи «Зберегти».`)) { list.splice(index, 1); markDirty(); }
    }) }, '✕')
  );
}

function card(item, href, linkText, list, i, onEdit) {
  const el = h('a', { class: 'card', href },
    tools(list, i, onEdit, `«${item.title}»`),
    media(item),
    h('h3', {}, item.title),
    item.description ? h('p', {}, item.description) : null,
    h('span', { class: 'card-link' }, linkText, h('span', { class: 'chev' }, '›'))
  );
  el._onDrop = (imgs) => { item.image = imgs[0].path; };
  return el;
}

function addCard(text, onclick) {
  return state.editing ? h('button', { class: 'card add-card', onclick }, h('span', { class: 'plus' }, '+'), text) : null;
}

function editButton(text, onclick) {
  return state.editing ? h('button', { class: 'edit-inline', onclick }, '✎ ' + text) : null;
}

function renderHome() {
  const c = state.content;
  const cats = c.categories;
  return h('div', {},
    h('section', { class: 'hero' },
      h('h1', {}, c.home.title),
      c.home.subtitle ? h('p', {}, c.home.subtitle) : null,
      editButton('Змінити заголовок', () => editForm('Головна сторінка', [
        { key: 'siteTitle', label: 'Назва сайту (зліва вгорі)' },
        { key: 'title', label: 'Заголовок' },
        { key: 'subtitle', label: 'Підзаголовок', type: 'textarea' }
      ], { siteTitle: c.site.title, title: c.home.title, subtitle: c.home.subtitle }, (v) => {
        c.site.title = v.siteTitle; c.home.title = v.title; c.home.subtitle = v.subtitle;
      }))
    ),
    cats.length || state.editing ? null : h('p', { class: 'empty' }, 'Тут поки порожньо 🐝'),
    h('div', { class: 'cards' },
      cats.map((cat, i) => card(cat, '#/c/' + cat.id, cat.linkText || 'Відкрити', cats, i, () => editItem(cat, 'Категорія'))),
      addCard('Додати категорію', () => editItem({ id: uid(), title: '', description: '', icon: '📁', subs: [] }, 'Нова категорія', (it) => cats.push(it)))
    )
  );
}

function crumbs(...items) {
  return h('nav', { class: 'crumbs' }, items.map((it, i) =>
    [i ? h('span', { class: 'sep' }, '›') : null, it.href ? h('a', { href: it.href }, it.text) : h('span', {}, it.text)]
  ));
}

function renderCategory(cat) {
  cat.subs = cat.subs || [];
  return h('div', {},
    crumbs({ text: 'Головна', href: '#/' }, { text: cat.title }),
    h('section', { class: 'hero small' },
      h('h1', {}, cat.title),
      cat.description ? h('p', {}, cat.description) : null,
      editButton('Змінити категорію', () => editItem(cat, 'Категорія'))
    ),
    cat.subs.length || state.editing ? null : h('p', { class: 'empty' }, 'Тут поки порожньо 🐝'),
    h('div', { class: 'cards' },
      cat.subs.map((s, i) => card(s, `#/c/${cat.id}/${s.id}`, s.linkText || 'Відкрити', cat.subs, i, () => editItem(s, 'Підкатегорія'))),
      addCard('Додати підкатегорію', () => editItem({ id: uid(), title: '', description: '', icon: '📄', blocks: [] }, 'Нова підкатегорія', (it) => cat.subs.push(it)))
    )
  );
}

function renderSub(cat, sub) {
  sub.blocks = sub.blocks || [];
  const page = h('div', { class: 'page' },
    crumbs({ text: 'Головна', href: '#/' }, { text: cat.title, href: '#/c/' + cat.id }, { text: sub.title }),
    h('header', { class: 'page-head' },
      media(sub, 'page-media'),
      h('div', {},
        h('h1', {}, sub.title),
        sub.description ? h('p', {}, sub.description) : null,
        editButton('Змінити підкатегорію', () => editItem(sub, 'Підкатегорія'))
      )
    ),
    sub.blocks.length || state.editing ? null : h('p', { class: 'empty' }, 'Тут поки порожньо 🐝'),
    sub.blocks.map((b, i) => {
      const el = h('section', { class: 'block block-' + b.type, 'data-block': i },
        tools(sub.blocks, i, () => editBlock(b), 'цей блок'),
        b.heading ? h('h2', { class: 'block-title' }, b.heading) : null,
        renderBlock(b)
      );
      if (b.type === 'cards') el._onDrop = (imgs) => b.items.push(...imgs.map((x) => ({ image: x.path, title: x.title, subtitle: '' })));
      if (b.type === 'image') el._onDrop = (imgs) => { b.image = imgs[0].path; };
      if (b.type === 'links') el._onDrop = (imgs) => {
        b.items.push(...imgs.map((x) => ({ title: x.title, url: 'https://', icon: '', image: x.path, note: '' })));
        toast('Додано посилання з картинкою — натисни ✎ і впиши адресу');
      };
      if (b.type === 'text') el._onDrop = (imgs) => { b.text = (b.text ? b.text.trimEnd() + '\n\n' : '') + imgs.map(mdImage).join('\n\n') + '\n'; };
      return el;
    }),
    state.editing ? h('div', { class: 'add-block' },
      h('span', {}, 'Додати блок:'),
      BLOCK_TYPES.map((t) => h('button', { class: 'btn ghost', onclick: () => {
        const b = t.make();
        editBlock(b, () => sub.blocks.push(b));
      } }, t.icon + ' ' + t.label)),
      h('p', { class: 'drop-hint' }, '💡 Перетягни картинки з іншої вкладки (наприклад, з вікі) прямо сюди або на будь-який блок. Також працює Ctrl+V.')
    ) : null
  );
  // Картинки, кинуті на сторінку: одна → блок «Картинка», кілька → блок «Картки»
  page._onDrop = (imgs) => sub.blocks.push(imgs.length === 1
    ? { type: 'image', heading: '', image: imgs[0].path, caption: '' }
    : { type: 'cards', heading: '', items: imgs.map((x) => ({ image: x.path, title: x.title, subtitle: '' })) });
  const head = page.querySelector('.page-media');
  if (head) head._onDrop = (imgs) => { sub.image = imgs[0].path; };
  return page;
}

/* ---------- Блоки ---------- */
const BLOCK_TYPES = [
  { type: 'text', icon: '📝', label: 'Текст', make: () => ({ type: 'text', heading: '', text: '' }) },
  { type: 'image', icon: '🖼️', label: 'Картинка', make: () => ({ type: 'image', heading: '', image: '', caption: '' }) },
  { type: 'cards', icon: '🗂️', label: 'Картки з картинками', make: () => ({ type: 'cards', heading: '', items: [] }) },
  { type: 'table', icon: '📊', label: 'Таблиця', make: () => ({ type: 'table', heading: '', rows: [['Назва', 'Значення'], ['', '']] }) },
  { type: 'links', icon: '🔗', label: 'Посилання', make: () => ({ type: 'links', heading: '', items: [] }) }
];

function renderBlock(b) {
  switch (b.type) {
    case 'text':
      return fixLocalImages(h('div', { class: 'prose', html: DOMPurify.sanitize(marked.parse(b.text || ''), { ADD_ATTR: ['target'] }) }));
    case 'image':
      return b.image ? h('figure', {}, h('img', { src: imgUrl(b.image), alt: b.caption || '', class: 'zoomable', onclick: () => lightbox(b.image) }), b.caption ? h('figcaption', {}, b.caption) : null) : h('p', { class: 'muted' }, 'Немає картинки');
    case 'cards':
      return h('div', { class: 'mini-cards' }, (b.items || []).map((it, j) => h(it.url ? 'a' : 'div', { class: 'mini-card', 'data-item': j, href: it.url || null, target: it.url ? '_blank' : null, rel: it.url ? 'noopener' : null },
        it.image ? h('img', { src: imgUrl(it.image), alt: '', loading: 'lazy', onclick: it.url ? null : () => lightbox(it.image) }) : h('div', { class: 'mini-emoji' }, it.icon || '🐝'),
        h('b', {}, it.title),
        it.subtitle ? h('span', {}, it.subtitle) : null
      )));
    case 'table':
      return renderTable(b.rows || []);
    case 'links':
      return h('div', { class: 'links' }, (b.items || []).map((l, j) => {
        const row = h('a', { class: 'link-row', 'data-item': j, href: l.url, target: '_blank', rel: 'noopener' },
          l.image ? h('img', { class: 'link-img', src: imgUrl(l.image), alt: '', loading: 'lazy' }) : h('span', { class: 'link-ic' }, l.icon || '🔗'),
          h('span', { class: 'link-text' }, h('b', {}, l.title), l.note ? h('small', {}, l.note) : null),
          h('span', { class: 'chev' }, '↗')
        );
        row._onDrop = (imgs) => { l.image = imgs[0].path; };
        return row;
      }));
  }
  return null;
}

function renderTable(rows) {
  if (!rows.length) return null;
  const [head, ...body] = rows;
  // У клітинках працює короткий markdown: **жирний**, [посилання](...), ![картинка](...)
  const cell = (text) => fixLocalImages(h('td', { html: DOMPurify.sanitize(marked.parseInline(text || ''), { ADD_ATTR: ['target'] }) }));
  const tbody = h('tbody', {}, body.map((r, j) => h('tr', { 'data-item': j }, head.map((_, i) => cell(r[i])))));
  let sortCol = -1, dir = 1;
  const ths = head.map((c, i) => h('th', { onclick: () => {
    dir = sortCol === i ? -dir : 1; sortCol = i;
    ths.forEach((t, j) => t.dataset.dir = j === i ? (dir > 0 ? 'asc' : 'desc') : '');
    const trs = [...tbody.rows];
    trs.sort((a, b) => {
      const x = a.cells[i].textContent.trim(), y = b.cells[i].textContent.trim();
      const nx = parseFloat(x.replace(',', '.')), ny = parseFloat(y.replace(',', '.'));
      return dir * (!isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y, 'uk'));
    });
    tbody.append(...trs);
  } }, c));
  const table = h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ths)), tbody));
  if (body.length <= 8) return table;
  const search = h('input', { type: 'search', placeholder: 'Пошук у таблиці…', oninput: () => {
    const q = search.value.toLowerCase().trim();
    [...tbody.rows].forEach((r) => (r.hidden = q && !r.textContent.toLowerCase().includes(q)));
  } });
  return h('div', {}, h('label', { class: 'search' }, '🔍', search), table);
}

function lightbox(path) {
  const lb = h('div', { class: 'lightbox', onclick: () => lb.remove() }, h('img', { src: imgUrl(path), alt: '' }));
  document.body.append(lb);
}

/* ---------- Модальні вікна й форми ---------- */
function modal(title, body, onSave, saveText = 'Готово') {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', esc);
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => e.target === overlay && close() },
    h('div', { class: 'dialog' },
      h('div', { class: 'dialog-head' }, h('h2', {}, title), h('button', { class: 'x', onclick: close }, '✕')),
      h('div', { class: 'dialog-body' }, body),
      h('div', { class: 'dialog-foot' },
        h('button', { class: 'btn ghost', onclick: close }, 'Скасувати'),
        onSave ? h('button', { class: 'btn', onclick: async () => { if ((await onSave()) !== false) close(); } }, saveText) : null
      )
    )
  );
  document.body.append(overlay);
  const first = overlay.querySelector('input, textarea');
  if (first) first.focus();
  return close;
}

function imagePicker(value, onChange, allowIcon) {
  let current = value || '';
  const preview = h('div', { class: 'pick-preview' });
  const showPreview = () => preview.replaceChildren(current ? h('img', { src: imgUrl(current), alt: '' }) : h('span', { class: 'muted' }, 'Без картинки'));
  showPreview();
  const status = h('span', { class: 'muted small' });
  const take = async (src) => {
    status.textContent = 'Завантажую…';
    try {
      current = await storeImage(src);
      onChange(current);
      status.textContent = /^https?:/.test(current) ? 'Додано як посилання' : 'Готово ✓';
      showPreview();
    } catch (e) { status.textContent = 'Помилка: ' + e.message; }
  };
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    if (file.files[0]) await take({ file: file.files[0], name: file.files[0].name });
    file.value = '';
  } });
  const url = h('input', { type: 'text', class: 'pick-url', placeholder: 'або встав посилання / Ctrl+V картинку',
    onpaste: (e) => {
      const src = imageSources(e.clipboardData)[0];
      if (src && src.file) { e.preventDefault(); take(src); }
    },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } } });
  const go = () => { const u = url.value.trim(); if (/^https?:\/\//.test(u)) { take({ url: cleanImageUrl(u), name: nameFromUrl(u) }); url.value = ''; } };
  const picker = h('div', { class: 'picker' }, preview,
    h('div', { class: 'pick-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, 'Вибрати файл'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => { current = ''; onChange(''); showPreview(); } }, 'Прибрати'),
      status, file,
      h('div', { class: 'pick-url-row' }, url, h('button', { class: 'btn ghost small', type: 'button', onclick: go }, 'OK'))
    )
  );
  // Перетягування картинки прямо на поле
  picker.addEventListener('dragover', (e) => { if (hasImageData(e.dataTransfer)) { e.preventDefault(); picker.classList.add('drop-hover'); } });
  picker.addEventListener('dragleave', () => picker.classList.remove('drop-hover'));
  picker.addEventListener('drop', (e) => {
    e.preventDefault();
    picker.classList.remove('drop-hover');
    const src = imageSources(e.dataTransfer)[0];
    if (src) take(src);
  });
  return picker;
}

function field(f, values) {
  let input;
  if (f.type === 'image') input = imagePicker(values[f.key], (v) => (values[f.key] = v));
  else if (f.type === 'textarea') {
    input = h('textarea', { rows: f.rows || 3, oninput: (e) => (values[f.key] = e.target.value) }, values[f.key] || '');
    if (f.images) {
      const ta = input;
      const put = (imgs) => insertAtCursor(ta, imgs.map(mdImage).join('\n\n'));
      acceptImages(ta, put);
      const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
        const files = [...file.files];
        file.value = '';
        if (files.length) put(await storeImages(files.map((f) => ({ file: f, name: f.name }))));
      } });
      input = h('div', { class: 'ta-wrap' },
        h('div', { class: 'ta-bar' },
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => file.click() }, '🖼️ Вставити картинку'),
          h('span', { class: 'muted small' }, 'або перетягни / Ctrl+V прямо в текст'),
          file),
        ta);
    }
  }
  else input = h('input', { type: 'text', value: values[f.key] || '', placeholder: f.placeholder || '', oninput: (e) => (values[f.key] = e.target.value) });
  return h('label', { class: 'field' + (f.half ? ' half' : '') }, h('span', {}, f.label), f.hint ? h('small', {}, f.hint) : null, input);
}

function editForm(title, fields, values, apply) {
  const v = { ...values };
  modal(title, h('div', { class: 'form' }, fields.map((f) => field(f, v))), () => { apply(v); markDirty(); });
}

function editItem(item, title, onCreate) {
  const fields = [
    { key: 'title', label: 'Назва' },
    { key: 'description', label: 'Опис', type: 'textarea' },
    { key: 'image', label: 'Картинка', type: 'image' },
    { key: 'icon', label: 'Або емодзі (якщо без картинки)', half: true },
    { key: 'linkText', label: 'Текст кнопки', placeholder: 'Відкрити', half: true }
  ];
  const v = { ...item };
  modal(title, h('div', { class: 'form' }, fields.map((f) => field(f, v))), () => {
    if (!v.title || !v.title.trim()) { toast('Вкажи назву', true); return false; }
    Object.assign(item, v);
    if (onCreate) onCreate(item);
    markDirty();
  });
}

function listEditor(items, fields, addText, blank) {
  const box = h('div', { class: 'list-ed' });
  const draw = () => box.replaceChildren(
    ...items.map((it, i) => h('div', { class: 'list-row' },
      h('div', { class: 'list-fields' }, fields.map((f) => field(f, it))),
      h('div', { class: 'list-tools' },
        h('button', { type: 'button', title: 'Вище', onclick: () => { if (i) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } } }, '↑'),
        h('button', { type: 'button', title: 'Нижче', onclick: () => { if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } } }, '↓'),
        h('button', { type: 'button', class: 'danger', title: 'Видалити', onclick: () => { items.splice(i, 1); draw(); } }, '✕')
      )
    )),
    h('button', { type: 'button', class: 'btn ghost add-row', onclick: () => { items.push(blank()); draw(); } }, '+ ' + addText)
  );
  draw();
  return box;
}

function tableEditor(rows) {
  const box = h('div', { class: 'table-ed' });
  const draw = () => {
    const cols = rows[0].length;
    box.replaceChildren(
      h('div', { class: 'table-ed-scroll' }, h('table', {},
        rows.map((r, ri) => h('tr', { class: ri === 0 ? 'head' : null },
          r.map((c, ci) => {
            const inp = h('input', { value: c, placeholder: ri === 0 ? 'Заголовок' : '', oninput: (e) => (r[ci] = e.target.value) });
            // Картинку можна кинути прямо в клітинку
            if (ri) acceptImages(inp, (imgs) => { r[ci] = (r[ci] ? r[ci] + ' ' : '') + imgs.map((x) => `![${x.title}](${x.path})`).join(' '); inp.value = r[ci]; });
            return h('td', {}, inp);
          }),
          h('td', { class: 'ctl' }, ri ? h('button', { type: 'button', class: 'danger', title: 'Видалити рядок', onclick: () => { rows.splice(ri, 1); draw(); } }, '✕') : null)
        )),
        h('tr', {}, Array.from({ length: cols }, (_, ci) => h('td', { class: 'ctl' },
          cols > 1 ? h('button', { type: 'button', class: 'danger', title: 'Видалити колонку', onclick: () => { rows.forEach((r) => r.splice(ci, 1)); draw(); } }, '✕ колонку') : null)))
      )),
      h('div', { class: 'pick-actions' },
        h('button', { type: 'button', class: 'btn small', onclick: () => { rows.push(Array(cols).fill('')); draw(); } }, '+ Рядок'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => { rows.forEach((r, i) => r.push(i ? '' : 'Колонка')); draw(); } }, '+ Колонка'),
        h('span', { class: 'muted small' }, 'Перший рядок — заголовки. Таблицю з Excel/Google Sheets можна вставити в першу клітинку. Картинку можна перетягнути або вставити Ctrl+V прямо в клітинку.')
      )
    );
    // Вставка таблиці з Excel / Google Sheets
    box.querySelector('input').addEventListener('paste', (e) => {
      const text = e.clipboardData.getData('text');
      if (!text.includes('\t')) return;
      e.preventDefault();
      const pasted = text.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t'));
      const w = Math.max(...pasted.map((r) => r.length));
      rows.splice(0, rows.length, ...pasted.map((r) => Array.from({ length: w }, (_, i) => r[i] || '')));
      draw();
    });
  };
  draw();
  return box;
}

function editBlock(b, onCreate) {
  const draft = JSON.parse(JSON.stringify(b));
  const type = BLOCK_TYPES.find((t) => t.type === b.type);
  const parts = [field({ key: 'heading', label: 'Заголовок блоку (необов\'язково)' }, draft)];
  if (b.type === 'text') parts.push(field({ key: 'text', label: 'Текст', type: 'textarea', rows: 12, images: true, hint: '**жирний**, *курсив*, ## Заголовок, - список, [посилання](https://...), картинка: ![опис](адреса)' }, draft));
  if (b.type === 'image') parts.push(field({ key: 'image', label: 'Картинка', type: 'image' }, draft), field({ key: 'caption', label: 'Підпис' }, draft));
  if (b.type === 'cards') parts.push(h('div', { class: 'field' }, h('span', {}, 'Картки'), listEditor(draft.items, [
    { key: 'image', label: 'Картинка', type: 'image' },
    { key: 'title', label: 'Назва', half: true },
    { key: 'subtitle', label: 'Підпис / значення', half: true },
    { key: 'icon', label: 'Емодзі (якщо без картинки)', half: true },
    { key: 'url', label: 'Посилання (необов\'язково)', half: true }
  ], 'Додати картку', () => ({ image: '', title: '', subtitle: '' }))));
  if (b.type === 'table') parts.push(h('div', { class: 'field' }, h('span', {}, 'Таблиця'), tableEditor(draft.rows)));
  if (b.type === 'links') parts.push(h('div', { class: 'field' }, h('span', {}, 'Посилання'), listEditor(draft.items, [
    { key: 'image', label: 'Картинка (замість емодзі, необов\'язково)', type: 'image' },
    { key: 'title', label: 'Назва', half: true },
    { key: 'icon', label: 'Емодзі', half: true },
    { key: 'url', label: 'Адреса (https://...)' },
    { key: 'note', label: 'Опис' }
  ], 'Додати посилання', () => ({ title: '', url: 'https://', icon: '🔗', note: '' }))));

  modal(type.icon + ' ' + type.label, h('div', { class: 'form' }, parts), () => {
    Object.assign(b, draft);
    if (onCreate) onCreate();
    markDirty();
  });
}

/* ---------- Адмінка ---------- */
function updateAdminBar() {
  $('[data-admin-bar]').hidden = !state.editing;
  $('[data-fab]').hidden = state.editing;
  $('[data-admin-status]').textContent = state.dirty ? 'Є незбережені зміни' : 'Режим редагування';
  $('[data-admin-bar]').classList.toggle('dirty', state.dirty);
}

async function enterEditing() {
  state.editing = true;
  await loadContent();
  updateAdminBar();
  render();
  toast('Режим редагування увімкнено ✏️');
}

function loginDialog() {
  const v = { token: '' };
  modal('Вхід у редагування', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Встав GitHub-токен з доступом до репозиторію. Він зберігається тільки в цьому браузері.'),
    field({ key: 'token', label: 'Токен (ghp_…)' }, v),
    h('p', { class: 'muted small' }, 'Немає токена? ', h('a', { href: 'https://github.com/settings/tokens/new?scopes=public_repo&description=bss-site-editor', target: '_blank', rel: 'noopener' }, 'Створи тут'), ' → Generate token → скопіюй.')
  ), async () => {
    state.token = v.token.trim();
    try {
      const repo = await gh(`repos/${REPO}`);
      if (!repo.permissions || !repo.permissions.push) throw new Error('у токена немає права запису');
    } catch (e) {
      state.token = null;
      toast('Токен не підійшов: ' + e.message, true);
      return false;
    }
    try { localStorage.setItem(TOKEN_KEY, state.token); } catch (e) {}
    await enterEditing();
  }, 'Увійти');
}

function logout() {
  if (state.dirty && !confirm('Є незбережені зміни. Вийти без збереження?')) return;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  state.token = null;
  state.editing = false;
  state.dirty = false;
  updateAdminBar();
  loadContent().then(render);
}

/* ---------- Пошук по сайту ---------- */
const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е');

// Markdown → простий текст для пошуку й уривків
const plain = (s) => (s || '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`>#|]+/g, ' ')
  .replace(/^\s*[-+]\s+/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

function buildIndex() {
  const out = [];
  for (const cat of state.content.categories) {
    out.push({ title: cat.title, text: cat.description, path: 'Розділ', href: '#/c/' + cat.id, item: cat, rank: 3 });
    for (const sub of cat.subs || []) {
      const href = `#/c/${cat.id}/${sub.id}`;
      const path = cat.title;
      const where = cat.title + ' › ' + sub.title;
      out.push({ title: sub.title, text: sub.description, path, href, item: sub, rank: 2 });
      (sub.blocks || []).forEach((b, bi) => {
        const focus = (item) => ({ block: bi, item });
        if (b.type === 'text') out.push({ title: b.heading || sub.title, text: plain(b.text), path: where, href, focus: focus(), icon: '📝' });
        if (b.type === 'image' && (b.caption || b.heading)) out.push({ title: b.caption || b.heading, text: b.heading, path: where, href, focus: focus(), item: { image: b.image } });
        if (b.type === 'cards') (b.items || []).forEach((it, j) => out.push({ title: it.title, text: [it.subtitle, b.heading].filter(Boolean).join(' · '), path: where, href, focus: focus(j), item: it }));
        if (b.type === 'links') (b.items || []).forEach((l, j) => out.push({ title: l.title, text: [l.note, l.url].filter(Boolean).join(' · '), path: where, href, focus: focus(j), item: l, icon: l.icon || '🔗' }));
        if (b.type === 'table') {
          const [head, ...rows] = b.rows || [];
          rows.forEach((r, j) => {
            const img = (r.join(' ').match(/!\[[^\]]*\]\(([^)]+)\)/) || [])[1];
            out.push({ title: plain(r[0]) || plain(r.join(' ')), text: r.slice(1).map((c, i) => head && plain(c) ? `${plain(head[i + 1])}: ${plain(c)}` : plain(c)).filter(Boolean).join(' · '), path: where + (b.heading ? ' › ' + b.heading : ''), href, focus: focus(j), item: img ? { image: img } : null, icon: '📊' });
          });
        }
      });
    }
  }
  return out;
}

function searchSite(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return buildIndex()
    .map((r) => {
      const t = norm(r.title), all = t + ' ' + norm(r.text) + ' ' + norm(r.path);
      if (!words.every((w) => all.includes(w))) return null;
      let score = (r.rank || 0) + words.filter((w) => t.includes(w)).length * 5;
      if (t.startsWith(words[0])) score += 3;
      return { ...r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

// Підсвічує знайдені слова (через DOM, без innerHTML)
function marked_(text, words) {
  if (!text) return [];
  const lower = norm(text);
  const marks = [];
  for (const w of words) for (let i = lower.indexOf(w); i !== -1; i = lower.indexOf(w, i + w.length)) marks.push([i, i + w.length]);
  marks.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    parts.push(text.slice(pos, s), h('mark', {}, text.slice(s, e)));
    pos = e;
  }
  parts.push(text.slice(pos));
  return parts;
}

// Уривок довкола першого збігу
function snippet(text, words) {
  if (!text || text.length <= 120) return text;
  const i = Math.max(0, ...words.map((w) => norm(text).indexOf(w)).filter((x) => x >= 0).slice(0, 1));
  const start = Math.max(0, i - 50);
  return (start ? '…' : '') + text.slice(start, start + 120) + (start + 120 < text.length ? '…' : '');
}

function goTo(href, focus) {
  state.focus = focus || null;
  if (location.hash === href) render();
  else location.hash = href;
}

function applyFocus() {
  const f = state.focus;
  state.focus = null;
  if (!f || f.block == null) return;
  const block = document.querySelector(`.block[data-block="${f.block}"]`);
  if (!block) return;
  const el = (f.item != null && block.querySelector(`[data-item="${f.item}"]`)) || block;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 2400);
}

(function setupSearch() {
  const box = $('[data-site-search]');
  const input = box.querySelector('input');
  const panel = $('[data-search-results]');
  let results = [], active = 0;

  const close = () => { panel.hidden = true; box.classList.remove('open'); };
  const pick = (r) => { close(); input.blur(); goTo(r.href, r.focus); };

  function draw() {
    const q = input.value.trim();
    if (!q || !state.content) return close();
    const words = norm(q).split(/\s+/).filter(Boolean);
    results = searchSite(q);
    active = 0;
    panel.replaceChildren(
      results.length
        ? h('div', { class: 'sr-count' }, `Знайдено: ${results.length}${results.length === 40 ? '+' : ''}`)
        : h('div', { class: 'sr-empty' }, 'Нічого не знайдено 🐝'),
      ...results.map((r, i) => h('a', { class: 'sr-item' + (i === 0 ? ' active' : ''), href: r.href,
        onclick: (e) => { e.preventDefault(); pick(r); },
        onmousemove: () => setActive(i) },
        r.item && r.item.image ? h('img', { class: 'sr-thumb', src: imgUrl(r.item.image), alt: '' })
          : h('span', { class: 'sr-thumb emoji' }, (r.item && r.item.icon) || r.icon || '📄'),
        h('span', { class: 'sr-text' },
          h('b', {}, marked_(r.title, words)),
          h('small', { class: 'sr-path' }, r.path),
          r.text ? h('small', {}, marked_(snippet(r.text, words), words)) : null
        )
      ))
    );
    panel.hidden = false;
    box.classList.add('open');
  }

  function setActive(i) {
    const items = panel.querySelectorAll('.sr-item');
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((el, j) => el.classList.toggle('active', j === active));
    items[active].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', draw);
  input.addEventListener('focus', () => input.value.trim() && draw());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
  });
  document.addEventListener('mousedown', (e) => { if (!box.contains(e.target)) close(); });
  // «/» або Ctrl+K — перейти до пошуку
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.focus(); input.select(); }
  });
})();

/* ---------- Старт ---------- */
$('[data-fab]').addEventListener('click', () => (state.token ? enterEditing() : loginDialog()));
$('[data-save]').addEventListener('click', saveContent);
$('[data-logout]').addEventListener('click', logout);
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

try { state.token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
marked.use({ renderer: { link(href, title, text) { return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`; } } });

loadContent()
  .then(render)
  .catch((e) => { $('[data-main]').replaceChildren(h('p', { class: 'empty' }, 'Не вдалося завантажити сайт: ' + e.message)); });
