import { sendTwitchAnnouncement } from "./twitchChat.js";

export const RAID_ENCOUNTERS = [
  {
    key: "treasury_construct",
    name: "Treasury Construct",

    minGold: 1000,
    maxGold: 1600,

    joinAnnouncements: [
      "🏦 The shattered gates of the Imperial Treasury burst open with a deafening roar. From a mountain of confiscated gold and forgotten riches, the Treasury Construct slowly rises, its ancient gears grinding after centuries of silent watch. Forged to guard Emperor LeBro's vaults until the end of time, the colossal guardian fixes its glowing eyes upon the invading Goblin Army. Beyond this chamber lies the road deeper into the fortress... but first, the Emperor's greatest treasure must be defended. Type !raid and bring down the Treasury Construct!",
    ],

    successAnnouncements: [
      "🏆 The Treasury Construct collapses in a deafening roar, burying the chamber beneath an avalanche of gold. As the Goblin Army claims the Emperor's forgotten hoard, scouts uncover a hidden passage leading deeper into the fortress. But the celebration is short-lived... the corridor ahead is cursed by an ancient evil known only as... Eight Unskippable Ads.",
    ],

    failureAnnouncements: [
      "💀 The Goblin Army's opening charge crashes against the Construct's golden armour. With a single sweep of its colossal vault-shield, the guardian scatters the attackers—but sharp-eyed engineers have already spotted weaknesses between the enchanted plates.",
      "⚙️ The Treasury Construct absorbs the opening assault and answers by hurling locked chests across the battlefield. The army withdraws while goblin engineers begin dismantling something that was probably structurally important.",
      "🏦 The guardian slams both fists into the treasury floor, collapsing bridges of gold beneath the first wave. The armour remains intact, but the goblins now understand how the ancient Construct moves.",
    ],

    secondFailureAnnouncements: [
      "⚙️ The goblin engineers breach the Construct's outer plating, exposing glowing gears beneath. Furious, the guardian tears itself free from its chains and rampages through the treasury, forcing the battered army to retreat.",
      "💰 The Construct's mighty vault-shield finally splinters apart, drawing cheers from the Goblin Army. The celebration ends abruptly as a second shield unfolds from within its armour.",
      "🏦 The engineers disable one of the Construct's enormous legs, but it simply drags itself forward through the treasure. The ancient guardian refuses to abandon its post.",
    ],

    finalFailureAnnouncements: [
      "🔥 The Treasury Construct staggers beneath the weight of its shattered armour. Its molten core burns brighter than ever, spilling rivers of gold across the chamber. One final assault may bring the giant down.",
      "⚙️ Half the guardian lies scattered across the Imperial Treasury, yet its blazing core drags the broken shell forward with relentless determination. The Goblin Army forms ranks for the decisive blow.",
      "💰 Every thunderous step leaves another piece of enchanted armour behind. The Treasury Construct can barely stand, but it refuses to surrender the Emperor's vault. The exhausted Goblin Army prepares one final charge.",
    ],

    retryFailureAnnouncements: [
      "⚙️ The Treasury Construct still stands, but each assault leaves fresh cracks in its ancient armour. The Goblin Army prepares to strike again.",
      "💰 Gold continues to spill from the guardian's broken shell. Victory draws closer as the increasingly determined goblins regroup.",
    ],

    noParticipantsAnnouncement:
      "🏦 The Treasury Construct awakens to defend the Imperial Treasury, assumes a perfect battle stance... and finds nobody there. After several awkward minutes, it quietly resumes pretending to be an expensive statue.",
  },

  {
    key: "unskippable_ads",
    name: "Eight Unskippable Ads",

    minGold: 1000,
    maxGold: 1600,

    joinAnnouncements: [
      "📺 The hidden passage ends abruptly before an enchanted corridor lined with towering crystal screens. Ancient runes flare to life as a booming voice announces, \"Your adventure will begin after these short messages.\" One by one, eight magical advertisements spring into existence, each somehow louder and longer than the last. Legend claims countless adventurers turned back rather than endure them all. The Goblin Army has come too far to surrender to sponsored content. Type !raid and survive the Eight Unskippable Ads!",
    ],

    successAnnouncements: [
      "📺 The eighth and final advertisement flickers, stutters, and finally goes dark. A deafening silence fills the corridor as the Goblin Army stumbles forward, forever changed by what they have endured. Behind the shattered crystal screens lies an ancient vault sealed for centuries. Whatever Emperor LeBro hid inside the Forgotten Cache, it was apparently worth protecting... almost as much as premium ad revenue.",
    ],

    failureAnnouncements: [
      "📢 The Goblin Army survives six advertisements before the corridor suddenly resets. The cheerful announcer enthusiastically welcomes everyone back to the first ad. Several goblins immediately begin searching for a mute button.",
      "▶️ The raiders charge the enchanted screens, only to discover that every advertisement contains another advertisement inside it. The assault collapses beneath an unbearable wave of jingles, testimonials, and suspiciously limited-time offers.",
      "📺 Seven advertisements fall... only for the eighth to reveal itself as an extended director's cut with mandatory viewer feedback afterwards. The exhausted Goblin Army retreats in stunned disbelief.",
    ],

    secondFailureAnnouncements: [
      "📢 Goblin engineers successfully mute three enchanted screens, but the remaining five somehow become twice as loud. Morale suffers greatly, though the magical barrier is beginning to weaken.",
      "▶️ The army finally reaches the last advertisement, only for the progress bar to stop forever at ninety-nine percent. Several goblins attempt to intimidate the loading icon before regrouping.",
      "📺 Half the advertisements are destroyed, but the remaining screens merge into one enormous premium presentation complete with bonus content. The army retreats while someone desperately searches for the terms and conditions.",
    ],

    finalFailureAnnouncements: [
      "📺 The enchanted screens crack and spark beneath the relentless assault. The presenters begin stuttering, the jingles fall hopelessly out of tune, and the magical advertising network struggles to remain online.",
      "🔇 Only a single advertisement remains, but it restarts every time the goblins reach the final second. The exhausted army prepares itself for one last viewing.",
      "▶️ The progress bar inches toward completion... freezes... rewinds... and begins again. The sponsored blockade is on the verge of collapse, but one final assault is needed to skip the unskippable.",
    ],

    retryFailureAnnouncements: [
      "📢 The advertisements continue their relentless sales pitch, but the enchanted screens are beginning to flicker under the Goblin Army's assault.",
      "▶️ Another attempt fails! Somewhere deep within the corridor, an unseen voice cheerfully asks everyone to 'please continue watching.'",
    ],

    noParticipantsAnnouncement:
      "📺 All eight advertisements play to an empty corridor. Deprived of an audience, the enchanted targeting algorithm becomes hopelessly confused and spends the next hour advertising goblin-sized furniture to itself.",
  },

  {
    key: "forgotten_cache",
    name: "Forgotten Cache",

    minGold: 2000,
    maxGold: 3000,

    joinAnnouncements: [
      "🗝️ Beyond the shattered crystal screens lies an ancient vault untouched for centuries. As the Goblin Army steps inside, rows of forgotten relics, sealed treasure chests, and towering stone guardians awaken beneath glowing Imperial runes. This is the Forgotten Cache, where Emperor LeBro has safeguarded the Empire's oldest secrets since long before the Goblin Kingdom existed. Somewhere within these halls lies the knowledge needed to reach the heart of the fortress. Type !raid and uncover the Forgotten Cache!",
    ],

    successAnnouncements: [
      "🗝️ The final seal shatters and the Forgotten Cache slowly swings open. Beyond mountains of forgotten treasure lie ancient maps of the Imperial Fortress, hidden passages, and the Emperor's own battle plans. One route leads directly to a grand arena deep within the Inner Fortress, where two names are inscribed above the gates: Lina and Catch. Gathering both treasure and knowledge, the Goblin Army marches onward to face the Twin Champions.",
    ],

    failureAnnouncements: [
      "🔒 The expedition reaches the ancient vault doors, only for glowing Imperial wards to erupt to life and hurl the Goblin Army back through the ruins. The Cache remains sealed, but its ancient defenses have revealed themselves.",
      "🗝️ The goblins force open the first colossal lock... only to discover an entire corridor of enchanted locks waiting behind it. Stone guardians awaken from centuries of slumber, forcing the expedition to retreat.",
      "📦 The Goblin Army nearly reaches the treasure when the chamber shifts like a living puzzle, sealing the Forgotten Cache behind another wall of ancient stone. The engineers begin sketching increasingly questionable maps.",
    ],

    secondFailureAnnouncements: [
      "🔒 The goblin engineers dismantle several Imperial wards, but the stone guardians slowly rebuild themselves from shattered fragments. Even so, entire sections of the Cache's magical defenses are beginning to fail.",
      "🗝️ The expedition reaches the central seal, but every enchanted key shatters at once. The retreat is orderly... except for one engineer who insists the answer is simply using an even bigger key.",
      "📦 The ancient vault doors finally begin to open, revealing another immense vault hidden directly behind them. The Goblin Army stares in complete silence before agreeing to try again.",
    ],

    finalFailureAnnouncements: [
      "✨ The Imperial wards flicker one by one as their magic begins to fail. The guardians are cracked, the locks are broken, and the Forgotten Cache is finally beginning to yield its secrets.",
      "🔓 Only the central seal still stands. The battered stone guardians struggle to hold formation as the Goblin Army prepares one final expedition into the ancient vault.",
      "💰 Golden light spills through the fractured vault doors. The Forgotten Cache is exposed, its defenses are collapsing, and victory is almost within reach.",
    ],

    retryFailureAnnouncements: [
      "🔒 The Forgotten Cache remains sealed, but its ancient wards grow weaker with every assault.",
      "🗝️ Another lock falls, another ward fades. The Goblin Army regroups for another expedition.",
    ],

    noParticipantsAnnouncement:
      "🗝️ The Forgotten Cache opens for the first time in centuries... waits patiently for explorers... then quietly seals itself again, concluding that perhaps today simply wasn't the day.",
  },

  {
    key: "twin_champions",
    name: "Twin Champions",

    minGold: 2000,
    maxGold: 3000,

    joinAnnouncements: [
      "⚔️ Guided by the maps recovered from the Forgotten Cache, the Goblin Army enters the Grand Arena at the heart of the Inner Fortress. Waiting beneath the Imperial banners stand two familiar faces: Lina and Catch, the celebrated runners-up of Season 1 and the Emperor's most trusted champions. Together they have defended this gate countless times, their teamwork spoken of throughout the kingdom. They exchange a silent nod, raise their weapons, and prepare to test whether the Goblin Army is truly worthy to continue. Type !raid and challenge the Twin Champions!",
    ],

    successAnnouncements: [
      "🏆 After a battle worthy of legend, Lina and Catch exchange one final nod before lowering their weapons. 'You have earned this victory,' they declare as they step aside with honor, their duty to the Emperor fulfilled. The massive gates of the Inner Fortress slowly grind open, revealing a corridor where the walls bend, the air shimmers, and reality itself refuses to remain still. Emperor LeBro's final magical defenses await within the Hall of Broken Realities.",
    ],

    failureAnnouncements: [
      "⚔️ The Goblin Army charges with overwhelming confidence, but Lina and Catch answer with flawless teamwork. One intercepts every strike while the other punishes every opening, sending the battered raiders retreating from the arena.",
      "🛡️ Catch draws the army into the center of the arena while Lina circles with perfect timing. The trap closes effortlessly, and the Goblin Army is forced to withdraw before the champions can fully surround them.",
      "💀 The Twin Champions move as though sharing a single heartbeat. Every feint is answered, every charge anticipated, and every weakness exploited. The Goblin Army retreats, already searching for a way to break their perfect rhythm.",
    ],

    secondFailureAnnouncements: [
      "⚔️ For the first time, the Goblin Army manages to separate Lina and Catch. Though the champions quickly adapt, their legendary coordination is no longer flawless. Victory suddenly feels possible.",
      "🛡️ Catch's defense finally begins to buckle beneath the relentless assault, but Lina steps into the breach without hesitation. The army retreats knowing that if the champions can be divided again, the path may finally open.",
      "💀 Lina is driven back while Catch is nearly surrounded. The champions narrowly recover their formation, but the Goblin Army has discovered the weakness hidden within their greatest strength.",
    ],

    finalFailureAnnouncements: [
      "🔥 Lina and Catch stand back-to-back in the center of the arena, exhausted but unshaken. Their armour bears the scars of countless battles, yet neither champion is willing to abandon their post.",
      "⚔️ The Twin Champions can no longer maintain the effortless rhythm that once made them unstoppable. Every exchange pushes them another step toward the gates they have sworn to defend.",
      "🛡️ Catch's shield is splintered, Lina's weapon chipped, and both champions are breathing heavily. The Goblin Army gathers for one final assault that will decide the fate of the Grand Arena.",
    ],

    retryFailureAnnouncements: [
      "⚔️ The Twin Champions stand their ground once more, but their legendary coordination grows weaker with every battle.",
      "🛡️ Lina and Catch refuse to yield. The Goblin Army regroups, determined to prove itself worthy of the path ahead.",
    ],

    noParticipantsAnnouncement:
      "⚔️ Lina and Catch arrive at the Grand Arena precisely on time, exchange an encouraging nod, and wait for challengers. After several awkward minutes, they quietly congratulate each other on another completely uncontested victory.",
  },

  {
    key: "broken_realities",
    name: "Hall of Broken Realities",

    minGold: 2400,
    maxGold: 3600,

    joinAnnouncements: [
      "🌀 Beyond the gates of the Inner Fortress lies a corridor unlike any built by mortal hands. Walls twist into impossible shapes, doors open onto endless skies, and every reflection reveals a different fate for the Goblin Kingdom. Here, Emperor LeBro's greatest court mages wove reality itself into a final defense. Every wrong step leads to another timeline. Every correct path creates two more. To reach the throne, the Goblin Army must survive the Hall of Broken Realities... and prove that their destiny is stronger than fate itself. Type !raid and enter the Hall of Broken Realities!",
    ],

    successAnnouncements: [
      "✨ One by one, the fractured timelines collapse into nothingness until only a single reality remains. As the Hall finally surrenders, the impossible corridors dissolve to reveal a magnificent throne room beyond. Emperor LeBro appears to stand waiting upon the Imperial Throne... yet something feels strangely wrong. His gaze never shifts. His breath never stirs. The Goblin Army advances cautiously, unaware that one final illusion still stands between them and the true Emperor.",
    ],

    failureAnnouncements: [
      "🌀 The Goblin Army marches confidently into the Hall, only for reality itself to splinter beneath their feet. Some warriors emerge moments later, others swear they wandered the corridors for years. The Hall quietly rearranges itself as the battered expedition regroups.",
      "🌌 Reflections step out of polished mirrors and become living warriors. The Goblin Army is forced to battle countless alternate versions of itself before reality mercifully throws everyone back to the entrance.",
      "✨ The expedition reaches what appears to be the end of the Hall... only for the fortress to twist around them. Doors become walls, staircases lead into the sky, and the throne room vanishes once again.",
    ],

    secondFailureAnnouncements: [
      "🌀 Entire timelines begin collapsing beneath the Goblin Army's relentless advance. The Hall struggles to maintain its impossible magic, but every destroyed reality somehow gives birth to another bizarre path.",
      "🌌 Cracks spread through space itself. Alternate worlds blink out one after another, and for the first time, the Hall's ancient enchantments begin to falter beneath the Goblin Army's determination.",
      "✨ The goblins slowly learn to read the shifting corridors. Though reality continues to fight back, the Hall can no longer hide its true path for long.",
    ],

    finalFailureAnnouncements: [
      "🔥 The Hall trembles violently as its magic begins to unravel. Entire realities collapse into shimmering fragments, leaving only a handful of unstable paths leading toward the throne.",
      "🌀 Reality itself is beginning to lose the battle. The impossible corridors flicker between countless versions before struggling to hold a single shape. The Goblin Army prepares one final march.",
      "🌌 Only one fractured rift remains between the Goblin Army and the Imperial Throne. One final assault will determine which reality becomes history.",
    ],

    retryFailureAnnouncements: [
      "🌀 Another impossible timeline collapses. The Hall grows weaker with every assault.",
      "🌌 Reality bends once more, but the Goblin Army has begun to master its impossible maze.",
    ],

    noParticipantsAnnouncement:
      "🌀 The Hall opens across a thousand possible realities. In every single one, the Goblin Army decides today is an excellent day to stay home. Slightly disappointed, reality folds itself back together.",
  },

  {
    key: "lebro_simulacrum",
    name: "Simulacrum of Emperor LeBro",

    minGold: 3200,
    maxGold: 4400,

    joinAnnouncements: [
      "👑 The impossible corridors finally give way to a magnificent throne room bathed in golden light. Upon the Imperial Throne sits Emperor LeBro himself, calm and unmoving. As the Goblin Army approaches, the figure slowly rises and draws its blade. \"If you cannot overcome my reflection,\" a voice echoes through the chamber, \"you are not yet worthy to stand before the Emperor.\" The throne room trembles as the Simulacrum of Emperor LeBro steps forward—the final guardian forged by ancient Imperial magic. Type !raid and challenge the Emperor's Simulacrum!",
    ],

    successAnnouncements: [
      "👑 The Simulacrum lowers its blade as cracks of golden light spread across its enchanted form. For a brief moment, it offers a respectful nod before dissolving into countless shimmering fragments. The illusion fades, revealing a hidden passage beyond the false throne. At the end of it stands the true Imperial Throne... where Emperor LeBro awaits, not as a shadow nor an illusion, but as the rightful guardian of the Goblin Crown.",
    ],

    failureAnnouncements: [
      "👑 The Simulacrum anticipates every movement with impossible precision, answering each strike before it is made. The Goblin Army is forced back, realizing this guardian carries all the Emperor's skill without a trace of hesitation.",
      "⚔️ Every attack is calmly deflected as though the Simulacrum has already seen the battle unfold countless times. The Goblin Army retreats, searching for a flaw in the perfect guardian.",
      "✨ With a single sweep of its blade, the Simulacrum fills the throne room with shimmering Imperial illusions. Surrounded on every side, the Goblin Army withdraws to prepare another assault.",
    ],

    secondFailureAnnouncements: [
      "👑 Tiny fractures begin spreading across the Simulacrum's enchanted armour. Though its movements remain flawless, the Goblin Army has finally proven that even perfect magic can be worn down.",
      "⚔️ For the briefest instant, the Simulacrum flickers between illusion and reality before regaining its form. The moment passes quickly—but the Goblin Army knows the guardian is beginning to weaken.",
      "✨ Golden light spills from fresh cracks across the Simulacrum's body. Ancient magic struggles to maintain the Emperor's perfect image as another assault comes to an end.",
    ],

    finalFailureAnnouncements: [
      "🔥 The Simulacrum's once flawless form is now held together by little more than fading enchantments. Every strike sends another shower of golden light across the throne room. One final assault may finally break the illusion.",
      "👑 The Imperial guardian raises its blade once more, but shimmering fractures race across its entire body. The ancient magic protecting the throne is close to exhaustion.",
      "⚔️ Barely sustained by centuries-old enchantments, the Simulacrum stands before the throne one last time. The Goblin Army gathers for the battle that will finally reveal the true Emperor.",
    ],

    retryFailureAnnouncements: [
      "👑 The Simulacrum still stands, but the ancient magic sustaining it grows weaker with every battle.",
      "⚔️ Golden fractures continue spreading across the Emperor's magical guardian. The Goblin Army prepares another challenge.",
    ],

    noParticipantsAnnouncement:
      "👑 The Simulacrum patiently awaits challengers before the empty throne. After a long silence, it quietly sheathes its blade and resumes standing perfectly still, just as it has for countless years.",
  },

  {
    key: "emperors_last_stand",
    name: "Emperor's Last Stand",

    minGold: 5000,
    maxGold: 7000,

    joinAnnouncements: [
      "👑 Beyond the final passage lies the Imperial Throne Room, where centuries of Goblin Emperors have ruled the kingdom. Emperor LeBro rises from the throne as the Goblin Army enters, placing the Goblin Crown beside him before drawing his blade. \"You have overcome every trial placed before you,\" he declares. \"Now only one remains. Show me that you are worthy to lead.\" The throne room falls silent as history itself waits to witness its next chapter. Type !raid and stand before the Emperor!",
    ],

    successAnnouncements: [
      "👑 As the echoes of the final battle fade, Emperor LeBro lowers his blade and smiles. \"Well fought, Goblins. A kingdom deserves an Emperor worthy of its people.\" With honor, he lifts the Goblin Crown from its ancient pedestal and places it upon the new Emperor. The gathered champions, guardians, and heroes of the fortress watch as a new ruler is crowned. Cheers echo through every hall of the Imperial Fortress as Season 2 comes to a glorious close. Long live the Goblin Kingdom!",
    ],

    failureAnnouncements: [
      "👑 Emperor LeBro calmly turns aside every assault with the confidence of one who has defended the Goblin Crown countless times before. The Goblin Army retreats, humbled but more determined than ever.",
      "⚔️ The Emperor meets every challenge head-on, his blade moving with effortless precision. Though the Goblin Army fights bravely, they are forced to withdraw and reflect upon the lessons learned.",
      "🔥 Steel clashes beneath the banners of the Goblin Kingdom, yet the Emperor refuses to surrender the throne. The Goblin Army regroups for another attempt.",
    ],

    secondFailureAnnouncements: [
      "👑 For the first time, Emperor LeBro is forced onto the defensive. Fresh marks appear upon his armour, yet his resolve never wavers. The Goblin Army realizes the impossible may, in fact, be possible.",
      "⚔️ The Emperor yields a single step. It is a tiny victory, but every goblin in the throne room notices. The distance to the Goblin Crown has never felt shorter.",
      "🔥 The throne room bears the marks of a battle worthy of legend. Though the Emperor still stands tall, every exchange demands more of both sides.",
    ],

    finalFailureAnnouncements: [
      "👑 Emperor LeBro stands before the throne with battered armour and a weary smile. Though clearly exhausted, his grip upon the Goblin Crown remains unshaken. One final battle will decide who is worthy to wear it.",
      "⚔️ The Imperial banners sway above a throne room scarred by countless duels. The Emperor and the Goblin Army pause only long enough to prepare for one final clash.",
      "🔥 Silence falls across the throne room. Both the Emperor and the Goblin Army have given everything they possess. The next battle will become legend.",
    ],

    retryFailureAnnouncements: [
      "👑 The Emperor still stands, but every battle brings the Goblin Army one step closer to earning the Crown.",
      "⚔️ Another challenge ends in defeat, yet the Emperor greets the Goblin Army with the same unwavering respect. The final trial continues.",
    ],

    noParticipantsAnnouncement:
      "👑 Emperor LeBro waits patiently within the throne room, the Goblin Crown resting beside him. After a long silence, he smiles to himself and remarks, \"Perhaps the Goblins are still preparing.\"",
  },
];

const RAID_START_ANNOUNCEMENTS = [
  "📯 The war horns echo across the Goblin Kingdom as the gates of the Imperial Fortress slowly swing open. Seven legendary challenges stand between the Goblin Army and the Goblin Crown. From ancient guardians and forgotten vaults to impossible magic and the Emperor himself, every victory will bring the kingdom one step closer to its next ruler. The Season 2 Finale begins now. Glory awaits those who answer the call!",
];

const RAID_COMPLETE_ANNOUNCEMENTS = [
  "👑 The Imperial Fortress grows quiet as a new chapter of Goblin history begins. The trials have been overcome, the Goblin Crown has found a worthy Emperor, and the heroes of the Goblin Army return home with stories that will be told for generations. Thus concludes the Season 2 Finale. Long live the Goblin Kingdom!",
];

function pickRandom(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return null;
  }

  return options[
    Math.floor(Math.random() * options.length)
  ];
}

export function getRaidEncounter(encounterIndex) {
  return RAID_ENCOUNTERS[encounterIndex] || null;
}

function requireRaidEncounter(encounterIndex) {
  const encounter = getRaidEncounter(encounterIndex);

  if (!encounter) {
    throw new Error(
      `Unknown raid encounter index: ${encounterIndex}`
    );
  }

  return encounter;
}

export async function announceRaidStart(env) {
  const message = pickRandom(
    RAID_START_ANNOUNCEMENTS
  );

  await sendTwitchAnnouncement(
    env,
    message,
    "purple"
  );
}

export async function announceRaidJoinOpen(
  env,
  encounterIndex,
  resolveTime
) {
  const encounter =
    requireRaidEncounter(encounterIndex);

  const opening =
    pickRandom(encounter.joinAnnouncements);

  await sendTwitchAnnouncement(
    env,
    `${opening} The assault begins in about 5 minutes.`,
    "blue"
  );
}

export async function announceRaidSuccess(
  env,
  encounterIndex,
  attemptNumber = 1
) {
  const encounter =
    requireRaidEncounter(encounterIndex);

  const messages =
    attemptNumber > 1
      ? encounter.retrySuccessAnnouncements
      : encounter.successAnnouncements;

  const message =
    pickRandom(messages) ||
    pickRandom(encounter.successAnnouncements);

  await sendTwitchAnnouncement(
    env,
    message,
    "green"
  );
}

export async function announceRaidFailure(
  env,
  encounterIndex,
  retryTime,
  attemptNumber = 1
) {
  const encounter =
    requireRaidEncounter(encounterIndex);

  let messages;

  if (attemptNumber === 1) {
    messages =
      encounter.failureAnnouncements;
  } else if (attemptNumber === 2) {
    messages =
      encounter.secondFailureAnnouncements;
  } else {
    messages =
      encounter.finalFailureAnnouncements;
  }

  const failure =
    pickRandom(messages) ||
    pickRandom(
      encounter.retryFailureAnnouncements
    ) ||
    pickRandom(
      encounter.failureAnnouncements
    );

  await sendTwitchAnnouncement(
    env,
    `${failure} The Goblin Army launches its next assault in about 5 minutes.`,
    "orange"
  );
}

export async function announceRaidNoParticipants(
  env,
  encounterIndex,
  retryTime
) {
  const encounter =
    requireRaidEncounter(encounterIndex);

  await sendTwitchAnnouncement(
    env,
    `${encounter.noParticipantsAnnouncement} The heralds sound the muster call again. The assault begins in about 5 minutes.`,
    "orange"
  );
}

export async function announceRaidComplete(env) {
  const message = pickRandom(
    RAID_COMPLETE_ANNOUNCEMENTS
  );

  await sendTwitchAnnouncement(
    env,
    message,
    "purple"
  );
}