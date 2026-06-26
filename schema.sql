PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE players (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  total_gold_earned INTEGER NOT NULL DEFAULT 0,
  total_gold_gifted INTEGER NOT NULL DEFAULT 0,
  duel_wins INTEGER NOT NULL DEFAULT 0,
  duel_losses INTEGER NOT NULL DEFAULT 0,
  free_chest_date TEXT,
  paid_chests_date TEXT,
  paid_chests_opened INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, delve_failures INTEGER NOT NULL DEFAULT 0, delve_successes INTEGER NOT NULL DEFAULT 0);
CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  uses_left INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, obtained_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE duels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger TEXT NOT NULL,
  target TEXT NOT NULL,
  stake INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
, accepted_at TEXT, result TEXT);
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE items (
  item_key TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  rarity TEXT NOT NULL,
  durability INTEGER NOT NULL DEFAULT 1,
  beats_type TEXT,
  description TEXT
, drop_weight INTEGER NOT NULL DEFAULT 100, min_gold_bonus INTEGER NOT NULL DEFAULT 0);
CREATE TABLE relics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  relic_key TEXT NOT NULL,
  relic_name TEXT NOT NULL,
  obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE combat_rules (
  attacker_type TEXT NOT NULL,
  defender_type TEXT NOT NULL,
  advantage INTEGER NOT NULL
);
CREATE TABLE duel_texts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    attacker_type TEXT,
    defender_type TEXT,
    text TEXT NOT NULL
);
CREATE TABLE delves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    zone TEXT NOT NULL,
    boss_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE delve_difficulties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    weight INTEGER NOT NULL,
    gold_multiplier REAL NOT NULL,
    fail_chance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE delve_commentary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    category TEXT NOT NULL,

    difficulty_name TEXT,

    weight INTEGER NOT NULL DEFAULT 10,

    text TEXT NOT NULL,

    enabled INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_profiles (
    user_id TEXT PRIMARY KEY,

    total_delves INTEGER NOT NULL DEFAULT 0,
    total_gold INTEGER NOT NULL DEFAULT 0,

    delve_successes INTEGER NOT NULL DEFAULT 0,
    delve_failures INTEGER NOT NULL DEFAULT 0,

    total_chests INTEGER NOT NULL DEFAULT 0,

    rare_events INTEGER NOT NULL DEFAULT 0,

    largest_gold_find INTEGER NOT NULL DEFAULT 0,

    title TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id TEXT NOT NULL,

    memory_type TEXT NOT NULL,

    memory_text TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE user_titles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id TEXT NOT NULL,

    title TEXT NOT NULL,

    obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ask_gobbo_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  display_name TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  cost INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE gobbo_sounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sound_url TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE eventsub_messages (
  message_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_players_gold ON players(gold DESC);
CREATE INDEX idx_inventory_username ON inventory(username);
CREATE INDEX idx_duels_target_status ON duels(target, status);
CREATE INDEX idx_relics_username ON relics(username);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_gobbo_sounds_played_id
ON gobbo_sounds (played, id);
