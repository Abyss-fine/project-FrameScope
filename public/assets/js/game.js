import { mountLayout } from './ui.js';
import { loadGame } from './services/api.js';
import { mountPcForm } from './forms.js';

mountLayout('game');
const id = new URLSearchParams(location.search).get('id');
let game;
try { game = id ? await loadGame(id) : null; }
catch (error) {
  if (error.status !== 404) document.querySelector('[data-game-not-found] p:not(.eyebrow)').textContent = error.message;
}
if (!game) {
  // Параметр URL не вставляется в HTML: неизвестный ID получает обычное пустое состояние.
  document.querySelector('[data-game-content]').hidden = true;
  document.querySelector('[data-game-not-found]').hidden = false;
  document.title = 'Игра не найдена — FrameScope';
} else {
  document.querySelector('[data-game-content]').hidden = false;
  document.title = `${game.title} — FrameScope`;
  document.querySelector('[data-game-title]').textContent = game.title;
  document.querySelector('[data-game-breadcrumb]').textContent = game.title;
  document.querySelector('[data-game-genre]').textContent = game.genre;
  document.querySelector('[data-game-description]').textContent = game.description;
  const image = document.querySelector('[data-game-image]');
  image.src = game.image;
  image.alt = `Авторская иллюстрация-заглушка для страницы ${game.title}; не официальная обложка`;
  const source = document.querySelector('[data-game-source]');
  source.href = game.source;
  const release = document.querySelector('[data-game-release]');
  if (game.released) {
    const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(game.released + 'T00:00:00Z'));
    release.textContent = `${game.releaseLabel}: ${date}`;
  } else {
    release.textContent = 'Дата релиза: уточняется для выбранного издания.';
  }
  if (game.edition) document.querySelector('[data-game-edition]').textContent = game.edition;
  mountPcForm(document.querySelector('[data-pc-form]'), { fixedGame: game.id });
}
