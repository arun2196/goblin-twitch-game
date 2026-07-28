PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS story_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  story_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,

  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  settings_json TEXT,

  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,

  UNIQUE (story_key, version)
);

CREATE TABLE IF NOT EXISTS story_scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  story_definition_id INTEGER NOT NULL,

  scene_key TEXT NOT NULL,
  scene_order INTEGER NOT NULL,

  title TEXT NOT NULL,
  scene_type TEXT NOT NULL,

  narrator_text TEXT,
  inputs_json TEXT NOT NULL DEFAULT '[]',

  dialogue_json TEXT NOT NULL DEFAULT '{}',
  mechanics_json TEXT NOT NULL DEFAULT '{}',
  rewards_json TEXT NOT NULL DEFAULT '{}',
  branching_json TEXT NOT NULL DEFAULT '{}',
  presentation_json TEXT NOT NULL DEFAULT '{}',

  enabled INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (story_definition_id, scene_key),
  UNIQUE (story_definition_id, scene_order),

  FOREIGN KEY (story_definition_id)
    REFERENCES story_definitions(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  story_definition_id INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (
      status IN (
        'ready',
        'active',
        'paused',
        'completed',
        'cancelled',
        'error'
      )
    ),

  current_scene_order INTEGER NOT NULL DEFAULT 1,

  started_at TEXT,
  paused_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (story_definition_id)
    REFERENCES story_definitions(id)
);

CREATE TABLE IF NOT EXISTS story_scene_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  story_run_id INTEGER NOT NULL,
  story_scene_id INTEGER NOT NULL,

  scene_order INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,

  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (
      status IN (
        'waiting',
        'announced',
        'accepting_inputs',
        'locked',
        'resolving',
        'resolved',
        'skipped',
        'error'
      )
    ),

  inputs_open INTEGER NOT NULL DEFAULT 0,

  started_at TEXT,
  announced_at TEXT,
  inputs_opened_at TEXT,
  inputs_closed_at TEXT,
  resolved_at TEXT,

  outcome TEXT,
  result_json TEXT,
  rewards_json TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    story_run_id,
    story_scene_id,
    attempt_number
  ),

  FOREIGN KEY (story_run_id)
    REFERENCES story_runs(id)
    ON DELETE CASCADE,

  FOREIGN KEY (story_scene_id)
    REFERENCES story_scenes(id)
);

CREATE TABLE IF NOT EXISTS story_scene_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  story_run_id INTEGER NOT NULL,
  scene_run_id INTEGER NOT NULL,

  username TEXT NOT NULL,
  display_name TEXT,

  input_key TEXT NOT NULL,
  command_used TEXT NOT NULL,

  metadata_json TEXT NOT NULL DEFAULT '{}',

  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (scene_run_id, username),

  FOREIGN KEY (story_run_id)
    REFERENCES story_runs(id)
    ON DELETE CASCADE,

  FOREIGN KEY (scene_run_id)
    REFERENCES story_scene_runs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  story_run_id INTEGER NOT NULL,
  scene_run_id INTEGER,

  event_type TEXT NOT NULL,
  actor TEXT,

  data_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (story_run_id)
    REFERENCES story_runs(id)
    ON DELETE CASCADE,

  FOREIGN KEY (scene_run_id)
    REFERENCES story_scene_runs(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_story_definitions_key_status
ON story_definitions (story_key, status);

CREATE INDEX IF NOT EXISTS idx_story_scenes_definition_order
ON story_scenes (story_definition_id, scene_order);

CREATE INDEX IF NOT EXISTS idx_story_runs_status
ON story_runs (status);

CREATE INDEX IF NOT EXISTS idx_story_scene_runs_active
ON story_scene_runs (story_run_id, status);

CREATE INDEX IF NOT EXISTS idx_story_scene_entries_scene
ON story_scene_entries (scene_run_id);