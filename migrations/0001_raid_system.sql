PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raid_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raid_key TEXT NOT NULL,
  raid_title TEXT NOT NULL,
  raid_version INTEGER NOT NULL DEFAULT 1,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'paused',
        'completed',
        'cancelled',
        'error'
      )
    ),

  current_encounter_index INTEGER NOT NULL DEFAULT 0,

  started_by TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paused_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raid_encounter_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raid_run_id INTEGER NOT NULL,

  encounter_key TEXT NOT NULL,
  encounter_index INTEGER NOT NULL,
  encounter_title TEXT NOT NULL,
  encounter_type TEXT NOT NULL,

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

  outcome TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',

  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  announced_at TEXT,
  inputs_opened_at TEXT,
  inputs_closed_at TEXT,
  resolved_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    raid_run_id,
    encounter_index,
    attempt_number
  ),

  FOREIGN KEY (raid_run_id)
    REFERENCES raid_runs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS raid_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raid_run_id INTEGER NOT NULL,
  encounter_run_id INTEGER NOT NULL,

  username TEXT NOT NULL,
  display_name TEXT NOT NULL,

  input_key TEXT NOT NULL,
  command_used TEXT NOT NULL,

  metadata_json TEXT NOT NULL DEFAULT '{}',

  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (
    encounter_run_id,
    username
  ),

  FOREIGN KEY (raid_run_id)
    REFERENCES raid_runs(id)
    ON DELETE CASCADE,

  FOREIGN KEY (encounter_run_id)
    REFERENCES raid_encounter_runs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS raid_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raid_run_id INTEGER NOT NULL,
  encounter_run_id INTEGER,

  event_type TEXT NOT NULL,
  actor TEXT,

  data_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (raid_run_id)
    REFERENCES raid_runs(id)
    ON DELETE CASCADE,

  FOREIGN KEY (encounter_run_id)
    REFERENCES raid_encounter_runs(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_raid_runs_status
ON raid_runs(status);

CREATE INDEX IF NOT EXISTS idx_raid_encounter_runs_active
ON raid_encounter_runs(raid_run_id, status);

CREATE INDEX IF NOT EXISTS idx_raid_entries_encounter
ON raid_entries(encounter_run_id);

CREATE INDEX IF NOT EXISTS idx_raid_events_run
ON raid_events(raid_run_id);