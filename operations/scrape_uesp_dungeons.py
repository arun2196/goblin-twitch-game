import csv
import json
import re
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

INPUT_CSV = Path("operations/uesp_dungeon_pages.csv")
OUTPUT_CSV = Path("operations/generated/dungeon_notes.csv")

API_URL = "https://en.uesp.net/w/api.php"


def fetch_wikitext(page_title: str) -> str:
    url = (
        f"{API_URL}?action=query&prop=revisions"
        f"&titles={quote(page_title)}"
        f"&rvslots=main&rvprop=content"
        f"&format=json&formatversion=2"
    )

    req = Request(
        url,
        headers={
            "User-Agent": "GobboDungeonBot/1.0 (personal Twitch game data tool)"
        },
    )

    with urlopen(req, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))

    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        raise ValueError(f"Page not found: {page_title}")

    return pages[0]["revisions"][0]["slots"]["main"]["content"]


def clean_wiki_text(text: str) -> str:
    text = re.sub(r"\[\[ON:[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)

    text = re.sub(r"\{\{Quest Link\|([^}]+)\}\}", r"\1", text)
    text = re.sub(r"\{\{Book Link\|([^}]+)\}\}", r"\1", text)
    text = re.sub(r"\{\{[^}]+\}\}", "", text)

    text = re.sub(r"'''", "", text)
    text = re.sub(r"''", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def extract_template_field(wikitext: str, field: str) -> str:
    match = re.search(rf"\|{re.escape(field)}=(.*)", wikitext)
    if not match:
        return ""

    value = match.group(1).strip()
    return clean_wiki_text(value)


def extract_section(wikitext: str, section_name: str) -> str:
    pattern = rf"=={re.escape(section_name)}==\n(.*?)(?=\n==[^=]|\Z)"
    match = re.search(pattern, wikitext, re.S)
    return match.group(1).strip() if match else ""


def extract_subsection(section_text: str, subsection_name: str) -> str:
    pattern = rf"==={re.escape(subsection_name)}===\n(.*?)(?=\n===[^=]|\Z)"
    match = re.search(pattern, section_text, re.S)
    return match.group(1).strip() if match else ""


def extract_bullets(text: str) -> list[str]:
    bullets = []

    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("*"):
            continue

        line = line.lstrip("*").strip()
        line = clean_wiki_text(line)

        if line:
            bullets.append(line)

    return bullets


def extract_opening_summary(wikitext: str) -> str:
    # Text after {{TOCleft}} until Related Quests.
    match = re.search(r"\{\{TOCleft\}\}(.*?)(?=\n==Related Quests==)", wikitext, re.S)
    if not match:
        return ""

    summary = clean_wiki_text(match.group(1))

    # Keep it reasonably short for AI context.
    return summary[:700]


def extract_sets_note(wikitext: str) -> str:
    match = re.search(r"\{\{ESO Set List\|([^}]+)\}\}", wikitext)
    if not match:
        return ""

    raw = match.group(1)
    parts = [p.strip() for p in raw.split("|")]

    sets = [
        clean_wiki_text(p)
        for p in parts
        if p and "=" not in p and p.lower() not in {"both", "desc"}
    ]

    return "; ".join(sets)


def parse_dungeon(name: str, page_title: str, wikitext: str) -> dict:
    related_quests = extract_section(wikitext, "Related Quests")
    enemies_section = extract_section(wikitext, "Enemies")

    normal_enemies = extract_bullets(
        extract_subsection(enemies_section, "Normal Enemies")
    )
    elite_enemies = extract_bullets(
        extract_subsection(enemies_section, "Elite Enemies")
    )
    minibosses = extract_bullets(
        extract_subsection(enemies_section, "Minibosses")
    )
    bosses = extract_bullets(
        extract_subsection(enemies_section, "Bosses")
    )

    quest_bullets = extract_bullets(related_quests)
    quest_note = quest_bullets[0] if quest_bullets else ""

    return {
        "name": name,
        "page_title": page_title,
        "zone": extract_template_field(wikitext, "zone"),
        "minlevel": extract_template_field(wikitext, "minlevel"),
        "loadtext": extract_template_field(wikitext, "loadtext"),
        "summary": extract_opening_summary(wikitext),
        "quest_note": quest_note,
        "normal_enemies": "; ".join(normal_enemies),
        "elite_enemies": "; ".join(elite_enemies),
        "minibosses": "; ".join(minibosses),
        "bosses": "; ".join(bosses),
        "sets_note": extract_sets_note(wikitext),
    }


def main():
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    with INPUT_CSV.open("r", encoding="utf-8", newline="") as infile:
        rows = list(csv.DictReader(infile))

    output_rows = []

    for row in rows:
        name = row["name"].strip()
        page_title = row["page_title"].strip()

        print(f"Fetching {page_title}...")

        try:
            wikitext = fetch_wikitext(page_title)
            parsed = parse_dungeon(name, page_title, wikitext)
            output_rows.append(parsed)
        except Exception as exc:
            print(f"ERROR: {page_title}: {exc}")
            output_rows.append({
                "name": name,
                "page_title": page_title,
                "zone": "",
                "minlevel": "",
                "loadtext": "",
                "summary": "",
                "quest_note": "",
                "normal_enemies": "",
                "elite_enemies": "",
                "minibosses": "",
                "bosses": "",
                "sets_note": "",
            })

        time.sleep(0.5)

    fieldnames = [
        "name",
        "page_title",
        "zone",
        "minlevel",
        "loadtext",
        "summary",
        "quest_note",
        "normal_enemies",
        "elite_enemies",
        "minibosses",
        "bosses",
        "sets_note",
    ]

    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as outfile:
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Done. Wrote {OUTPUT_CSV}")


if __name__ == "__main__":
    main()