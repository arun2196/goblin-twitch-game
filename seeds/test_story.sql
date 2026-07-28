INSERT INTO story_definitions (
  story_key,
  version,
  title,
  description,
  status,
  settings_json,
  published_at
)
VALUES (
  'test_story',
  1,
  'The Extremely Suspicious Door',
  'A small Story Weaver test raid.',
  'published',
  '{}',
  CURRENT_TIMESTAMP
);

INSERT INTO story_scenes (
  story_definition_id,
  scene_key,
  scene_order,
  title,
  scene_type,
  narrator_text,
  inputs_json,
  dialogue_json,
  mechanics_json,
  rewards_json
)
SELECT
  id,
  'suspicious_door',
  1,
  'The Suspicious Door',
  'choice',
  'The Gobbo Army finds a door that is clearly labelled NOT A TRAP.',
  '[
    {
      "key": "open",
      "command": "option1",
      "label": "Open the suspicious door",
      "mode": "choice"
    },
    {
      "key": "kick",
      "command": "option2",
      "label": "Kick the suspicious door",
      "mode": "choice"
    }
  ]',
  '{
    "inputsOpen": "Choose using !option1 or !option2.",
    "success": "The door has been thoroughly defeated.",
    "failure": "The door wins."
  }',
  '{
    "resolver": "majority_choice"
  }',
  '{}'
FROM story_definitions
WHERE story_key = 'test_story'
  AND version = 1;