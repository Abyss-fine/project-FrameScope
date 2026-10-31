import { apiRequest, loadGames, loadGame } from './services/api.js';
import { createHardwareCombobox } from './components/hardware-combobox.js';
import { createSearchCombobox } from './components/search-combobox.js';
import { createGraphicsControls } from './components/graphics-controls.js';
import { resetResult, showResult } from './components/results.js';

const presetLabels={low:'Низкое',medium:'Среднее',high:'Высокое',ultra:'Ультра'};
function addSelect(row,name,labelText,options){
  const column=document.createElement('div');column.className='col-12 col-sm-6 col-xl-4';
  const label=document.createElement('label');Object.assign(label,{className:'form-label',htmlFor:'pc-'+name,textContent:labelText});
  const select=document.createElement('select');Object.assign(select,{name,id:label.htmlFor,required:true,className:'form-select'});
  select.add(new Option('Выбери значение',''));options.forEach(([value,title])=>select.add(new Option(title,value)));
  column.append(label,select);row.append(column);return select;
}

export async function mountPcForm(container,{fixedGame=null,selectedGame=null}={}){
  const form=document.createElement('form');form.className='pc-form';
  form.innerHTML=`<div class="row g-3 fields"></div><div data-graphics-controls></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Рассчитать FPS <span aria-hidden="true">→</span></button></div>
    <p class="form-error" role="alert" hidden>Заполни обязательные поля и выбери игру из подсказок.</p>`;
  const row=form.querySelector('.fields'),button=form.querySelector('[type=submit]'),selects={},hardware={};
  let revision=0,controller,lastSettingsKey='';
  const graphics=createGraphicsControls({onChange:invalidate});form.querySelector('[data-graphics-controls]').append(graphics.element);
  for(const[kind,label]of [['cpu','Процессор'],['gpu','Видеокарта']]){
    hardware[kind]=createHardwareCombobox({kind,label,onChange:()=>{invalidate();if(kind==='gpu')refreshSettings();}});row.append(hardware[kind].element);
  }
  selects.ram=addSelect(row,'ram','Оперативная память',[8,16,32,64,128].map(value=>[value,value+' ГБ']));
  const game=createSearchCombobox({name:'game',label:'Игра',placeholder:'Найти игру',onChange:()=>{invalidate();refreshSettings();},
    optionHint:item=>item.genre==='Жанр не указан'?'':item.genre,
    loadOptions:(query,signal)=>loadGames(query?{search:query,limit:25}:{featured:true,limit:10},signal)
  });
  row.append(game.element);
  selects.resolution=addSelect(row,'resolution','Разрешение',[['1920x1080','1920 × 1080 (Full HD)'],['2560x1440','2560 × 1440 (QHD)'],['3840x2160','3840 × 2160 (4K)']]);
  selects.preset=addSelect(row,'preset','Качество графики',Object.entries(presetLabels));

  function invalidate(){revision++;controller?.abort();button.disabled=!graphics.ready;form.querySelector('.form-error').hidden=true;resetResult();}
  async function refreshSettings(){
    const gameId=game.getValue().id,gpuId=hardware.gpu.getValue().id,key=gameId+'/'+gpuId;
    if(key===lastSettingsKey)return;lastSettingsKey=key;
    const data=await graphics.update(gameId,gpuId);
    if(key!==lastSettingsKey||!data)return;
    const previous=selects.preset.value;
    selects.preset.replaceChildren(new Option('Выбери качество',''),...data.presets.map(item=>new Option(item.label,item.value)));
    selects.preset.value=data.presets.some(item=>item.value===previous)?previous:'';
  }
  form.noValidate=true;
  form.addEventListener('change',event=>{if(event.target.closest('.graphics-options')||event.target.matches('input[role=combobox]'))return;invalidate();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!graphics.ready)return;
    const valid=form.checkValidity()&&Boolean(game.getValue().id);form.querySelector('.form-error').hidden=valid;
    if(!valid){form.reportValidity();return;}
    controller?.abort();controller=new AbortController();const token=++revision;
    resetResult('Ищем бенчмарк или основу для прогноза…');document.querySelector('[data-result-state]').textContent='Расчёт';button.disabled=true;
    const payload={gameId:game.getValue().id,ramGb:Number(selects.ram.value),resolution:selects.resolution.value,graphicsPreset:selects.preset.value,...graphics.getValue(),os:'windows'};
    for(const kind of ['cpu','gpu']){const choice=hardware[kind].getValue();if(choice.id)payload[kind+'Id']=choice.id;else payload[kind+'Name']=choice.name;}
    try{
      const result=await apiRequest('/benchmarks/estimate',{method:'POST',body:JSON.stringify(payload),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(token===revision)showResult(result);
    }catch(error){
      if(token!==revision||error.name==='AbortError')return;
      resetResult(error.message);document.querySelector('[data-result-state]').textContent=error.status===404?'Недостаточно данных':'Не удалось рассчитать';
    }finally{if(token===revision)button.disabled=!graphics.ready;}
  });
  container.replaceChildren(form);resetResult();
  if(fixedGame!==null||selectedGame!==null){
    try{
      const initial=await loadGame(fixedGame??selectedGame);
      if(fixedGame!==null)game.input.readOnly=true;
      game.setSelection(initial,{notify:false});
    }catch(error){
      if(fixedGame!==null){form.querySelector('.form-error').textContent=error.message;form.querySelector('.form-error').hidden=false;}
    }
  }
  refreshSettings();
}
