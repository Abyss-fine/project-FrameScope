// Локальные данные. Описания написаны для проекта; изображения — оригинальные заглушки.
// Даты заполняем только при однозначно проверенной версии релиза (см. DATA_SOURCES.md).
export const games = [
  { id: 'cyberpunk-2077', title: 'Cyberpunk 2077', genre: 'Ролевая игра', description: 'Ролевая игра в открытом мире Найт-Сити, где наёмник Ви ищет своё место среди корпораций и уличных группировок.', source: 'https://store.steampowered.com/app/1091500/' },
  { id: 'control', title: 'Control', genre: 'Экшен', description: 'Сверхъестественный экшен от третьего лица. Исследуй изменяющееся здание Федерального бюро контроля и используй паранормальные способности.', source: 'https://legacy.controlgame.com/' },
  { id: 'alan-wake-2', title: 'Alan Wake 2', genre: 'Хоррор', description: 'Хоррор на выживание с двумя героями: писателем Аланом Уэйком и агентом ФБР Сагой Андерсон. Две истории связывают расследование и тёмная реальность.', source: 'https://www.alanwake.com/' },
  { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2', genre: 'Приключение', description: 'Приключение в открытом мире об Артуре Моргане и банде Ван дер Линде на исходе эпохи Дикого Запада.', source: 'https://www.rockstargames.com/reddeadredemption2/' },
  { id: 'grand-theft-auto-v', title: 'Grand Theft Auto V', genre: 'Экшен', description: 'История трёх героев в Лос-Сантосе и его окрестностях. Открытый мир объединяет сюжетные задания, вождение и ограбления.', edition: 'Издание для расчёта будет уточняться: Legacy и Enhanced требуют разных тестов.', source: 'https://www.rockstargames.com/gta-v' },
  { id: 'hogwarts-legacy', title: 'Hogwarts Legacy', genre: 'Ролевая игра', description: 'Ролевая игра в открытом мире волшебников. Создай своего персонажа, исследуй Хогвартс и его окрестности, изучай заклинания.', released: '2023-02-10', releaseLabel: 'Релиз ПК-версии', source: 'https://store.steampowered.com/app/990080/' },
  { id: 'baldurs-gate-3', title: "Baldur’s Gate 3", genre: 'Ролевая игра', description: 'Партийная ролевая игра во вселенной Dungeons & Dragons. Собери отряд, принимай решения и участвуй в пошаговых сражениях.', released: '2023-08-03', releaseLabel: 'Полный релиз ПК-версии', source: 'https://store.steampowered.com/app/1086940/' },
  { id: 'elden-ring', title: 'Elden Ring', genre: 'Ролевая игра', description: 'Ролевая игра с открытым миром и сражениями от FromSoftware. Путешествуй по Междуземью, исследуй подземелья и побеждай могущественных противников.', source: 'https://store.steampowered.com/app/1245620/' },
  { id: 'forza-horizon-5', title: 'Forza Horizon 5', genre: 'Гонки', description: 'Гоночная игра с открытым миром в Мексике. Участвуй в фестивале Horizon, собирай автомобили и исследуй разнообразные маршруты.', source: 'https://store.steampowered.com/app/1551360/' },
  { id: 'counter-strike-2', title: 'Counter-Strike 2', genre: 'Шутер', description: 'Командный тактический шутер от Valve. Соревнуйся в раундах, где важны точность, экономика команды и взаимодействие игроков.', source: 'https://store.steampowered.com/app/730/' }
].map((game, index) => ({
  ...game,
  image: `assets/images/games/${game.id}.svg`,
  number: String(index + 1).padStart(2, '0')
}));
