-- Список GPU проверяет наличие FPS по gpu_id без фильтра игры.
-- Составной индекс (game_id, gpu_id, ...) такой запрос не ускоряет.
CREATE INDEX benchmarks_gpu ON benchmarks(gpu_id);
