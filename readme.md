# Goblin Twitch RPG

A Twitch-integrated Goblin economy game built on Cloudflare Workers.

Viewers earn gold, collect items, explore dangerous delves, challenge each other to duels, and ask the Goblin Oracle for questionable advice.

The project is designed to run serverlessly on Cloudflare using:

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Twitch EventSub
- Google Gemini
- ElevenLabs

---

## Features

### Economy

- Open treasure chests
- Earn gold
- Collect equipment
- Gift gold to other players
- Richlist leaderboard

### Delves

Random adventures with:

- Difficulty scaling
- Success and failure outcomes
- Dynamic commentary
- Gold rewards and losses

### Duels

Players can:

- Challenge other players
- Wager gold
- Fight using collected items
- Lose durability on equipment

### Ask Gobbo

AI-powered goblin oracle.

Features:

- Gemini-generated responses
- Twitch chat integration
- Optional ElevenLabs narration
- OBS browser source playback

---

## Commands

| Command | Description |
|----------|-------------|
| !chest | Open a treasure chest |
| !gold | View gold |
| !inventory | View inventory |
| !delve | Explore a random delve |
| !challenge | Challenge another goblin |
| !ready | Accept duel |
| !run | Decline duel |
| !gift | Gift gold |
| !inspect | Inspect player |
| !richlist | View leaderboard |
| !askgobbo | Ask Gobbo a question |

---

## Tech Stack

Backend:
- Cloudflare Workers
- JavaScript (ES Modules)

Database:
- Cloudflare D1 (SQLite)

Storage:
- Cloudflare R2

AI:
- Google Gemini
- ElevenLabs

Streaming:
- Twitch EventSub
- StreamElements
- OBS Browser Sources

---

## Installation

See:

- docs/setup.md
- docs/database.md
- docs/twitch-setup.md

---

## License

MIT