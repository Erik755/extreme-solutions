(() => {
  const grid = document.querySelector('.projects');
  const cards = [...grid.querySelectorAll('.project')];
  const search = document.querySelector('#project-search');
  const filters = document.querySelector('.project-filters');
  const count = document.querySelector('.filter-count');
  const empty = document.querySelector('.catalog-empty');
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let searchable = new Map(cards.map(card => [card, normalize(card.querySelector('.project-body').textContent)]));
  const params = new URLSearchParams(location.search);
  let category = ['android', 'web', 'tools'].includes(params.get('category')) ? params.get('category') : 'all';
  search.value = (params.get('q') || '').slice(0, 120);
  function render(updateUrl = true) {
    const query = normalize(search.value.trim());
    let visible = 0;
    cards.forEach(card => {
      card.hidden = !(category === 'all' || card.dataset.category === category) || !searchable.get(card).includes(query);
      if (!card.hidden) visible++;
    });
    filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
    count.textContent = window.extremeI18n?.language === 'en'
      ? `${visible} of ${cards.length} projects`
      : `${visible} de ${cards.length} proyectos`;
    empty.hidden = visible !== 0;
    if (updateUrl) {
      const url = new URL(location.href);
      category === 'all' ? url.searchParams.delete('category') : url.searchParams.set('category', category);
      search.value.trim() ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }
  }
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (button) { category = button.dataset.filter; render(); }
  });
  search.addEventListener('input', () => render());
  document.querySelector('#clear-filters').addEventListener('click', () => {
    category = 'all'; search.value = ''; render(); search.focus();
  });
  document.querySelector('.catalog-controls').hidden = false;
  filters.hidden = false;
  count.hidden = false;
  window.addEventListener('extreme:languagechange', () => {
    searchable = new Map(cards.map(card => [card, normalize(card.querySelector('.project-body').textContent)]));
    render(false);
  });
  render(false);
})();
