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
, drop_weight INTEGER NOT NULL DEFAULT 100, min_gold_bonus INTEGER NOT NULL DEFAULT 0, power INTEGER NOT NULL DEFAULT 1);
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
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE dungeon_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'flex',
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE eso_dungeon_bosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dungeon_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  boss_order INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (dungeon_id) REFERENCES eso_dungeons(id)
);
CREATE TABLE eso_dungeons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL,
  minimum_level INTEGER NOT NULL DEFAULT 10,
  is_dlc INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE eso_dungeon_notes (
  dungeon_id INTEGER PRIMARY KEY,
  loadtext TEXT,
  summary TEXT,
  quest_note TEXT,
  normal_enemies TEXT,
  elite_enemies TEXT,
  minibosses TEXT,
  bosses TEXT,
  sets_note TEXT,
  FOREIGN KEY (dungeon_id) REFERENCES eso_dungeons(id)
);
CREATE TABLE eso_heroes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL UNIQUE,
    title TEXT,

    race TEXT,
    alliance TEXT,

    role TEXT NOT NULL CHECK (role IN ('tank', 'healer', 'dd', 'flex')),

    power_bonus INTEGER NOT NULL DEFAULT 0,
    spawn_weight INTEGER NOT NULL DEFAULT 100,

    description TEXT,
    personality TEXT,
    catchphrase TEXT,

    image_url TEXT,

    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE dungeon_special_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT UNIQUE NOT NULL,
  event_name TEXT NOT NULL,
  universe TEXT NOT NULL,
  trigger_chance REAL NOT NULL DEFAULT 0.01,
  bonus_gold_min INTEGER NOT NULL DEFAULT 0,
  bonus_gold_max INTEGER NOT NULL DEFAULT 0,
  success_prompt TEXT NOT NULL,
  failure_prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE command_cooldowns (
  command_key TEXT PRIMARY KEY,
  last_used_at INTEGER NOT NULL
);
CREATE TABLE player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  alias TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE ask_gobbo_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE eventsub_messages (
  message_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE dungeon_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'started',

  queue_snapshot_json TEXT,
  party_json TEXT,
  selected_queue_ids_json TEXT,
  remaining_queue_json TEXT,

  encounter_json TEXT,
  special_event_json TEXT,
  player_items_json TEXT,
  rewards_json TEXT,
  broken_items_json TEXT,

  success INTEGER,
  success_chance INTEGER,

  fallback_message TEXT,
  commentary TEXT,
  final_message TEXT,

  error TEXT
);
CREATE TABLE dungeon_run_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  queue_id INTEGER,
  username TEXT,
  display_name TEXT,
  story_name TEXT,
  role TEXT,
  selected INTEGER DEFAULT 0,
  reward_amount INTEGER DEFAULT 0,
  item_name TEXT,
  item_id INTEGER,
  item_power INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE gobbo_reputation (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  total_gold_gifted INTEGER NOT NULL DEFAULT 0,
  gift_count INTEGER NOT NULL DEFAULT 0,
  largest_gift INTEGER NOT NULL DEFAULT 0,
  first_gift_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_gift_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE raid_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  active INTEGER NOT NULL DEFAULT 0,
  raid_key TEXT NOT NULL DEFAULT 'lebro_finale',

  encounter_index INTEGER NOT NULL DEFAULT 0,
  encounter_status TEXT NOT NULL DEFAULT 'inactive',

  attempt_number INTEGER NOT NULL DEFAULT 0,

  join_opens_at TEXT,
  resolve_at TEXT,
  next_action_at TEXT,

  started_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE TABLE raid_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raid_key TEXT NOT NULL,
  encounter_index INTEGER NOT NULL,

  username TEXT NOT NULL,
  display_name TEXT NOT NULL,

  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt INTEGER NOT NULL DEFAULT 0,

  UNIQUE (
    raid_key,
    encounter_index,
    username
  )
);
CREATE TABLE raid_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  raid_key TEXT NOT NULL,
  encounter_index INTEGER NOT NULL,
  encounter_key TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,

  goblin_count INTEGER NOT NULL,

  player_roll INTEGER NOT NULL,
  enemy_roll INTEGER NOT NULL,
  player_modifier INTEGER NOT NULL DEFAULT 0,
  enemy_modifier INTEGER NOT NULL DEFAULT 0,

  success INTEGER NOT NULL,

  commentary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE raid_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    raid_key TEXT NOT NULL,

    encounter_index INTEGER NOT NULL,
    encounter_name TEXT NOT NULL,

    attempt_number INTEGER NOT NULL,

    goblin_count INTEGER NOT NULL,

    player_roll INTEGER NOT NULL,
    enemy_roll INTEGER NOT NULL,

    player_modifier INTEGER NOT NULL DEFAULT 0,
    enemy_modifier INTEGER NOT NULL DEFAULT 0,

    player_total INTEGER NOT NULL,
    enemy_total INTEGER NOT NULL,

    success INTEGER NOT NULL,

    gold_reward INTEGER NOT NULL DEFAULT 0,

    commentary TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, participants_json TEXT, player_formula TEXT, enemy_formula TEXT, momentum INTEGER NOT NULL DEFAULT 0, prompt TEXT);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_players_gold ON players(gold DESC);
CREATE INDEX idx_inventory_username ON inventory(username);
CREATE INDEX idx_duels_target_status ON duels(target, status);
CREATE INDEX idx_relics_username ON relics(username);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_player_aliases_username
ON player_aliases(username);
