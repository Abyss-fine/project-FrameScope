import { mountLayout, renderGameCards } from './ui.js';
import { loadGames } from './services/api.js';
mountLayout('catalog');
const search=document.querySelector('#game-search'),genre=document.querySelector('#genre-filter');
const count=document.querySelector('[data-game-count]'),empty=document.querySelector('[data-empty-catalog]'),grid=document.querySelector('[data-catalog-grid]');
const more=document.createElement('button');
Object.assign(more,{type:'button',className:'btn btn-outline-light mt-4',textContent:'Показать ещё',hidden:true});
grid.after(more);
let items=[],requestId=0,controller,timer;
async function updateCatalog(append=false) {
  clearTimeout(timer);
  const token=++requestId;
  controller?.abort();controller=new AbortController();
  const offset=append?items.length:0;
  more.disabled=true;empty.hidden=true;count.textContent='Загрузка каталога…';
  try {
    const result=await loadGames({search:search.value,genre:genre.value,limit:24,offset},controller.signal);
    if(token!==requestId)return;
    items=append?[...items,...result.items]:result.items;
    renderGameCards(grid,items);
    if(genre.options.length===1)result.genres.forEach(title=>genre.add(new Option(title,title)));
    count.textContent=`Найдено игр: ${result.total}. Показано: ${items.length}`;
    document.querySelector('.catalog-meta > span').textContent='Каталог из SQLite';
    empty.hidden=result.total>0;more.hidden=items.length>=result.total;more.textContent='Показать ещё';
  } catch(error) {
    if(token!==requestId||error.name==='AbortError')return;
    count.textContent=error.message;more.hidden=false;more.textContent='Повторить загрузку';
  } finally { if(token===requestId)more.disabled=false; }
}
search.addEventListener('input',()=>{
  controller?.abort();requestId++;clearTimeout(timer);timer=setTimeout(()=>updateCatalog(),200);
});
genre.addEventListener('change',()=>updateCatalog());
more.addEventListener('click',()=>updateCatalog(more.textContent!=='Повторить загрузку'));
document.querySelector('[data-reset-filters]').addEventListener('click',()=>{search.value='';genre.value='';updateCatalog();search.focus();});
updateCatalog();
