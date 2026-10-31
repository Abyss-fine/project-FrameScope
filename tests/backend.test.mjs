import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from '../src/db/database.js';
import { seedDatabase, ensureHardware } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { insertBenchmark, importPcDataset, importOpenGpu, referenceGpus } from '../src/services/importers.js';
import { apiRequest } from '../public/assets/js/services/api.js';

// Только тестовые числа. Они создаются в :memory: и никогда не импортируются в data/framescope.sqlite.
function testSource(db,type) {
  db.prepare('INSERT OR IGNORE INTO benchmark_sources(name,url,license,dataset_version,data_type) VALUES (?,?,?,?,?)')
    .run('TEST FIXTURE '+type,'https://example.com/tests','TEST ONLY','fixture',type);
  return db.prepare('SELECT id FROM benchmark_sources WHERE name=?').get('TEST FIXTURE '+type).id;
}
function ids(db) {
  return {gameId:1,cpuId:1,gpuId:db.prepare("SELECT id FROM graphics_cards WHERE model='NVIDIA GeForce RTX 4070'").get().id};
}
function add(db,type,overrides={}) {
  const keys=ids(db);
  return insertBenchmark(db,{game_id:keys.gameId,gpu_id:keys.gpuId,cpu_id:type==='measured'?keys.cpuId:null,
    ram_gb:type==='measured'?32:null,resolution_width:1920,resolution_height:1080,graphics_preset:'high',
    ray_tracing_mode:'off',upscaling_mode:'off',frame_generation_mode:'off',average_fps:type==='measured'?120:100,
    source_id:testSource(db,type),data_type:type,external_key:type,source_url:'https://example.com/tests',os:type==='measured'?'windows':null,...overrides});
}
const payload=db=>({...ids(db),ramGb:32,resolution:'1920x1080',graphicsPreset:'high',rayTracingMode:'off',upscalingMode:'off',frameGenerationMode:'off'});

async function fixture(t) {
  const db=openDatabase(':memory:');seedDatabase(db);
  const server=createApp(db).listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();});
  const request=async(path,body)=>{
    const response=await fetch(base+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  return {db,base,request};
}

test('health, статика и недоступность приватных файлов',async t=>{
  const {request,base}=await fixture(t);
  assert.equal((await request('/api/health')).body.status,'ok');
  const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/FrameScope/);
  for(const path of ['/data/framescope.sqlite','/.env','/src/app.js','/package.json','/README.md']) assert.equal((await fetch(base+path)).status,404);
});

test('каталог SQLite: поиск, фильтр, пагинация, старые slug',async t=>{
  const {request}=await fixture(t);
  const all=await request('/api/games?limit=2');assert.equal(all.body.total,10);assert.equal(all.body.items.length,2);
  assert.equal((await request('/api/games?search=%20CONTROL%20')).body.items[0].slug,'control');
  assert.equal((await request('/api/games?genre='+encodeURIComponent('Гонки'))).body.total,1);
  assert.equal((await request('/api/games?search='+encodeURIComponent("' OR 1=1 --"))).body.total,0);
  assert.equal((await request('/api/games/control')).body.title,'Control');
  assert.equal((await request('/api/games/unknown')).status,404);
  assert.equal((await request('/api/games?limit=-1')).status,400);
  assert.equal((await request('/api/games?search[a]=x')).status,400);
});

test('списки CPU и GPU поступают с сервера',async t=>{
  const {request}=await fixture(t);
  const gpus=await request('/api/hardware/gpus');assert.equal(gpus.status,200);assert.ok(gpus.body.items.some(item=>item.model.includes('4070')));
  assert.equal((await request('/api/hardware/cpus')).body.items.length,6);
});

test('точный замер имеет приоритет перед модельной оценкой',async t=>{
  const {db,request}=await fixture(t);add(db,'estimated');add(db,'measured',{one_percent_low:75,gpu_usage:94,cpu_usage:42});
  const result=await request('/api/benchmarks/estimate',payload(db));
  assert.equal(result.status,200);assert.equal(result.body.dataType,'measured');assert.equal(result.body.averageFps,120);
  assert.equal(result.body.onePercentLow,75);assert.equal(result.body.cpuConsidered,true);assert.equal(result.body.ramConsidered,true);
  assert.equal(result.body.timeSeries,null);assert.match(result.body.source.name,/TEST FIXTURE/);
});

test('оценка не приписывает влияние CPU/RAM и не заполняет неизвестные метрики',async t=>{
  const {db,request}=await fixture(t);add(db,'estimated');
  const result=await request('/api/benchmarks/estimate',{...payload(db),cpuId:2,ramGb:8});
  assert.equal(result.body.dataType,'estimated');assert.equal(result.body.averageFps,100);
  assert.equal(result.body.cpuConsidered,false);assert.equal(result.body.ramConsidered,false);
  for(const key of ['onePercentLow','gpuUsage','cpuUsage','timeSeries'])assert.equal(result.body[key],null);
});

test('нет совпадения: возвращаем альтернативы без подмены разрешения',async t=>{
  const {db,request}=await fixture(t);add(db,'estimated');
  const result=await request('/api/benchmarks/estimate',{...payload(db),resolution:'1920x1200'});
  assert.equal(result.status,404);assert.equal(result.body.code,'INSUFFICIENT_DATA');
  assert.equal(result.body.averageFps,undefined);assert.equal(result.body.alternatives[0].resolution,'1920x1080');
});

test('измерения не переносятся на другой или неизвестный CPU/RAM',async t=>{
  const {db,request}=await fixture(t);add(db,'measured');
  for(const changes of [{cpuId:2},{ramGb:16}])assert.equal((await request('/api/benchmarks/estimate',{...payload(db),...changes})).status,404);
  db.prepare('UPDATE benchmarks SET cpu_id=NULL,ram_gb=NULL').run();
  assert.equal((await request('/api/benchmarks/estimate',payload(db))).status,404);
});

test('неизвестные RT/апскейлинг не равны off; пропущенные параметры требуют выбора',async t=>{
  const {db,request}=await fixture(t);add(db,'measured',{ray_tracing_mode:null,upscaling_mode:'fsr 2.1 auto'});
  assert.equal((await request('/api/benchmarks/estimate',payload(db))).status,404);
  const found=await request('/api/benchmarks/estimate',{...payload(db),rayTracingMode:'unknown',upscalingMode:'fsr 2.1 auto'});
  assert.equal(found.status,200);assert.equal(found.body.conditions.rayTracingMode,null);
  assert.ok(found.body.limitations.some(note=>note.includes('RT')&&note.includes('не считается выключенным')));
  add(db,'estimated');const short={...payload(db)};delete short.rayTracingMode;delete short.upscalingMode;delete short.frameGenerationMode;
  const assumed=await request('/api/benchmarks/estimate',short);assert.equal(assumed.status,404);assert.equal(assumed.body.code,'SETTINGS_REQUIRED');assert.equal(assumed.body.missingSettings.length,3);
});

test('версия и ОС измерения не подменяются; несколько замеров не усредняются',async t=>{
  const {db,request}=await fixture(t);add(db,'measured',{game_version:'2.31',measured_at:'2026-10-13'});
  assert.equal((await request('/api/benchmarks/estimate',{...payload(db),gameVersion:'1.0'})).status,404);
  assert.equal((await request('/api/benchmarks/estimate',{...payload(db),os:'linux'})).status,404);
  add(db,'measured',{external_key:'newer',game_version:'2.31',measured_at:'2026-10-20',average_fps:130});
  const found=await request('/api/benchmarks/estimate',payload(db));assert.equal(found.body.averageFps,130);assert.equal(found.body.matchedRecords,2);
});

test('валидация: неизвестные сущности, строки вместо чисел, JSON и лимит тела',async t=>{
  const {db,base,request}=await fixture(t);
  for(const body of [{},[],{...payload(db),gpuId:'1 OR 1=1'},{...payload(db),ramGb:0},{...payload(db),cpuId:9999},{...payload(db),resolution:'0x0'},{...payload(db),frameGenerationMode:false}]) assert.equal((await request('/api/benchmarks/estimate',body)).status,400);
  const bad=await fetch(base+'/api/benchmarks/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'});assert.equal(bad.status,400);
  const huge=await fetch(base+'/api/benchmarks/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(17000)})});assert.equal(huge.status,413);
  const plain=await fetch(base+'/api/benchmarks/estimate',{method:'POST',body:'text'});assert.equal(plain.status,415);
});

test('availability показывает CPU, RAM, режимы и тип отдельно',async t=>{
  const {db,request}=await fixture(t);add(db,'estimated');add(db,'measured',{ray_tracing_mode:null});
  const result=await request('/api/benchmarks/availability?gameId=1&limit=1');assert.equal(result.body.total,2);assert.equal(result.body.items.length,1);
  assert.equal(result.body.items[0].dataType,'measured');assert.equal(result.body.items[0].rayTracingMode,null);
});

test('клиентский fetch-модуль работает с настоящим API и передаёт ошибки',async t=>{
  const {base}=await fixture(t);
  const original=globalThis.fetch;
  globalThis.fetch=(path,options)=>original(new URL(path,base),options);
  t.after(()=>{globalThis.fetch=original;});
  assert.equal((await apiRequest('/games/control')).title,'Control');
  await assert.rejects(apiRequest('/games/unknown'),error=>error.status===404&&error.data.code==='GAME_NOT_FOUND');
});

function csvFixture() {
  const columns=Object.keys(referenceGpus).map(key=>'fps_1080p_high_'+key);
  return {
    gamesCsv:['name,steam_appid,page_url,'+columns.join(','),'Control,870780,https://pcgamebenchmarks.com/game/control,'+columns.map(()=>100).join(',')].join('\n'),
    gpusCsv:['name,type,g3d_mark,page_url',...Object.values(referenceGpus).map(([name,type])=>`${name},${type},1,https://example.com/test-gpu`)].join('\n'),
    license:'Attribution 4.0 International — TEST ONLY',version:'test-csv'
  };
}

test('CSV: повторный импорт не создаёт дубли, модель CPU/RAM остаётся NULL',()=>{
  const db=openDatabase(':memory:');try {
    seedDatabase(db);const fixture=csvFixture();
    assert.equal(importPcDataset(db,fixture).inserted,12);
    const again=importPcDataset(db,fixture);assert.equal(again.inserted,0);assert.equal(again.duplicates,12);
    assert.equal(db.prepare('SELECT count(*) AS n FROM benchmarks WHERE cpu_id IS NOT NULL OR ram_gb IS NOT NULL').get().n,0);
    assert.throws(()=>importPcDataset(db,{...fixture,gamesCsv:'bad\nvalue'}),/поля/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM benchmarks').get().n,12);
  }finally{db.close();}
});

test('JSON: сохраняет 1% Low, пропускает синтетику/агрегаты, импорт идемпотентен',()=>{
  const db=openDatabase(':memory:');try {
    seedDatabase(db);
    const row={id:'test-run',game:'Cyberpunk 2077',game_id:'cyberpunk_2077',game_type:'game',synthetic:false,gpu_name:'GeForce RTX 5080 Founders Edition',form_factor:'Desktop',cpu:'AMD Ryzen 5 5600',memory_gb:32,
      os:'windows',overclocked:false,resolution:'1080p',graphics_preset:'High',avg_fps:120,p1_low:75,run_count:1,implementations:[{cpu:'AMD Ryzen 5 5600',memory_gb:32,os:'windows'}],frame_generation:false,date:'2026-10-13'};
    const data={_license:{name:'CC-BY-4.0'},metadata:{license:{id:'CC-BY-4.0'},synthetic_data:false,schema_version:'0.20'},games:[],records:[row,{...row,id:'synthetic',game_type:'synthetic'},{...row,id:'aggregate',run_count:2}]};
    const first=importOpenGpu(db,data);assert.equal(first.inserted,1);assert.equal(first.skipped,2);
    assert.equal(importOpenGpu(db,data).duplicates,1);
    const saved=db.prepare('SELECT * FROM benchmarks').get();assert.equal(saved.one_percent_low,75);assert.equal(saved.data_type,'measured');assert.equal(saved.ray_tracing_mode,null);
    assert.throws(()=>importOpenGpu(db,{...data,metadata:{...data.metadata,schema_version:'unknown'}}),/схема/);
  }finally{db.close();}
});

test('названия GPU и игры с разными идентификаторами не склеиваются',()=>{
  const db=openDatabase(':memory:');try {
    seedDatabase(db);
    const standard=ensureHardware(db,'gpu','GeForce RTX 4070','Desktop');
    assert.notEqual(standard,ensureHardware(db,'gpu','GeForce RTX 4070 SUPER','Desktop'));
    assert.notEqual(standard,ensureHardware(db,'gpu','GeForce RTX 4070','Mobile'));
    const fixture=csvFixture();fixture.gamesCsv+='\n'+fixture.gamesCsv.split('\n')[1].replace('870780','999999');
    importPcDataset(db,fixture);
    assert.equal(db.prepare("SELECT count(*) AS n FROM games WHERE name='Control'").get().n,2);
  }finally{db.close();}
});

test('ограничения SQL: FK, FPS и источник/тип результата',()=>{
  const db=openDatabase(':memory:');try {
    seedDatabase(db);
    assert.throws(()=>add(db,'estimated',{average_fps:-1}),/CHECK/);
    assert.throws(()=>add(db,'estimated',{game_id:99999}),/FOREIGN KEY/);
    assert.throws(()=>add(db,'estimated',{source_id:testSource(db,'measured')}),/FOREIGN KEY/);
  }finally{db.close();}
});
