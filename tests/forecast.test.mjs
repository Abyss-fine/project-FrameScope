import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { insertBenchmark } from '../src/services/importers.js';
import { estimate } from '../src/services/estimate.js';
import { graphicsSettings } from '../src/services/graphics-settings.js';

// Все численные фикстуры этого файла — только в :memory:.
function fixture(t){
  const db=openDatabase(':memory:');seedDatabase(db);t.after(()=>db.close());
  const gpuId=db.prepare('SELECT id FROM graphics_cards WHERE model=?').get('NVIDIA GeForce RTX 4070').id;
  const query={gameId:1,cpuId:1,gpuId,ramGb:32,resolution:'1920x1080',graphicsPreset:'high',rayTracingMode:'off',upscalingMode:'off',frameGenerationMode:'off'};
  function add(type='estimated',extra={}){
    db.prepare('INSERT OR IGNORE INTO benchmark_sources(name,url,license,dataset_version,data_type) VALUES (?,?,?,?,?)').run('TEST '+type,'https://example.com','TEST','fixture',type);
    const source=db.prepare('SELECT id FROM benchmark_sources WHERE name=?').get('TEST '+type).id;
    insertBenchmark(db,{game_id:1,gpu_id:gpuId,cpu_id:type==='measured'?1:null,ram_gb:type==='measured'?32:null,resolution_width:1920,resolution_height:1080,graphics_preset:'high',ray_tracing_mode:'off',upscaling_mode:'off',frame_generation_mode:'off',average_fps:100,source_id:source,data_type:type,os:type==='measured'?'windows':null,external_key:extra.external_key??type,source_url:'https://example.com',...extra});
    return db.prepare('SELECT id FROM benchmarks ORDER BY id DESC LIMIT 1').get().id;
  }
  return {db,query,add};
}

test('точный замер остаётся measured, с исходными метриками и высокой условной уверенностью',t=>{
  const {db,query,add}=fixture(t);add('estimated');add('measured',{average_fps:111.23,one_percent_low:70.11,gpu_usage:90,cpu_usage:30});
  const result=estimate(db,query);assert.equal(result.status,200);assert.equal(result.body.resultType,'measured');assert.equal(result.body.method,'measured');assert.equal(result.body.confidence,'high');assert.equal(result.body.averageFps,111.23);assert.equal(result.body.onePercentLow,70.11);assert.equal(result.body.gpuUsage,90);assert.equal(result.body.adjustments,null);
});

test('нет точного разрешения: прогноз с видимым коэффициентом и исходной записью',t=>{
  const {db,query,add}=fixture(t);const id=add();
  const result=estimate(db,{...query,resolution:'2560x1440'});
  assert.equal(result.status,200);assert.equal(result.body.resultType,'estimated');assert.equal(result.body.method,'heuristic');assert.equal(result.body.confidence,'low');assert.equal(result.body.averageFps,70);assert.equal(result.body.basis.benchmarkId,id);assert.equal(result.body.basis.averageFps,100);assert.equal(result.body.conditions.resolution,'2560x1440');assert.equal(result.body.adjustments.factors.resolution,0.72);assert.match(result.body.explanation,/0.72/);assert.match(result.body.sourceName,/FrameScope/);assert.equal(result.body.sourceUrl,'https://example.com');
  assert.equal(db.prepare('SELECT count(*) AS n FROM benchmarks').get().n,1);
});

test('разрешение и пресет пересчитываются вместе, без ложной точности',t=>{
  const {db,query,add}=fixture(t);add();
  const result=estimate(db,{...query,resolution:'2560x1440',graphicsPreset:'medium'}).body;
  assert.equal(result.averageFps,85);assert.equal(result.adjustments.factors.preset,1.15);assert.equal(result.onePercentLow,null);assert.equal(result.cpuUsage,null);assert.equal(result.gpuUsage,null);assert.equal(result.timeSeries,null);assert.equal(result.cpuConsidered,false);
});

test('ближайшие условия выбираются до типа источника; несовместимые замеры не смешиваются',t=>{
  const {db,query,add}=fixture(t);add('measured',{average_fps:100});
  const closer=add('estimated',{external_key:'closer',resolution_width:2560,resolution_height:1440,graphics_preset:'medium',average_fps:200});
  const result=estimate(db,{...query,resolution:'2560x1440',graphicsPreset:'ultra'}).body;
  assert.equal(result.basis.benchmarkId,closer);assert.equal(result.averageFps,150);
});

test('прогноз из измерения не переносит 1% Low и нагрузку на другие условия',t=>{
  const {db,query,add}=fixture(t);add('measured',{one_percent_low:70,gpu_usage:90,cpu_usage:35});
  const result=estimate(db,{...query,resolution:'3840x2160'}).body;
  assert.equal(result.resultType,'estimated');assert.equal(result.averageFps,40);assert.equal(result.onePercentLow,null);assert.equal(result.gpuUsage,null);assert.equal(result.cpuUsage,null);assert.equal(result.cpuConsidered,true);
  assert.equal(estimate(db,{...query,cpuId:2,resolution:'3840x2160'}).status,404);
});

test('RT/DLSS/FG не получают произвольных коэффициентов; NULL не становится off',t=>{
  const {db,query,add}=fixture(t);add();
  for(const change of [{rayTracingMode:'low'},{upscalingMode:'dlss quality'},{frameGenerationMode:'on'}])assert.equal(estimate(db,{...query,resolution:'2560x1440',...change}).status,404);
  db.prepare('UPDATE benchmarks SET ray_tracing_mode=NULL').run();
  assert.equal(estimate(db,{...query,resolution:'2560x1440'}).status,404);
  assert.equal(estimate(db,{...query,rayTracingMode:'unknown',resolution:'2560x1440'}).status,404);
});

test('нет основы для игры/GPU, неизвестное разрешение и специальный пресет не оцениваются',t=>{
  const {db,query,add}=fixture(t);add();
  for(const change of [{gameId:2},{gpuId:1},{resolution:'1920x1200'},{graphicsPreset:'steam deck'},{graphicsPreset:'__proto__'}]){
    const result=estimate(db,{...query,...change});assert.equal(result.status,404);assert.equal(result.body.averageFps,undefined);assert.match(result.body.message,/даже для ориентировочного/);
  }
});

test('известный предел FPS игры ограничивает прогноз и отражён в объяснении',t=>{
  const {db,query,add}=fixture(t);add('estimated',{average_fps:60});db.prepare('UPDATE games SET fps_cap=60 WHERE id=1').run();
  const result=estimate(db,{...query,graphicsPreset:'low'}).body;
  assert.equal(result.averageFps,60);assert.match(result.explanation,/лимит игры/);assert.ok(result.adjustments.limits.some(limit=>limit.type==='game-cap'));
});

test('параметры формы доступны только при наличии полностью описанных записей',t=>{
  const {db,query,add}=fixture(t);add();
  let settings=graphicsSettings(db,1,query.gpuId).analysis;
  assert.deepEqual(settings.upscaling.map(item=>item.value),['off']);assert.deepEqual(settings.rayTracing.map(item=>item.value),['off']);
  add('estimated',{external_key:'dlss',upscaling_mode:'dlss quality'});
  settings=graphicsSettings(db,1,query.gpuId).analysis;
  assert.deepEqual(settings.upscaling.find(item=>item.value==='dlss').modes,['quality']);
  db.prepare('UPDATE benchmarks SET ray_tracing_mode=NULL WHERE upscaling_mode=?').run('dlss quality');
  assert.deepEqual(graphicsSettings(db,1,query.gpuId).analysis.upscaling.map(item=>item.value),['off']);
});
