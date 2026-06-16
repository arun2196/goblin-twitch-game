export function fillTemplate(text, username, delve, difficulty, gold) {
  return text
    .replaceAll("{user}", username)
    .replaceAll("{delve}", delve.name)
    .replaceAll("{zone}", delve.zone)
    .replaceAll("{boss}", delve.boss_name)
    .replaceAll("{difficulty}", difficulty.name)
    .replaceAll("{gold}", String(gold));
}

export function fillDuelText(text, values) {
  return text
    .replaceAll("{A}", values.A || "")
    .replaceAll("{B}", values.B || "")
    .replaceAll("{A_ITEM}", values.A_ITEM || "")
    .replaceAll("{B_ITEM}", values.B_ITEM || "")
    .replaceAll("{WINNER}", values.WINNER || "")
    .replaceAll("{LOSER}", values.LOSER || "")
    .replaceAll("{STAKE}", values.STAKE || "")
    .replaceAll("{ITEM}", values.ITEM || "");
}
