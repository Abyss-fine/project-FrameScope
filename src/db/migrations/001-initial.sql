CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  identity_key TEXT NOT NULL UNIQUE,
  steam_appid TEXT,
  genre TEXT,
  description TEXT,
  release_date TEXT,
  rawg_id INTEGER,
  image_url TEXT,
  page_url TEXT,
  edition_note TEXT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1))
);
CREATE TABLE processors (
  id INTEGER PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  identity_key TEXT NOT NULL UNIQUE
);
CREATE TABLE graphics_cards (
  id INTEGER PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  form_factor TEXT,
  identity_key TEXT NOT NULL UNIQUE
);
CREATE TABLE benchmark_sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  license TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('measured', 'estimated')),
  UNIQUE (name, dataset_version),
  UNIQUE (id, data_type)
);
CREATE TABLE benchmarks (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  gpu_id INTEGER NOT NULL REFERENCES graphics_cards(id),
  cpu_id INTEGER REFERENCES processors(id),
  ram_gb INTEGER CHECK (ram_gb IS NULL OR ram_gb > 0),
  resolution_width INTEGER NOT NULL CHECK (resolution_width BETWEEN 1 AND 16384),
  resolution_height INTEGER NOT NULL CHECK (resolution_height BETWEEN 1 AND 16384),
  graphics_preset TEXT NOT NULL,
  ray_tracing_mode TEXT,
  upscaling_mode TEXT,
  frame_generation_mode TEXT,
  average_fps REAL NOT NULL CHECK (average_fps > 0 AND average_fps <= 10000),
  one_percent_low REAL CHECK (one_percent_low IS NULL OR one_percent_low BETWEEN 0 AND 10000),
  gpu_usage REAL CHECK (gpu_usage IS NULL OR gpu_usage BETWEEN 0 AND 100),
  cpu_usage REAL CHECK (cpu_usage IS NULL OR cpu_usage BETWEEN 0 AND 100),
  source_id INTEGER NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('measured', 'estimated')),
  measured_at TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sample_count INTEGER CHECK (sample_count IS NULL OR sample_count > 0),
  external_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  game_version TEXT,
  os TEXT,
  driver TEXT,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (source_id, data_type) REFERENCES benchmark_sources(id, data_type),
  UNIQUE (source_id, external_key)
);
CREATE INDEX games_steam ON games(steam_appid);
CREATE INDEX benchmarks_lookup ON benchmarks(game_id, gpu_id, resolution_width, resolution_height, graphics_preset);
CREATE INDEX benchmarks_cpu ON benchmarks(cpu_id, ram_gb);
CREATE INDEX benchmarks_source ON benchmarks(source_id);
