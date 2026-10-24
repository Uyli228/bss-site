// Мобільне меню
(function () {
  var btn = document.querySelector('[data-menu]');
  if (btn) btn.addEventListener('click', function () { document.body.classList.toggle('menu-open'); });
})();

function norm(s) { return (s || '').toLowerCase().trim(); }

// Записи: фільтр за категорією + пошук
(function () {
  var list = document.querySelector('[data-posts]');
  if (!list) return;
  var cards = Array.prototype.slice.call(list.children);
  var search = document.querySelector('[data-search]');
  var empty = document.querySelector('[data-empty]');
  var buttons = document.querySelectorAll('[data-filters] .chip-btn');
  var current = 'all';

  function apply() {
    var q = norm(search.value), shown = 0;
    cards.forEach(function (c) {
      var ok = (current === 'all' || c.dataset.cat === current) && (!q || norm(c.textContent).indexOf(q) !== -1);
      c.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      buttons.forEach(function (x) { x.classList.toggle('active', x === b); });
      current = b.dataset.cat;
      apply();
    });
  });
  search.addEventListener('input', apply);
})();

// Бджоли: фільтри рідкості й кольору + пошук
(function () {
  var grid = document.querySelector('[data-bees]');
  if (!grid) return;
  var bees = Array.prototype.slice.call(grid.children);
  var search = document.querySelector('[data-bee-search]');
  var count = document.querySelector('[data-bee-count]');
  var empty = document.querySelector('[data-bee-empty]');
  var state = { rarity: 'all', color: 'all' };

  function apply() {
    var q = norm(search.value), shown = 0;
    bees.forEach(function (b) {
      var ok = (state.rarity === 'all' || b.dataset.rarity === state.rarity) &&
               (state.color === 'all' || b.dataset.color === state.color) &&
               (!q || norm(b.textContent).indexOf(q) !== -1);
      b.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = 'Показано: ' + shown + ' з ' + bees.length;
    empty.hidden = shown > 0;
  }
  document.querySelectorAll('[data-group]').forEach(function (row) {
    var buttons = row.querySelectorAll('.chip-btn');
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.classList.toggle('active', x === b); });
        state[row.dataset.group] = b.dataset.val;
        apply();
      });
    });
  });
  search.addEventListener('input', apply);
  apply();
})();

// Таблиці в записах: обгортка, сортування за кліком на заголовок, пошук для великих таблиць
(function () {
  document.querySelectorAll('.prose table').forEach(function (table) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);

    var tbody = table.tBodies[0];
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.rows);

    if (rows.length > 8) {
      var tools = document.createElement('div');
      tools.className = 'table-tools';
      tools.innerHTML = '<label class="search"><svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Пошук у таблиці…"></label>';
      wrap.parentNode.insertBefore(tools, wrap);
      tools.querySelector('input').addEventListener('input', function (e) {
        var q = norm(e.target.value);
        rows.forEach(function (r) { r.hidden = q && norm(r.textContent).indexOf(q) === -1; });
      });
    }

    var heads = table.tHead ? table.tHead.rows[0].cells : [];
    Array.prototype.forEach.call(heads, function (th, i) {
      th.setAttribute('data-sort', '');
      th.addEventListener('click', function () {
        var dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        Array.prototype.forEach.call(heads, function (h) { h.removeAttribute('data-dir'); });
        th.dataset.dir = dir;
        rows.sort(function (a, b) {
          var x = a.cells[i].textContent.trim(), y = b.cells[i].textContent.trim();
          var nx = parseFloat(x.replace(/[^\d.,-]/g, '').replace(',', '.')), ny = parseFloat(y.replace(/[^\d.,-]/g, '').replace(',', '.'));
          var cmp = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y, 'uk');
          return dir === 'asc' ? cmp : -cmp;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  });
})();

// Галерея: перегляд на весь екран
(function () {
  var lb = document.querySelector('[data-lightbox]');
  if (!lb) return;
  var img = lb.querySelector('img'), link = lb.querySelector('a');
  document.querySelectorAll('.g-item').forEach(function (f) {
    f.addEventListener('click', function () {
      img.src = link.href = f.dataset.full;
      lb.hidden = false;
    });
  });
  lb.addEventListener('click', function (e) { if (e.target !== link) lb.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.hidden = true; });
})();
