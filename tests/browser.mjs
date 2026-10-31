// Не нужен для запуска сайта. Необязательная проверка установленным Chrome (Node.js 24).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { openDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';

const chromePath=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert.ok(existsSync(chromePath),'Для этой необязательной проверки укажи установленный Chrome через CHROME_PATH.');
const db=openDatabase();
const measured=db.prepare("SELECT * FROM benchmarks WHERE data_type='measured' AND cpu_id IS NOT NULL AND ram_gb IS NOT NULL ORDER BY id LIMIT 1").get();
const model=db.prepare("SELECT * FROM benchmarks WHERE data_type='estimated' AND game_id=2 AND gpu_id=(SELECT id FROM graphics_cards WHERE model=?) ORDER BY id LIMIT 1").get('NVIDIA GeForce RTX 4070');
assert.ok(measured&&model,'Сначала выполни npm run import.');
const app=createApp(db);
let delayEstimate=false;
const server=createServer((request,response)=>{
  // Для проверки устаревшего ответа задерживаем настоящий обработчик; данные по-прежнему из SQLite.
  if(delayEstimate&&request.url==='/api/benchmarks/estimate')setTimeout(()=>app(request,response),250);
  else app(request,response);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(tmpdir(),'framescope-browser-'));
const artifacts=resolve('test-artifacts');await mkdir(artifacts,{recursive:true});
const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[];let socket,checks=0;
const check=(message,value=true)=>{assert.ok(value,message);checks++;console.log('PASS '+message);};
try {
  const debugUrl=await new Promise((resolve,reject)=>{
    let log='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),20000);
    chrome.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    chrome.once('error',reject);
  });
  const http=debugUrl.replace('ws:','http:').split('/devtools/')[0];
  const pages=await fetch(http+'/json/list').then(response=>response.json());
  socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);await once(socket,'open');
  let id=0;const pending=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(message.params.exceptionDetails));
    else if(message.method==='Network.responseReceived'){
      const {url,status}=message.params.response;
      if(url.startsWith(base)&&status>=400&&!url.includes('/api/benchmarks/estimate')&&!url.includes('/api/games/'))errors.push(`${status}: ${url}`);
    }
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{const current=++id;pending.set(current,{resolve,reject});socket.send(JSON.stringify({id:current,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=async expression=>{for(let attempt=0;attempt<240;attempt++){try{if(await evaluate(expression))return;}catch{}await sleep(50);}throw Error('Timeout: '+expression);};
  const go=async(path,ready)=>{await call('Page.navigate',{url:base+'/'+path});await waitFor('location.href==='+JSON.stringify(base+'/'+path)+' && document.readyState==="complete" && document.querySelector("[data-site-header] .navbar") && ('+ready+')');};
  const resize=width=>call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  const keyCodes={ArrowDown:40,ArrowUp:38,Enter:13,Escape:27};
  const press=async key=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:keyCodes[key],nativeVirtualKeyCode:keyCodes[key]});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:keyCodes[key],nativeVirtualKeyCode:keyCodes[key]});};
  const typeChoice=async(name,text)=>{
    await evaluate(`(()=>{const input=document.querySelector('[name="${name}"]');input.scrollIntoView({block:'center',behavior:'instant'});input.focus({preventScroll:true});input.value='';})()`);
    await call('Input.insertText',{text});
    await waitFor(`document.querySelector('[name="${name}"]').getAttribute('aria-expanded')==='true'`);
  };
  const selectChoice=async(name,id)=>{
    const table=name==='game'?'games':name==='gpu'?'graphics_cards':'processors';
    const item=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(id);
    await typeChoice(name,item.model??item.name);
    await waitFor(`document.querySelector('#${name}-suggestions [data-model-id="${id}"]')`);
    await evaluate(`document.querySelector('#${name}-suggestions [data-model-id="${id}"]').click()`);
    await waitFor(`document.querySelector('[name="${name}"]').dataset.choiceId==='${id}'`);
  };
  const change=async(name,value)=>evaluate(`(()=>{const field=document.querySelector('[name="${name}"]');field.value=${JSON.stringify(String(value))};field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const ready=()=>waitFor('!document.querySelector("[type=submit]").disabled');
  const setForm=async row=>{
    await selectChoice('game',row.game_id);await selectChoice('cpu',row.cpu_id??1);await selectChoice('gpu',row.gpu_id);await ready();
    await change('ram',row.ram_gb??32);await change('resolution',row.resolution_width+'x'+row.resolution_height);await change('preset',row.graphics_preset);
  };
  const submit=async()=>{await evaluate('document.querySelector("form").requestSubmit()');await waitFor('!document.querySelector("[type=submit]").disabled');};
  const fps=async()=>Number((await evaluate('document.querySelector(".metric strong").firstChild.textContent')).replace('≈','').trim().replace(',','.'));

  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await resize(1440);
  await go('index.html','document.querySelector("form") && document.querySelectorAll(".game-card").length===6');
  check('CPU, GPU и игра — три доступных комбобокса',await evaluate('document.querySelectorAll("input[role=combobox]").length===3'));
  check('для игры ровно одно поле, без соседнего select/поиска',await evaluate('document.querySelectorAll("[name=game]").length===1 && !document.querySelector("select[name=game]") && !document.querySelector(".fields input[type=search]")'));
  check('служебные подписи спрятаны, техническая панель удалена',await evaluate('!document.querySelector(".availability-options") && !document.querySelector(".hardware-choice-status:not(.visually-hidden)") && !document.querySelector(".form-actions .form-note")'));
  check('нет псевдографика и поля версии',await evaluate('!document.querySelector(".chart-empty") && !document.querySelector("[name=gameVersion]")'));
  check('неиспользуемые дополнительные параметры скрыты',await evaluate('document.querySelector(".graphics-options").hidden'));
  await evaluate('document.querySelector("form").requestSubmit()');check('пустая форма отклонена',await evaluate('!document.querySelector(".form-error").hidden'));
  const resonant=db.prepare('SELECT id FROM games WHERE name=?').get('Control Resonant');
  await typeChoice('game','Control Resonant');await press('ArrowDown');await press('Enter');
  check('игра за пределами исходных десяти выбирается одним полем',await evaluate('document.querySelector("[name=game]").dataset.choiceId==='+JSON.stringify(String(resonant.id))));
  await evaluate('document.querySelector(".hardware-field:has([name=game]) .combobox-clear").click()');
  await typeChoice('game','FrameScope Missing Game XYZ');await press('Escape');
  check('произвольный текст не подменяет выбранную игру',await evaluate('!document.querySelector("[name=game]").checkValidity() && document.querySelector("[name=game]").dataset.choiceId===""'));

  await typeChoice('gpu','RTX 4070');
  check('4070 и SUPER представлены отдельно',await evaluate('[...document.querySelectorAll("#gpu-suggestions [role=option]")].some(node=>node.textContent.includes("SUPER"))'));
  await press('ArrowDown');check('ArrowDown управляет активной подсказкой',await evaluate('!!document.querySelector("[name=gpu]").getAttribute("aria-activedescendant")'));
  await press('ArrowUp');check('ArrowUp поддерживается',await evaluate('document.querySelector("#gpu-suggestions li:last-child").getAttribute("aria-selected")==="true"'));
  await press('Escape');check('Escape закрывает подсказки',await evaluate('document.querySelector("[name=gpu]").getAttribute("aria-expanded")==="false"'));
  await typeChoice('gpu','RTX 4070 SUPER');const superId=await evaluate('Number(document.querySelector("#gpu-suggestions [data-model-id]").dataset.modelId)');
  await press('ArrowDown');await press('Enter');check('Enter выбирает отдельный ID SUPER',superId!==model.gpu_id&&await evaluate('document.querySelector("[name=gpu]").dataset.choiceId==='+JSON.stringify(String(superId))));
  await evaluate('document.querySelector(".hardware-field:has([name=gpu]) .combobox-clear").click()');check('GPU очищается',await evaluate('document.querySelector("[name=gpu]").value===""'));

  await setForm(model);await submit();
  check('оценка исходного датасета помечена estimated',await evaluate('document.querySelector("[data-result-state]").textContent==="Ориентировочный прогноз"'));
  check('FPS округлён и помечен приблизительным',await fps()===170 && await evaluate('document.querySelector(".metric strong").textContent.includes("≈")'));
  check('условная уверенность и источник видны',await evaluate('document.querySelector("[data-result-summary]").textContent.includes("Средняя") && document.querySelector(".result-source").href.includes("pcgamebenchmarks.com")'));
  await evaluate('document.activeElement?.blur()');await sleep(200);check('потеря фокуса не сбрасывает результат',await fps()===170);
  await change('resolution','2560x1440');await submit();
  check('для 1440p получен прогноз вместо отказа',await fps()===125);
  check('коэффициент и низкая уверенность показаны явно',await evaluate('document.querySelector("[data-result-summary]").textContent.includes("0.72") && document.querySelector("[data-result-summary]").textContent.includes("Низкая")'));
  check('1% Low, CPU/GPU usage не выдуманы',await evaluate('[...document.querySelectorAll(".metric strong")].slice(1).every(node=>node.textContent.includes("—"))'));
  await change('preset','medium');await submit();check('учитывается изменение пресета',await fps()===140);
  await selectChoice('game',1);await ready();await change('preset','high');
  check('DLSS/RT/FG без полной основы не навязываются',await evaluate('document.querySelector(".graphics-options").hidden && [...document.querySelectorAll(".graphics-options select")].every(select=>!select.options.length || select.value==="off")'));
  const unsupported={gameId:1,cpuId:1,gpuId:model.gpu_id,ramGb:32,resolution:'2560x1440',graphicsPreset:'high',rayTracingMode:'off',upscalingTechnology:'dlss',upscalingQuality:'quality',frameGenerationMode:'off'};
  const missingTechnology=await fetch(base+'/api/benchmarks/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(unsupported)});
  check('для DLSS без основы нет произвольного бонуса FPS',missingTechnology.status===404);
  const legacy={gameId:measured.game_id,cpuId:measured.cpu_id,gpuId:measured.gpu_id,ramGb:measured.ram_gb,resolution:measured.resolution_width+'x'+measured.resolution_height,graphicsPreset:measured.graphics_preset,rayTracingMode:measured.ray_tracing_mode??'unknown',upscalingMode:measured.upscaling_mode??'unknown',frameGenerationMode:measured.frame_generation_mode??'unknown'};
  const measuredAnswer=await fetch(base+'/api/benchmarks/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(legacy)}).then(response=>response.json());
  check('реальное измерение сохраняет тип и исходный FPS',measuredAnswer.resultType==='measured'&&measuredAnswer.averageFps===measured.average_fps);
  await evaluate(`import('./assets/js/components/results.js').then(module=>module.showResult(${JSON.stringify(measuredAnswer)}))`);
  check('компонент результатов отличает измерение от прогноза',await evaluate('document.querySelector("[data-result-state]").textContent==="Реальный бенчмарк" && !document.querySelector(".metric strong").textContent.includes("≈")'));

  await setForm(model);const hardwareBefore=db.prepare('SELECT (SELECT count(*) FROM processors)+(SELECT count(*) FROM graphics_cards) n').get().n;
  await typeChoice('gpu','FrameScope Nonexistent GPU 99999');await press('Escape');await submit();
  check('полное отсутствие данных объясняется без FPS другой модели',await evaluate('document.querySelector("[data-result-state]").textContent==="Недостаточно данных" && document.querySelector("[data-result-message]").textContent.includes("даже для ориентировочного") && document.querySelector(".metric strong").textContent.includes("—")'));
  await selectChoice('gpu',model.gpu_id);await ready();await typeChoice('cpu','FrameScope Unknown CPU');await press('Escape');await submit();
  check('ручной CPU не подменяется известным',await evaluate('document.querySelector("[data-result-state]").textContent==="Недостаточно данных"'));
  check('ручные названия не добавлены в базу',hardwareBefore===db.prepare('SELECT (SELECT count(*) FROM processors)+(SELECT count(*) FROM graphics_cards) n').get().n);
  await setForm(model);delayEstimate=true;await evaluate('document.querySelector("form").requestSubmit()');await waitFor('document.querySelector("[type=submit]").disabled');await change('ram',16);await sleep(500);delayEstimate=false;
  check('устаревший ответ не отображается',await evaluate('document.querySelector("[data-result-state]").textContent==="Ожидает расчёта"'));
  check('преимущества описывают текущие и будущие функции',await evaluate('[...document.querySelectorAll(".benefit-card h3")].map(node=>node.textContent).join("|")==="Анализ производительности|FrameScope Companion|Сообщество FrameScope"'));
  await evaluate('document.querySelector("#companion summary").click();document.querySelector("#community summary").click()');check('описания будущих функций раскрываются',await evaluate('document.querySelector("#companion details").open && document.querySelector("#community details").open'));
  await evaluate('document.querySelector("[data-bs-slide=next]").click()');await waitFor('document.querySelectorAll(".carousel-item")[1].classList.contains("active")&&!document.querySelector(".carousel-item-next")');check('карусель сохранена');
  for(const width of [320,375,768,1024,1440,1920]){await resize(width);check('главная без горизонтальной прокрутки '+width,await evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  await resize(375);await evaluate('document.querySelector(".navbar-toggler").click()');await waitFor('document.querySelector(".navbar-collapse").classList.contains("show")');check('мобильное меню работает');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});check('reduced motion сохранён',await evaluate('getComputedStyle(document.documentElement).scrollBehavior==="auto"'));await call('Emulation.setEmulatedMedia',{features:[]});
  await resize(1440);await go('catalog.html','document.querySelectorAll(".game-card").length===24');check('каталог с пагинацией сохранён');
  await evaluate('document.querySelector(".page-main > button").click()');await waitFor('document.querySelectorAll(".game-card").length===48');check('загрузка следующей страницы');
  await evaluate('document.querySelector("#game-search").value="Hogwarts Legacy";document.querySelector("#game-search").dispatchEvent(new Event("input"))');await waitFor('document.querySelectorAll(".game-card").length===1 && document.querySelector(".card-title").textContent==="Hogwarts Legacy"');check('поиск каталога');
  await evaluate('document.querySelector("#genre-filter").value="Гонки";document.querySelector("#genre-filter").dispatchEvent(new Event("change"))');await waitFor('!document.querySelector("[data-empty-catalog]").hidden');check('совместный фильтр и пустое состояние');
  await evaluate('document.querySelector("[data-reset-filters]").click()');await waitFor('document.querySelectorAll(".game-card").length===24');check('сброс фильтров');
  for(const width of [320,375,768,1440]){await resize(width);check('каталог без горизонтальной прокрутки '+width,await evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  const games=db.prepare('SELECT id,slug FROM games WHERE featured=1 ORDER BY id').all();
  for(const game of games){await go('game.html?id='+game.slug,'document.querySelector("form") && document.querySelector("[name=game]").readOnly');check('страница '+game.slug,await evaluate('document.querySelector("[name=game]").dataset.choiceId==='+JSON.stringify(String(game.id))));}
  for(const width of [320,375,768,1440]){await resize(width);check('страница игры без горизонтальной прокрутки '+width,await evaluate('document.documentElement.scrollWidth<=innerWidth'));}
  await go('game.html?id=unknown','!document.querySelector("[data-game-not-found]").hidden');check('неизвестная игра обработана');

  await call('Emulation.setTouchEmulationEnabled',{enabled:true});await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});
  await go('index.html','document.querySelector("form")');
  for(const name of ['gpu','game']){
    const id=name==='gpu'?model.gpu_id:2;
    await typeChoice(name,name==='gpu'?'RTX 4070':'Control');
    const point=await evaluate(`(()=>{const r=document.querySelector('#${name}-suggestions [data-model-id="${id}"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    check('подсказки '+name+' в видимой области',point.y>0&&point.y<900);
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await waitFor(`document.querySelector('[name="${name}"]').dataset.choiceId==='${id}'`);check(name+' выбирается касанием');
  }
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});await resize(1440);await go('index.html','document.querySelector("form")');await setForm(model);await change('resolution','2560x1440');await submit();
  for(const width of [1440,375]){
    await resize(width);await evaluate('document.activeElement?.blur();scrollTo({top:0,behavior:"instant"});Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(()=>{});}))');
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(artifacts,'forecast-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  check('нет ошибок JavaScript и публичных ресурсов',errors.length===0);
  await writeFile(join(artifacts,'browser-report.json'),JSON.stringify({checks,passed:true,errors,measuredBenchmarkId:measured.id,modelBenchmarkId:model.id},null,2));
  console.log('BROWSER CHECKS PASSED: '+checks);
} finally {
  socket?.close();chrome.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();await sleep(500);
  // Проверяем абсолютный путь перед удалением только собственного временного профиля.
  const tempRoot=resolve(tmpdir())+sep;
  if(!resolve(profile).startsWith(tempRoot)||!profile.includes('framescope-browser-'))throw Error('Небезопасный путь профиля');
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:300}).catch(()=>{});
}
