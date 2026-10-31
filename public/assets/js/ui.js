// Общие шапка и подвал: редактируются один раз для всех трёх страниц.
export function mountLayout(activePage) {
  const navigation = [
    ['home', 'index.html', 'Главная'],
    ['catalog', 'catalog.html', 'Каталог игр'],
    ['fps', 'index.html#check-fps', 'Проверка FPS'],
    ['about', 'index.html#about', 'О проекте']
  ];
  document.querySelector('[data-site-header]').innerHTML = `
    <nav class="navbar navbar-expand-lg" aria-label="Основная навигация">
      <div class="container site-container">
        <a class="navbar-brand brand" href="index.html" aria-label="FrameScope — главная">
          <span class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i></span>
          FRAME<span>SCOPE</span>
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#main-navigation"
          aria-controls="main-navigation" aria-expanded="false" aria-label="Открыть или закрыть меню">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="main-navigation">
          <ul class="navbar-nav mx-auto">
            ${navigation.map(([id, href, title]) => `<li class="nav-item"><a class="nav-link ${activePage === id ? 'active' : ''}"
              ${activePage === id ? 'aria-current="page"' : ''} href="${href}">${title}</a></li>`).join('')}
          </ul>
          <a class="companion-link" href="index.html#companion">Companion <span class="status-label">В разработке</span></a>
        </div>
      </div>
    </nav>`;
  document.querySelector('[data-site-footer]').innerHTML = `
    <div class="container site-container">
      <div class="footer-top">
        <div><a class="brand footer-brand" href="index.html">FRAME<span>SCOPE</span></a>
          <p>Твои игры. Твоя конфигурация. Больше ясности.</p></div>
        <nav aria-label="Навигация в подвале">
          <a href="catalog.html">Каталог игр</a><a href="index.html#check-fps">Проверка FPS</a><a href="index.html#about">О проекте</a>
        </nav>
      </div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} FrameScope</span>
        <span>Учебный проект · Первая версия интерфейса</span></div>
      <p class="data-attribution">Данные: <a href="https://pcgamebenchmarks.com" target="_blank" rel="noopener noreferrer">PCGameBenchmarks</a> · <a href="https://opengpubenchmarks.com" target="_blank" rel="noopener noreferrer">Open GPU Benchmarks</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Нормализовано для FrameScope; авторы источников не заявляют поддержку проекта.</p>
    </div>`;
}

export function createGameCard(game) {
  const column = document.createElement('div');
  column.className = 'col-12 col-sm-6 col-lg-4';
  const article = document.createElement('article');
  article.className = 'card game-card h-100';
  // Структура статична, содержимое вставляем через textContent, а не HTML.
  article.innerHTML = `
    <div class="game-art"><img class="card-img-top" loading="lazy" width="640" height="360" alt="">
      <span class="art-label">Авторская заглушка</span><span class="art-number" aria-hidden="true"></span></div>
    <div class="card-body"><p class="game-genre"></p><h3 class="card-title"></h3>
      <a class="game-detail-link">Подробнее <span aria-hidden="true">↗</span></a></div>`;
  article.querySelector('img').src = game.image;
  article.querySelector('.art-number').textContent = game.number;
  article.querySelector('.game-genre').textContent = game.genre;
  article.querySelector('h3').textContent = game.title;
  const link = article.querySelector('a');
  link.href = `game.html?id=${encodeURIComponent(game.slug ?? game.id)}`;
  link.setAttribute('aria-label', `Подробнее об игре ${game.title}`);
  column.append(article);
  return column;
}

export function renderGameCards(container, games) {
  container.replaceChildren(...games.map(createGameCard));
}
