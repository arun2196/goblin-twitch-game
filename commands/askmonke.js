const MAX_QUESTION_LENGTH = 220;

const MONKE_ANSWERS = {
  yes: [
    "oo oo... aa aa... OOO! oo-oo-oo... aaaah... mhm. OO!",
    "OOO OOO AA! aa aa... oo... ooOOO... AAH! oo.",
    "hmm... oo... aa... oo oo oo... AAA! OOO! aa.",
    "oo aa oo aa... OOOO... aa aa aa... oo!",
    "OO! oo oo... aa-aa-aa... OOO OOO! mhm... aa.",
    "oo... oo... AAAA... ooOO... aa aa... OOO!",
    "OOO! AA! oo oo oo... aaah... oo... OOOO!",
    "mm... oo... aa... OOO! oo aa oo aa... mhm."
  ],

  no: [
    "oo... aa... oo... AAA! AA AA! ooOOO... grr... aa.",
    "AA AA AA! OOO! oo oo... aa... HNNGH... oo.",
    "ooOO... aa aa... OOOO! AA! AA! oo...",
    "mm-mm... oo... aa... AAAA! oo oo... grrr.",
    "OO! AA! oo-oo-oo... aa aa... OOO! hrrm.",
    "oo... oo... aa... AA AA AA! OOOO... oo.",
    "HNNGH... oo aa... oo... AAA! AAA! ooOO.",
    "aa... oo... aa... OOO! OOO! AA! mm-mm."
  ],

  confused: [
    "oo...? aa...? oo oo...? AAA...? oo... huh... aa?",
    "oo... aa... krrrr... ooOO... aa...? OOO?",
    "AA? OO? oo aa... oo...? aaaah...? mm?",
    "oo oo... aa... ooOO... OOO...? aa aa...?",
    "hmm... oo...? aa...? OOO... aa... oo?",
    "oo... oo... AAA...? mm... oo aa... huh?",
    "OOO? AAA? oo oo...? aa... ooOO...?",
    "aa...? oo...? krrr... OOO...? aa aa?"
  ],

  wisdom: [
    "oo... aa... oo oo... mhm... OOO... aa aa... oo.",
    "hmmm... oo... aa... OOOO... oo... aa... mhm.",
    "oo aa... oo... aa aa... OOO... mm... oo.",
    "OOO... aa... oo oo... hmmm... aa... OOO.",
    "oo... oo... aa... mhm... OOOO... aa aa.",
    "aa... oo... ooOO... hmm... aa... OOO.",
    "oo oo... aa aa... OOO... hrrm... oo.",
    "mm... oo... aa... oo... OOO... aa."
  ],

  banana: [
    "OO OO AA! oo oo oo... AAA! oo... aa aa... OOO!",
    "oo aa oo aa... OOOO! aa aa... ooOO... AAA!",
    "OOO! oo oo... aa... AAAA... oo... ooOO!",
    "aa aa... oo... OOO! OO! aa... oo oo.",
    "ooOO... aa aa aa... OOOO! oo... AAA!",
    "OO! aa... oo oo... AAA... OOO... oo.",
    "aa... oo... oo... OOO OOO! aa aa aa!",
    "OOO... aa aa... ooOO... AAA! oo oo!"
  ],

  chaos: [
    "OOOOOOOO OOO OOO AAA AAA AAAA!! OO AA OO AA! AAAAAAAAA!",
    "AA AA AA! OOOO! OO OO OO! AAAAH! oo oo oo! AAA!",
    "OOO OOO OOO! AAA AAA! OOOOOOO! AA AA AA AA!",
    "oo oo... AAAA! OOO! AAA! OOOO! AAAAAAAAA!",
    "OO AA OO AA OO AA! OOOOOOOO! AAAA! GRRRAAA!",
    "AAAAAAAA! OOO OOO! AA AA! OOOOO! oo oo oo!",
    "OOO! AAA! OOO! AAA! OOOOOOOO! AAAAAAAA!",
    "oo... oo... aa... AAAAAAAAAAAAAAAAA! OOO!"
  ],

  rare: [
    "oo................ aa................ OOOOOOOOOOOOOOOO.",
    "OOOOOO... aa aa... oo oo... AAAA... OOOOOOO...",
    "oo... oo... oo... AAA... OOO... AA... OOOOOOOO.",
    "AAA... oo... aa... OOOO... ooOO... AAAA...",
    "OOOOOOOOOO... aa... oo... AAA... oo oo...",
    "oo aa oo aa oo aa... OOOOOOOOO... AAA!",
    "AA OO AA OO AA OO... OOOOO... AAAA... oo.",
    "oo... aa... OOO... AAA... OOOOOOOOOOOOO!"
  ]
};

const POOL_WEIGHTS = [
  { key: "yes", weight: 22 },
  { key: "no", weight: 22 },
  { key: "confused", weight: 18 },
  { key: "wisdom", weight: 16 },
  { key: "banana", weight: 14 },
  { key: "chaos", weight: 7 },
  { key: "rare", weight: 1 }
];

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function pickWeightedPool() {
  const totalWeight = POOL_WEIGHTS.reduce(
    (sum, entry) => sum + entry.weight,
    0
  );

  let roll = Math.random() * totalWeight;

  for (const entry of POOL_WEIGHTS) {
    roll -= entry.weight;

    if (roll < 0) {
      return entry.key;
    }
  }

  return "confused";
}

function pickMonkeAnswer() {
  const poolKey = pickWeightedPool();
  return pickRandom(MONKE_ANSWERS[poolKey]);
}

export async function handleAskMonke(env, url) {
  const username =
    url.searchParams.get("user")?.trim() || "someone";

  const question =
    url.searchParams.get("question")?.trim() || "";

  if (!question) {
    return new Response(
      `${username}, oo aa? monke require question before monke can access ancient banana wisdom.`
    );
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return new Response(
      `${username}, OOO AA! too many words. monke brain overheating. ask shorter question.`
    );
  }

  const answer = pickMonkeAnswer();

  return new Response(
    `${username}, Monke says: ${answer}`.slice(0, 490)
  );
}