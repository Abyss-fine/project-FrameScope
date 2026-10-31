import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase } from '../src/db/database.js';
import { seedDatabase,ensureHardware } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { insertBenchmark } from '../src/services/importers.js';

async function fixture(t){
  const db=openDatabase(':memory:');seedDatabase(db);
  const server=createApp(db).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();});
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,body)=>{const response=await fetch(base+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  const gpuId=db.prepare('SELECT id FROM graphics_cards WHERE model=?').get('NVIDIA GeForce RTX 4070').id;
  const body={gameId:1,cpuId:1,gpuId,ramGb:32,resolution:'1920x1080',graphicsPreset:'high',rayTracingMode:'off',upscalingTechnology:'off',upscalingQuality:null,frameGenerationMode:'off'};
  return {db,request,body};
}

test('поиск GPU различает SUPER, Ti и Mobile, вход проверяется',async t=>{
  const {db,request}=await fixture(t);
  const superId=ensureHardware(db,'gpu','GeForce RTX 4070 SUPER','Desktop');
  const mobile=ensureHardware(db,'gpu','GeForce RTX 4070','Mobile');
  ensureHardware(db,'gpu','GeForce RTX 4070 Ti','Desktop');
  const found=await request('/api/hardware/gpus?search=RTX%204070%20SUPER&limit=10');
  assert.equal(found.body.items.length,1);assert.equal(found.body.items[0].id,superId);
  const all=await request('/api/hardware/gpus?search=4070');assert.equal(all.body.items.length,4);assert.ok(all.body.items.some(row=>row.id===mobile&&row.form_factor==='Mobile'));
  assert.equal((await request('/api/hardware/gpus?search='+encodeURIComponent("' OR 1=1 --"))).body.items.length,0);
  assert.equal((await request('/api/hardware/gpus?limit=0')).status,400);
  assert.equal((await request('/api/hardware/cpus?search[]=Ryzen')).status,400);
  assert.equal((await request('/api/hardware/cpus?search=RYZEN%205')).body.items.length,2);
});

test('ручной CPU/GPU не подбирается по похожему имени и не записывается в справочник',async t=>{
  const {db,request,body}=await fixture(t);
  const counts=()=>['processors','graphics_cards','benchmarks'].map(table=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  const before=counts();
  for(const [kind,name]of [['gpu','GeForce RTX 4070 SUPER UNKNOWN'],['cpu','Мой неизвестный процессор'],['gpu','NVIDIA GeForce RTX 4070']]){
    const payload={...body};delete payload[kind+'Id'];payload[kind+'Name']=name;
    const result=await request('/api/benchmarks/estimate',payload);
    assert.equal(result.status,404);assert.equal(result.body.code,'MANUAL_HARDWARE_NO_DATA');assert.equal(result.body.manualHardware[kind+'Name'],name);assert.equal(result.body.averageFps,undefined);
  }
  assert.deepEqual(counts(),before);
});

test('неверные ручные модели отклоняются, текст с HTML не исполняется',async t=>{
  const {db,request,body}=await fixture(t);
  for(const name of ['', ' ', 'x'.repeat(121),['GPU'],'bad\nGPU']){
    const payload={...body,gpuName:name};delete payload.gpuId;
    assert.equal((await request('/api/benchmarks/estimate',payload)).status,400);
  }
  assert.equal((await request('/api/benchmarks/estimate',{...body,gpuName:'RTX'})).status,400);
  const payload={...body,gpuName:'<img src=x onerror=alert(1)>'};delete payload.gpuId;
  assert.equal((await request('/api/benchmarks/estimate',payload)).status,404);
  assert.ok(db.prepare('SELECT count(*) n FROM graphics_cards').get().n>0);
});

test('настройки игры зависят от GPU; непроверенные технологии не предлагаются',async t=>{
  const {db,request,body}=await fixture(t);
  const caps=(game,gpu)=>request(`/api/games/${game}/settings`+(gpu?'?gpuId='+gpu:''));
  const cyber=(await caps(1,body.gpuId)).body;
  assert.ok(cyber.upscaling.some(item=>item.value==='dlss'&&item.modes.includes('quality')));
  assert.ok(cyber.frameGeneration.some(item=>item.value==='dlss-fg'));
  assert.deepEqual(cyber.rayTracing.map(item=>item.value),['off','low','medium','ultra','overdrive']);
  const control=(await caps(2,body.gpuId)).body;
  assert.ok(!control.upscaling.some(item=>item.value.startsWith('fsr')));
  assert.equal(control.frameGeneration.length,1);assert.ok(!control.rayTracing.some(item=>item.value==='low'));
  const radeon=ensureHardware(db,'gpu','AMD Radeon RX 6600','Desktop');
  const amd=(await caps(1,radeon)).body;
  assert.ok(!amd.upscaling.some(item=>item.value==='dlss'));assert.ok(amd.upscaling.some(item=>item.value==='fsr-2.1'));
  assert.ok(!amd.upscaling.some(item=>item.value==='fsr-3.1'));assert.ok(amd.frameGeneration.some(item=>item.value==='fsr-3.1-fg'));
  const rtx3060=ensureHardware(db,'gpu','NVIDIA GeForce RTX 3060','Desktop');
  assert.ok(!(await caps(1,rtx3060)).body.frameGeneration.some(item=>item.value==='dlss-fg'));
  assert.deepEqual((await caps(9,body.gpuId)).body.upscaling.map(item=>item.value),['off']);
  assert.deepEqual((await caps(1)).body.upscaling.map(item=>item.value),['off']);
  assert.equal((await caps('unknown',body.gpuId)).status,404);
  assert.equal((await caps(1,99999)).status,400);
});

test('разделённые технология/качество точно сопоставляются, без интерполяции и смешивания API',async t=>{
  const {db,request,body}=await fixture(t);
  // Только тестовые числа в in-memory БД, не в рабочем датасете.
  const source=Number(db.prepare('INSERT INTO benchmark_sources(name,url,license,dataset_version,data_type) VALUES (?,?,?,?,?)').run('TEST ONLY','https://example.com','TEST','fixture','estimated').lastInsertRowid);
  insertBenchmark(db,{game_id:1,gpu_id:body.gpuId,resolution_width:1920,resolution_height:1080,graphics_preset:'high',ray_tracing_mode:'off',upscaling_mode:'dlss quality',frame_generation_mode:'off',average_fps:100,source_id:source,data_type:'estimated',external_key:'test-dlss',source_url:'https://example.com'});
  const query={...body,upscalingTechnology:'dlss',upscalingQuality:'quality'};
  assert.equal((await request('/api/benchmarks/estimate',query)).body.averageFps,100);
  assert.equal((await request('/api/benchmarks/estimate',{...query,upscalingQuality:'balanced'})).status,404);
  assert.equal((await request('/api/benchmarks/estimate',{...query,upscalingMode:'off'})).status,400);
  assert.equal((await request('/api/benchmarks/estimate',{...body,upscalingQuality:'quality'})).status,400);
  assert.equal((await request('/api/benchmarks/estimate',{...query,gameId:9})).status,400);
  assert.equal((await request('/api/benchmarks/estimate',{...body,frameGenerationMode:'dlss-fg'})).status,400);
  const missing={...body};delete missing.rayTracingMode;
  assert.equal((await request('/api/benchmarks/estimate',missing)).body.code,'SETTINGS_REQUIRED');
  assert.equal(db.prepare('SELECT count(*) n FROM benchmarks').get().n,1);
});
