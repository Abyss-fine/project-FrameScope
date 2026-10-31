-- Предел FPS, явно указанный в исходном CSV. Не выводится из названия игры.
ALTER TABLE games ADD COLUMN fps_cap REAL CHECK (fps_cap IS NULL OR fps_cap > 0);
