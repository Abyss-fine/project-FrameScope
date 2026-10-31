import { forecastConfig as config } from '../config/forecast.js';

export function roundedEstimate(value) {
  return Math.max(1, value < 20 ? Math.round(value) : Math.round(value / config.roundingStep) * config.roundingStep);
}

export function projectFps(row, query) {
  if(['ray_tracing_mode','upscaling_mode','frame_generation_mode'].some(key=>row[key]===null||row[key]===undefined))return null;
  const fromResolution=`${row.resolution_width}x${row.resolution_height}`;
  const toResolution=`${query.width}x${query.height}`;
  const fromPreset=row.graphics_preset,toPreset=query.graphicsPreset;
  const resolutionFrom=config.resolutions[fromResolution],resolutionTo=config.resolutions[toResolution];
  const presetFrom=config.presets[fromPreset],presetTo=config.presets[toPreset];
  // Нельзя обращаться к унаследованным свойствам объекта через пользовательский пресет.
  if(!Object.hasOwn(config.resolutions,fromResolution)||!Object.hasOwn(config.resolutions,toResolution)||
    !Object.hasOwn(config.presets,fromPreset)||!Object.hasOwn(config.presets,toPreset))return null;
  const resolutionFactor=resolutionTo/resolutionFrom,presetFactor=presetTo/presetFrom;
  const raw=row.average_fps*resolutionFactor*presetFactor;
  if(!Number.isFinite(raw)||raw<=0)return null;
  const limits=[];
  const ceiling=config.sourceCeilings[row.source_name];
  if(typeof ceiling==='number')limits.push({type:'model-ceiling',value:ceiling});
  // Известный предел из CSV не переносим на явно противоречащий ему замер.
  if(row.game_fps_cap>0&&row.average_fps<=row.game_fps_cap)limits.push({type:'game-cap',value:row.game_fps_cap});
  const cap=limits.length?Math.min(...limits.map(limit=>limit.value)):Infinity;
  return {
    averageFps:Math.min(roundedEstimate(Math.min(raw,cap)),cap),
    distance:Math.abs(Math.log(resolutionFactor))+Math.abs(Math.log(presetFactor)),
    factors:{resolution:resolutionFactor,preset:presetFactor},
    from:{resolution:fromResolution,graphicsPreset:fromPreset,averageFps:row.average_fps},
    to:{resolution:toResolution,graphicsPreset:toPreset},
    limits,appliedLimits:limits.filter(limit=>raw>limit.value),version:config.version
  };
}
