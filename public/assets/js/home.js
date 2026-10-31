import { mountLayout, renderGameCards } from './ui.js';
import { loadGames } from './services/api.js';
import { mountPcForm } from './forms.js';
mountLayout('home');
mountPcForm(document.querySelector('[data-pc-form]'),{selectedGame:new URLSearchParams(location.search).get('game')});
try {
  const games=await loadGames({featured:true,limit:6});
  renderGameCards(document.querySelector('[data-popular-games]'),games.items);
} catch(error) { document.querySelector('[data-popular-games]').textContent=error.message; }
document.querySelector('#hero-carousel').addEventListener('slid.bs.carousel',event=>{
  document.querySelector('[data-slide-announcement]').textContent=`Слайд ${event.to+1} из 3`;
});
