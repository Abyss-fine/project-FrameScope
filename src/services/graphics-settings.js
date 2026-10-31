import { graphicsProfiles } from '../data/graphics-profiles.js';
import { ApiError } from './validation.js';

const labels = {off:'Выключено',on:'Включено',low:'Низкое',medium:'Среднее',high:'Высокое',ultra:'Ультра',overdrive:'Path Tracing — Overdrive'};
export function graphicsSettings(db, gameId, gpuId) {
  const game = db.prepare('SELECT slug FROM games WHERE id=?').get(gameId);
  if (!game) throw new ApiError(404,'GAME_NOT_FOUND','Игра не найдена.');
  const gpu = gpuId ? db.prepare('SELECT * FROM graphics_cards WHERE id=?').get(gpuId) : null;
  if (gpuId && !gpu) throw new ApiError(400,'UNKNOWN_ENTITY','Неизвестный gpuId.');
  const model = gpu?.model.toLowerCase() ?? '';
  // Только ID подтверждённого справочника. Ручное название не определяет совместимость.
  const rtx = /\bgeforce rtx (20|30|40|50)\d{2}\b/.test(model);
  const radeon = /\bradeon rx [5679]\d{3}\b/.test(model);
  const arc = /\barc [ab]\d{3}\b/.test(model);
  const supports = {rtx,'rtx-fg':/\bgeforce rtx (40|50)\d{2}\b/.test(model),fsr:rtx||radeon,arc};
  const rtCapable = rtx || /\bradeon rx [679]\d{3}\b/.test(model) || arc;
  const profile = graphicsProfiles[game.slug];
  const off = {value:'off',label:'Выключено'};
  const presets = profile?.presets ?? db.prepare('SELECT DISTINCT graphics_preset AS preset FROM benchmarks WHERE game_id=? ORDER BY graphics_preset').all(gameId).map(row=>row.preset);
  const result = {
    verified: Boolean(profile),hardwareVerified:Boolean(gpu),reviewedAt:'2026-10-31',scope:profile?.scope ?? 'Расширенные настройки этой игры ещё не проверены.',
    presets: presets.map(value=>({value,label:labels[value]??value})),
    rayTracing:[off,...(rtCapable?(profile?.rt??[]):[]).map(value=>({value,label:labels[value]??value}))],
    upscaling:[{value:'off',label:'Выключено / Native',prefix:'off',modes:[]},...(profile?.upscalers??[]).filter(item=>supports[item.requires])],
    frameGeneration:[off,...(profile?.frameGeneration??[]).filter(item=>supports[item.requires])],
    notes:[...(profile?.notes??['Для неподтверждённых игр дополнительные технологии не предлагаются.']),...(!gpu?['Выбери GPU из справочника, чтобы проверить совместимость.']:[])],
    sources:profile?.sources??[]
  };
  // Отдельно от возможностей игры: только параметры с полностью описанными
  // записями для ЭТОЙ игры/GPU. Их и показывает компактная форма анализа.
  const known=gpu?db.prepare(`SELECT DISTINCT graphics_preset,ray_tracing_mode,upscaling_mode,frame_generation_mode
    FROM benchmarks WHERE game_id=? AND gpu_id=? AND ray_tracing_mode IS NOT NULL
    AND upscaling_mode IS NOT NULL AND frame_generation_mode IS NOT NULL`).all(gameId,gpuId):[];
  const expressed=[];
  for(const record of known){
    if(!result.rayTracing.some(mode=>mode.value===record.ray_tracing_mode)||!result.frameGeneration.some(mode=>mode.value===record.frame_generation_mode))continue;
    for(const technology of result.upscaling){
      if(technology.value==='off'&&record.upscaling_mode==='off')expressed.push({...record,technology:'off',quality:null});
      for(const quality of technology.modes){
        if(record.upscaling_mode===technology.prefix+' '+quality.replaceAll('-',' '))expressed.push({...record,technology:technology.value,quality});
      }
    }
  }
  result.analysis={
    rayTracing:result.rayTracing.filter(mode=>mode.value==='off'||expressed.some(row=>row.ray_tracing_mode===mode.value)),
    upscaling:result.upscaling.filter(tech=>tech.value==='off'||expressed.some(row=>row.technology===tech.value))
      .map(tech=>({...tech,modes:tech.modes.filter(mode=>expressed.some(row=>row.technology===tech.value&&row.quality===mode))})),
    frameGeneration:result.frameGeneration.filter(mode=>mode.value==='off'||expressed.some(row=>row.frame_generation_mode===mode.value)),
    combinations:expressed.map(row=>({rayTracingMode:row.ray_tracing_mode,upscalingTechnology:row.technology,upscalingQuality:row.quality,frameGenerationMode:row.frame_generation_mode}))
  };
  return result;
}

// Новый двухпольный запрос переводим в точное имя режима источника, без догадки о версии.
export function resolveGraphicsRequest(db, body, query) {
  if (body.upscalingTechnology === undefined) return query;
  if (body.upscalingMode !== undefined) throw new ApiError(400,'INVALID_REQUEST','Передавай либо upscalingMode, либо технологию и качество.');
  const settings=graphicsSettings(db,query.gameId,query.gpuId);
  const technology=settings.upscaling.find(item=>item.value===body.upscalingTechnology);
  if (!technology) throw new ApiError(400,'UNSUPPORTED_SETTINGS','Технология апскейлинга не подтверждена для этой игры и GPU.');
  if (!settings.rayTracing.some(item=>item.value===query.rayTracingMode) || !settings.frameGeneration.some(item=>item.value===query.frameGenerationMode)) throw new ApiError(400,'UNSUPPORTED_SETTINGS','RT или генерация кадров не подтверждены для этой игры и GPU.');
  const fg=settings.frameGeneration.find(item=>item.value===query.frameGenerationMode);
  if (fg.upscalers && !fg.upscalers.includes(technology.value)) throw new ApiError(400,'UNSUPPORTED_SETTINGS','Сочетание генерации кадров и апскейлинга пока не подтверждено.');
  if (technology.value==='off') {
    if (body.upscalingQuality !== undefined && body.upscalingQuality !== null) throw new ApiError(400,'INVALID_REQUEST','Native не имеет режима качества апскейлинга.');
    query.upscalingMode='off';
  } else {
    if (!technology.modes.includes(body.upscalingQuality)) throw new ApiError(400,'UNSUPPORTED_SETTINGS','Выбери подтверждённый режим качества.');
    query.upscalingMode=technology.prefix+' '+body.upscalingQuality.replaceAll('-',' ');
  }
  return query;
}
