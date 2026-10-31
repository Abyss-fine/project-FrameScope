function findRows(db, query, exact) {
  return db.prepare(`SELECT b.*, s.name AS source_name, s.url AS dataset_url, s.license, s.dataset_version,
    c.model AS cpu_model, gpu.model AS gpu_model, gpu.form_factor, g.name AS game_name, g.fps_cap AS game_fps_cap
    FROM benchmarks b JOIN benchmark_sources s ON s.id=b.source_id
    JOIN games g ON g.id=b.game_id JOIN graphics_cards gpu ON gpu.id=b.gpu_id
    LEFT JOIN processors c ON c.id=b.cpu_id
    WHERE b.game_id=? AND b.gpu_id=? ${exact?'AND b.resolution_width=? AND b.resolution_height=? AND b.graphics_preset=?':''}
    ORDER BY CASE b.data_type WHEN 'measured' THEN 0 ELSE 1 END,
      b.measured_at DESC, b.imported_at DESC, b.id DESC`).all(...(exact?[query.gameId,query.gpuId,query.width,query.height,query.graphicsPreset]:[query.gameId,query.gpuId]));
}

export const findCandidates=(db,query)=>findRows(db,query,true);
export const findNearbyCandidates=(db,query)=>findRows(db,query,false);

export function availability(db, { gameId, gpuId, limit = 100, offset = 0 } = {}) {
  const params = [];
  const filters = [];
  if (gameId !== undefined) { filters.push('b.game_id=?'); params.push(gameId); }
  if (gpuId !== undefined) { filters.push('b.gpu_id=?'); params.push(gpuId); }
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const from = ` FROM benchmarks b JOIN games g ON g.id=b.game_id JOIN graphics_cards gpu ON gpu.id=b.gpu_id
    LEFT JOIN processors cpu ON cpu.id=b.cpu_id`;
  const columns = `b.game_id AS gameId, g.name AS game, b.gpu_id AS gpuId, gpu.model AS gpu,
    b.cpu_id AS cpuId, cpu.model AS cpu, b.ram_gb AS ramGb,
    b.resolution_width || 'x' || b.resolution_height AS resolution, b.graphics_preset AS graphicsPreset,
    b.ray_tracing_mode AS rayTracingMode, b.upscaling_mode AS upscalingMode,
    b.frame_generation_mode AS frameGenerationMode, b.data_type AS dataType, b.game_version AS gameVersion, b.os`;
  const total = db.prepare(`SELECT count(*) AS total FROM (SELECT DISTINCT ${columns}${from}${where})`).get(...params).total;
  const items = db.prepare(`SELECT DISTINCT ${columns}${from}${where} ORDER BY b.data_type DESC, b.game_id, b.gpu_id, b.resolution_width, b.graphics_preset LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { items, total, limit, offset };
}
