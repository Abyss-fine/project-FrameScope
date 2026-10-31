

export function createSearchCombobox({name:kind,label,placeholder,loadOptions,allowManual=false,optionHint=()=>'',onChange}) {
  const element=document.createElement('div');
  element.className='col-12 col-sm-6 col-xl-4 hardware-field';
  const listId=`${kind}-suggestions`,statusId=`${kind}-choice-status`;
  element.innerHTML=`<label class="form-label" for="pc-${kind}">${label}</label>
    <div class="hardware-combobox"><div class="combobox-input-wrap">
      <input id="pc-${kind}" name="${kind}" class="form-control" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" aria-describedby="${statusId}" autocomplete="off" maxlength="120" minlength="2" required>
      <button class="combobox-clear" type="button" aria-label="Очистить ${label.toLowerCase()}" hidden>×</button>
    </div><ul id="${listId}" role="listbox" class="hardware-suggestions" aria-label="Подсказки: ${label}" hidden></ul></div>
    <p class="visually-hidden hardware-choice-status" id="${statusId}" role="status"></p>`;
  const input=element.querySelector('input'),list=element.querySelector('ul'),status=element.querySelector('[role=status]'),clearButton=element.querySelector('button');
  input.placeholder=placeholder;
  let selected=null,options=[],active=-1,timer,revision=0,controller,touching=false,touchStart,lastTouchSelection=0;

  function close() {
    list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;
  }
  function positionList(){
    if(list.hidden||!element.isConnected)return;
    const rect=input.getBoundingClientRect(),viewport=window.visualViewport;
    const top=viewport?.offsetTop??0,bottom=top+(viewport?.height??innerHeight);
    const below=bottom-rect.bottom-12,above=rect.top-top-12;
    const upward=below<200&&above>below;
    list.style.top=upward?'auto':'calc(100% + 5px)';
    list.style.bottom=upward?'calc(100% + 5px)':'auto';
    list.style.maxHeight=Math.max(80,Math.min(270,upward?above:below))+'px';
  }
  function setActive(index) {
    active=index;
    [...list.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));
    if(active>=0){input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}
  }
  function describe() {
    clearButton.hidden=!input.value;
    input.dataset.choiceId=selected?String(selected.id):'';
    input.dataset.hardwareId=input.dataset.choiceId;
    input.setCustomValidity(!allowManual&&!selected?'Выбери игру из подсказок.':'');
    clearButton.hidden=!input.value||input.readOnly;
    status.textContent=selected?'Выбрано: '+(selected.model??selected.title):input.value.trim()?(allowManual?'Название введено вручную.':'Выбери игру из подсказок.'):'';

  }
  function setSelection(item,{notify=true}={}) {
    revision++;controller?.abort();clearTimeout(timer);
    selected=item;input.value=item?.model??item?.title??'';close();describe();
    if(notify)onChange();
  }
  function choose(index) {
    const item=options[index];
    if(!item)return;
    if(item.manual){selected=null;input.value=input.value.trim();close();describe();onChange();}
    else setSelection(item);
    input.focus();
  }
  async function search() {
    const token=++revision;controller?.abort();controller=new AbortController();
    if(input.readOnly)return;
    const query=input.value.trim();status.textContent='Поиск…';
    try {
      const result=await loadOptions(query,controller.signal);
      if(token!==revision||document.activeElement!==input)return;
      options=[...result.items];if(allowManual&&query.length>=2)options.push({manual:true});
      list.replaceChildren();active=-1;input.removeAttribute('aria-activedescendant');
      options.forEach((item,index)=>{
        const option=document.createElement('li');
        option.id=`${kind}-option-${index}`;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
        option.dataset.modelId=item.manual?'manual':String(item.id);
        const title=document.createElement('span');title.textContent=item.manual?`Использовать «${query}» вручную`:item.model??item.title;
        const hint=document.createElement('small');hint.textContent=item.manual?'':optionHint(item);
        option.append(title);if(hint.textContent)option.append(hint);
        option.addEventListener('pointerdown',event=>{
          if(event.pointerType==='touch'){touching=true;touchStart={x:event.clientX,y:event.clientY};}
          else event.preventDefault();
        });
        option.addEventListener('pointerup',event=>{
          if(event.pointerType!=='touch')return;
          touching=false;
          if(touchStart&&Math.hypot(event.clientX-touchStart.x,event.clientY-touchStart.y)<12){
            event.preventDefault();lastTouchSelection=Date.now();choose(index);
          }else input.focus({preventScroll:true});
        });
        option.addEventListener('pointercancel',()=>{touching=false;input.focus({preventScroll:true});});
        option.addEventListener('click',()=>{if(Date.now()-lastTouchSelection>600)choose(index);});list.append(option);
      });
      if(!options.length&&!allowManual){const empty=document.createElement('li');empty.setAttribute('role','presentation');empty.textContent='Игры не найдены';list.append(empty);}
      list.hidden=!list.children.length;input.setAttribute('aria-expanded',String(!list.hidden));
      positionList();
      status.textContent=result.items.length?`Вариантов: ${result.items.length}. Стрелки — перемещение, Enter — выбор.`:allowManual?'Совпадений нет; можно оставить название вручную.':'Игра не найдена. Попробуй другое название.';
    }catch(error){if(token===revision&&error.name!=='AbortError'){close();options=[];status.textContent='Не удалось загрузить подсказки. '+error.message;
      if(!allowManual){list.replaceChildren();const notice=document.createElement('li');notice.className='combobox-error';notice.textContent='Не удалось загрузить игры. Повтори поиск.';list.append(notice);list.hidden=false;input.setAttribute('aria-expanded','true');positionList();}}}
  }
  input.addEventListener('input',()=>{
    selected=null;revision++;controller?.abort();clearTimeout(timer);close();describe();onChange();timer=setTimeout(search,180);
  });
  input.addEventListener('focus',()=>{if(list.hidden&&!input.readOnly)search();});
  input.addEventListener('keydown',event=>{
    if(input.readOnly)return;
    if(event.key==='Escape'){event.preventDefault();revision++;controller?.abort();clearTimeout(timer);close();describe();}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      if(list.hidden){search();return;}
      if(options.length)setActive(event.key==='ArrowDown'?(active+1)%options.length:(active<=0?options.length-1:active-1));
    }else if(event.key==='Enter'){
      event.preventDefault();
      if(!list.hidden&&active>=0)choose(active);
      else {revision++;controller?.abort();clearTimeout(timer);close();describe();onChange();}
    }
  });
  input.addEventListener('blur',()=>{revision++;controller?.abort();clearTimeout(timer);setTimeout(()=>{if(document.activeElement!==input&&!touching){close();describe();}},150);});
  clearButton.addEventListener('click',()=>{setSelection(null);input.focus();});
  window.visualViewport?.addEventListener('resize',positionList);
  window.addEventListener('scroll',positionList,{passive:true});
  describe();
  return {element,input,setSelection,getValue:()=>selected?{id:selected.id,name:selected.model??selected.title,slug:selected.slug,formFactor:selected.form_factor}:{id:null,name:input.value.trim()}};
}
