# Gobbo Voice System

## Flow

Twitch Redeem
↓
EventSub
↓
runAskGobboVoice()
↓
Gemini Response
↓
ElevenLabs TTS
↓
Upload to R2
↓
Queue Sound
↓
OBS Browser Source
↓
Playback

---

## OBS Source

Browser Source URL:

https://YOUR_WORKER/gobbo-player

The player polls:

/gobbo/next-sound

every 2 seconds.

---

## Relevant Files

helpers/gobboVoice.js

helpers/gobboAudio.js

helpers/gobboSoundQueue.js

helpers/r2.js