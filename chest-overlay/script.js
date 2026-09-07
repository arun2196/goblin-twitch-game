const WORKER_URL =
  "https://gobbo-king-s2.arun-tiwari2196.workers.dev";

const CARD_BACK_URL =
  "https://pub-9b231b5eda2a4b3bb2406666eef9132f.r2.dev/Cards/card_back_3.png";

const POLL_INTERVAL_MS = 2000;

const FADE_IN_MS = 500;
const WAIT_BEFORE_FLIP_MS = 700;
const FLIP_DURATION_MS = 750;
const CARD_DISPLAY_MS = 4000;
const FADE_OUT_MS = 500;

const cardWrapper =
  document.getElementById("card-wrapper");

const cardBackImage =
  document.getElementById("card-back-image");

const revealedCard =
  document.getElementById("revealed-card");

let lastEventId = 0;
let revealRunning = false;
let overlayReady = false;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function preloadImage(imageElement, imageUrl) {
  imageElement.src = imageUrl;

  try {
    await imageElement.decode();
  } catch (error) {
    console.warn(
      "Image could not be decoded in advance:",
      imageUrl,
      error
    );
  }
}

async function revealCard(event) {
  if (revealRunning) {
    return;
  }

  if (!event?.image_url) {
    console.error(
      "Chest event has no image_url:",
      event
    );
    return;
  }

  revealRunning = true;

  await Promise.all([
    preloadImage(
      cardBackImage,
      CARD_BACK_URL
    ),

    preloadImage(
      revealedCard,
      event.image_url
    ),
  ]);

  revealedCard.alt =
    event.item_name || "Revealed Gobbo card";

  cardWrapper.classList.remove(
    "visible",
    "flipped"
  );

  cardWrapper.setAttribute(
    "aria-hidden",
    "true"
  );

  void cardWrapper.offsetWidth;

  cardWrapper.classList.add("visible");

  cardWrapper.setAttribute(
    "aria-hidden",
    "false"
  );

  await wait(
    FADE_IN_MS + WAIT_BEFORE_FLIP_MS
  );

  cardWrapper.classList.add("flipped");

  await wait(
    FLIP_DURATION_MS + CARD_DISPLAY_MS
  );

  cardWrapper.classList.remove("visible");

  await wait(FADE_OUT_MS);

  cardWrapper.classList.remove("flipped");

  cardWrapper.setAttribute(
    "aria-hidden",
    "true"
  );

  revealedCard.removeAttribute("src");

  revealRunning = false;
}

async function getLatestEventId() {
  const response = await fetch(
    `${WORKER_URL}/overlay/chest/latest-id`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Latest event request failed: ${response.status}`
    );
  }

  const data = await response.json();

  return Number(data.id || 0);
}

async function getNextEvent() {
  const response = await fetch(
    `${WORKER_URL}/overlay/chest/next?after=${lastEventId}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Chest polling failed: ${response.status}`
    );
  }

  return response.json();
}

async function initializeOverlay() {
  try {
    await preloadImage(
      cardBackImage,
      CARD_BACK_URL
    );

    /*
      Start from the current newest event.

      This prevents an old chest from appearing
      when OBS first opens the overlay.
    */
    lastEventId = await getLatestEventId();

    overlayReady = true;

    console.log(
      "Chest overlay ready. Starting after event:",
      lastEventId
    );
  } catch (error) {
    console.error(
      "Chest overlay initialization failed:",
      error
    );
  }
}

async function pollChestEvents() {
  if (!overlayReady || revealRunning) {
    return;
  }

  try {
    const event = await getNextEvent();

    if (!event?.id) {
      return;
    }

    lastEventId = Number(event.id);

    await revealCard(event);
  } catch (error) {
    console.error(
      "Chest overlay polling failed:",
      error
    );
  }
}

initializeOverlay();

setInterval(
  pollChestEvents,
  POLL_INTERVAL_MS
);