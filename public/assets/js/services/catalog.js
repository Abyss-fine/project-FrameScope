import { games } from '../data/games.js';

// Единая точка доступа к данным: при подключении сервера менять источник нужно здесь.
// Пока функции синхронные. Для будущего fetch потребуется async и обработка загрузки в UI.
export function listGames() {
  return [...games];
}

export function getGame(id) {
  return games.find((game) => game.id === id) ?? null;
}

// Апострофы в Baldur’s / Baldur's и регистр не мешают поиску.
function normalize(text) {
  return text.toLocaleLowerCase('ru').replace(/[’‘']/g, '').trim();
}

export function filterGames(query = '', genre = '') {
  const search = normalize(query);
  return games.filter((game) =>
    normalize(game.title).includes(search) && (!genre || game.genre === genre)
  );
}

export function listGenres() {
  return [...new Set(games.map((game) => game.genre))].sort((a, b) => a.localeCompare(b, 'ru'));
}
