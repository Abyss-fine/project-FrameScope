export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export function positiveInteger(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new ApiError(400, 'INVALID_REQUEST', `${name}: требуется положительное целое число (до ${max}).`);
  }
  return value;
}

export function queryInteger(value, name, fallback, max = 20000) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new ApiError(400, 'INVALID_QUERY', `Некорректный параметр ${name}.`);
  if (name === 'offset' && value === '0') return 0;
  return positiveInteger(Number(value), name, max);
}

export function queryText(value, name, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 200) throw new ApiError(400, 'INVALID_QUERY', `Некорректный параметр ${name}.`);
  return value.trim();
}

export function validateEstimate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_REQUEST', 'Требуется JSON-объект конфигурации.');
  const allowed = ['gameId','cpuId','gpuId','cpuName','gpuName','ramGb','resolution','graphicsPreset','rayTracingMode','upscalingMode','upscalingTechnology','upscalingQuality','frameGenerationMode','gameVersion','os'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ApiError(400, 'INVALID_REQUEST', 'Запрос содержит неизвестные поля.');
  const result = {};
  result.gameId=positiveInteger(body.gameId,'gameId');
  for(const kind of ['cpu','gpu']) {
    const id=body[kind+'Id'],name=body[kind+'Name'];
    if(id!==undefined&&id!==null) {
      result[kind+'Id']=positiveInteger(id,kind+'Id');
      if(name!==undefined)throw new ApiError(400,'INVALID_REQUEST','Передавай ID или ручное название, не оба сразу.');
    } else {
      if(typeof name!=='string'||name.trim().length<2||name.trim().length>120||/[\u0000-\u001f\u007f]/.test(name))throw new ApiError(400,'INVALID_REQUEST',kind+': выбери ID или введи название (2–120 символов).');
      result[kind+'Id']=null;result[kind+'Name']=name.trim();
    }
  }
  result.ramGb = positiveInteger(body.ramGb, 'ramGb', 2048);
  if (typeof body.resolution !== 'string' || !/^\d{3,5}x\d{3,5}$/.test(body.resolution)) throw new ApiError(400, 'INVALID_REQUEST', 'resolution: ожидается, например, 1920x1080.');
  [result.width, result.height] = body.resolution.split('x').map(Number);
  if (result.width > 16384 || result.height > 16384) throw new ApiError(400, 'INVALID_REQUEST', 'Разрешение слишком большое.');
  if (typeof body.graphicsPreset !== 'string' || !body.graphicsPreset.trim() || body.graphicsPreset.length > 100) throw new ApiError(400, 'INVALID_REQUEST', 'graphicsPreset: требуется название пресета.');
  result.graphicsPreset = body.graphicsPreset.trim().toLowerCase();
  result.assumptions = [];
  result.missingSettings=[];
  for (const key of ['rayTracingMode','upscalingMode','frameGenerationMode']) {
    if (body[key] === undefined) {
      result[key] = undefined;
      if(key!=='upscalingMode'||body.upscalingTechnology===undefined)result.missingSettings.push(key);
    } else if (body[key] === null || body[key] === 'unknown') {
      result[key] = null;
    } else if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 100) {
      throw new ApiError(400, 'INVALID_REQUEST', `Некорректный ${key}.`);
    } else result[key] = body[key].trim().toLowerCase();
  }
  if(body.upscalingTechnology!==undefined&&(typeof body.upscalingTechnology!=='string'||body.upscalingTechnology.length>60))throw new ApiError(400,'INVALID_REQUEST','Некорректная технология апскейлинга.');
  if(body.upscalingQuality!==undefined&&body.upscalingQuality!==null&&(typeof body.upscalingQuality!=='string'||body.upscalingQuality.length>60))throw new ApiError(400,'INVALID_REQUEST','Некорректный режим качества.');
  if(body.upscalingQuality!==undefined&&body.upscalingTechnology===undefined)throw new ApiError(400,'INVALID_REQUEST','Качество требует технологии апскейлинга.');
  if (body.gameVersion !== undefined && (typeof body.gameVersion !== 'string' || body.gameVersion.length > 100)) throw new ApiError(400, 'INVALID_REQUEST', 'Некорректная версия игры.');
  result.gameVersion = body.gameVersion?.trim() || null;
  result.os = body.os ?? 'windows';
  if (!['windows','linux'].includes(result.os)) throw new ApiError(400, 'INVALID_REQUEST', 'Поддерживаемые ОС запроса: windows, linux.');
  return result;
}
