// Фільтр і пошук записів
(function () {
  var list = document.querySelector('[data-posts]');
  if (!list) return;
  var cards = Array.prototype.slice.call(list.children);
  var search = document.querySelector('[data-search]');
  var empty = document.querySelector('[data-empty]');
  var current = 'all';

  function apply() {
    var q = (search.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c) {
      var ok = (current === 'all' || c.dataset.cat === current) &&
               (!q || c.textContent.toLowerCase().indexOf(q) !== -1);
      c.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
  }

  document.querySelectorAll('[data-filters] .filter').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-filters] .filter').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      current = b.dataset.cat;
      apply();
    });
  });
  search.addEventListener('input', apply);
})();

// Перегляд картинок у галереї
(function () {
  var lb = document.querySelector('[data-lightbox]');
  if (!lb) return;
  var img = lb.querySelector('img');
  var link = lb.querySelector('a');
  document.querySelectorAll('.g-item').forEach(function (f) {
    f.addEventListener('click', function () {
      img.src = link.href = f.dataset.full;
      lb.hidden = false;
    });
  });
  lb.addEventListener('click', function (e) { if (e.target !== link) lb.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.hidden = true; });
})();
