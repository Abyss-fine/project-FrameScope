import { ApiError, validateEstimate } from './validation.js';
import { findCandidates, findNearbyCandidates, availability } from '../repositories/benchmarks.js';
import { resolveGraphicsRequest } from './graphics-settings.js';
import { projectFps, roundedEstimate } from './forecast.js';

function compatible(row,query){
  if(row.ray_tracing_mode!==query.rayTracingMode||row.upscaling_mode!==query.upscalingMode||row.frame_generation_mode!==query.frameGenerationMode)return false;
  if(query.gameVersion&&row.game_version!==query.gameVersion)return false;
  if(row.data_type==='estimated')return true;
  return row.cpu_id===query.cpuId&&row.ram_gb===query.ramGb&&row.os===query.os;
}

function responseFor(row,query,{projection=null,matchedRecords=1}={}){
  const measured=row.data_type==='measured'&&!projection;
  const confidence=projection?'low':measured?([row.ray_tracing_mode,row.upscaling_mode,row.frame_generation_mode].some(value=>value===null)?'medium':'high'):'medium';
  const fromResolution=`${row.resolution_width}x${row.resolution_height}`;
  const limitation=row.data_type==='estimated'?'CPU и RAM не учитываются источником.':'CPU и RAM совпадают с тестовой системой; их влияние отдельно не моделируется.';
  let explanation=measured?'Найден замер для выбранных условий. Результат относится к тестовой системе.':projection?
    `Основа: ${row.game_name}, ${row.gpu_model}, ${projection.from.resolution}, ${projection.from.graphicsPreset}, ${projection.from.averageFps} FPS. Коэффициенты: разрешение ×${Number(projection.factors.resolution.toFixed(3))}, качество ×${Number(projection.factors.preset.toFixed(3))}. Это некалиброванная эвристика FrameScope.`:
    'Оценка из датасета для выбранных игры, GPU и настроек; округлена для отображения.';
  if(projection?.appliedLimits.length)explanation+=' Учтён предел: '+projection.appliedLimits.map(limit=>`${limit.value} FPS (${limit.type==='game-cap'?'лимит игры из источника':'потолок исходной модели'})`).join(', ')+'.';
  const limitations=[limitation];
  if(!measured)limitations.push('Ориентировочное значение, не измерение и не гарантия FPS. Уверенность — условная оценка качества основы, не вероятность ошибки.');
  else limitations.push('Даже совпадение основных параметров не гарантирует такой FPS на другом ПК.');
  if(projection)limitations.push('Пересчитываются только разрешение и обычный пресет. Влияние RT, апскейлинга и генерации кадров не моделируется. 1% Low и загрузка компонентов из базового результата не переносятся.');
  for(const [name,value] of [['RT',row.ray_tracing_mode],['апскейлинга',row.upscaling_mode],['генерации кадров',row.frame_generation_mode]]){
    if(value===null)limitations.push(`Состояние ${name} не указано источником и не считается выключенным.`);
  }
  if(!query.gameVersion)limitations.push(`Версия игры в источнике: ${row.game_version??'не указана'}; установленная версия не определяется.`);
  const conditions={
    game:row.game_name,gpu:row.gpu_model,formFactor:row.form_factor,cpu:row.cpu_model,cpuId:row.cpu_id,ramGb:row.ram_gb,
    resolution:projection?projection.to.resolution:fromResolution,graphicsPreset:query.graphicsPreset,
    rayTracingMode:row.ray_tracing_mode,upscalingMode:row.upscaling_mode,frameGenerationMode:row.frame_generation_mode,
    gameVersion:row.game_version,measuredAt:row.measured_at,sampleCount:row.sample_count,os:row.os,driver:row.driver,
    details:JSON.parse(row.conditions_json)
  };
  const averageFps=projection?.averageFps??(measured?row.average_fps:Math.min(roundedEstimate(row.average_fps),row.game_fps_cap>0&&row.average_fps<=row.game_fps_cap?row.game_fps_cap:Infinity));
  return {status:200,body:{
    benchmarkId:row.id,resultType:measured?'measured':'estimated',dataType:measured?'measured':'estimated',
    method:measured?'measured':projection?'heuristic':'dataset-estimate',
    label:measured?'Реальный бенчмарк':'Ориентировочный прогноз',confidence,explanation,
    sourceName:projection?`FrameScope на основе ${row.source_name}`:row.source_name,sourceUrl:row.source_url,
    averageFps,onePercentLow:projection?null:row.one_percent_low,gpuUsage:projection?null:row.gpu_usage,cpuUsage:projection?null:row.cpu_usage,
    cpuConsidered:row.data_type==='measured',ramConsidered:row.data_type==='measured',limitations,
    source:{name:row.source_name,url:row.source_url,datasetUrl:row.dataset_url,license:row.license,datasetVersion:row.dataset_version},
    conditions,basis:{benchmarkId:row.id,dataType:row.data_type,averageFps:row.average_fps,resolution:fromResolution,graphicsPreset:row.graphics_preset,gameVersion:row.game_version,measuredAt:row.measured_at},
    adjustments:projection?{version:projection.version,factors:projection.factors,limits:projection.limits}:null,
    matchedRecords,timeSeries:null
  }};
}

export function estimate(db,body){
  const query=validateEstimate(body);
  for(const [field,table]of [['gameId','games'],['gpuId','graphics_cards'],['cpuId','processors']]){
    if(query[field]!==null&&!db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(query[field]))throw new ApiError(400,'UNKNOWN_ENTITY',`Неизвестный ${field}.`);
  }
  if(query.cpuId===null||query.gpuId===null)return {status:404,body:{code:'MANUAL_HARDWARE_NO_DATA',message:'Для этой модели недостаточно данных даже для ориентировочного прогноза. Выбери точную модель из подсказок, если она есть.',manualHardware:{cpuName:query.cpuName??null,gpuName:query.gpuName??null},alternatives:[],alternativesTotal:0}};
  if(query.missingSettings.length)return {status:404,body:{code:'SETTINGS_REQUIRED',message:'Не заданы обязательные графические настройки.',missingSettings:query.missingSettings,alternatives:[],alternativesTotal:0}};
  resolveGraphicsRequest(db,body,query);
  const exact=findCandidates(db,query).filter(row=>compatible(row,query));
  if(exact.length)return responseFor(exact[0],query,{matchedRecords:exact.length});
  // Оценки ищутся только для ТОЙ ЖЕ игры/GPU и тех же известных режимов.
  const nearby=findNearbyCandidates(db,query).filter(row=>compatible(row,query)).map(row=>({row,projection:projectFps(row,query)})).filter(item=>item.projection);
  // Ближайшие условия важнее типа основы. При равной дистанции SQL уже ставит замер первым.
  nearby.sort((a,b)=>a.projection.distance-b.projection.distance);
  if(nearby.length)return responseFor(nearby[0].row,query,{projection:nearby[0].projection,matchedRecords:nearby.length});
  const alternatives=availability(db,{gameId:query.gameId,gpuId:query.gpuId,limit:12});
  return {status:404,body:{code:'INSUFFICIENT_DATA',message:'Недостаточно данных даже для ориентировочного прогноза. Для выбранных игры, GPU или графических режимов нет подходящей основы.',alternatives:alternatives.items,alternativesTotal:alternatives.total,assumptions:[]}};
}
