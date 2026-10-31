import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { listGames, getGame, filterGames, listGenres } from '../public/assets/js/services/catalog.js';

test('каждая игра открывается по уникальному ID и имеет локальную иллюстрацию', () => {
  const games = listGames();
  assert.equal(games.length, 10);
  assert.equal(new Set(games.map((game) => game.id)).size, 10);
  for (const game of games) {
    assert.match(game.id, /^[a-z0-9-]+$/);
    assert.equal(getGame(game.id), game);
    assert.ok(existsSync(new URL('../public/' + game.image, import.meta.url)));
    assert.match(game.source, /^https:\/\//);
    assert.ok(game.description.length > 30);
  }
});

test('поиск учитывает регистр, пробелы и разные апострофы', () => {
  assert.deepEqual(filterGames('  CONTROL ').map((game) => game.id), ['control']);
  assert.deepEqual(filterGames("baldur's").map((game) => game.id), ['baldurs-gate-3']);
  assert.equal(filterGames('неизвестная игра').length, 0);
});

test('поиск и фильтр применяются вместе, пустой запрос возвращает все игры', () => {
  assert.equal(filterGames().length, 10);
  assert.equal(filterGames('Control', 'Гонки').length, 0);
  assert.equal(filterGames('', 'Гонки')[0].id, 'forza-horizon-5');
  for (const genre of listGenres()) {
    assert.ok(filterGames('', genre).every((game) => game.genre === genre));
  }
});

test('отсутствующий и вредоносный ID не выбирает игру', () => {
  for (const id of [null, undefined, '', 'unknown', '<script>alert(1)</script>', '__proto__']) {
    assert.equal(getGame(id), null);
  }
});

test('копия списка не позволяет случайно удалить игру из источника', () => {
  const copy = listGames();
  copy.pop();
  assert.equal(listGames().length, 10);
});

test('локальные ссылки HTML, стили, скрипты и Bootstrap существуют', () => {
  for (const name of ['index.html', 'catalog.html', 'game.html']) {
    const html = readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');
    for (const [, path] of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
      if (/^(https?:|mailto:)/.test(path)) continue;
      assert.ok(existsSync(new URL('../public/' + path, import.meta.url)), name + ': ' + path);
    }
  }
});
