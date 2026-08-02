import csv
import json
import re
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

INPUT_CSV = Path("operations/uesp_delve_pages.csv")
OUTPUT_CSV = Path("operations/generated/delve_notes.csv")

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
            "User-Agent": "GobboDelveBot/1.0 (personal Twitch game data tool)"
        },
    )

    with urlopen(req, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))

    pages = data.get("query", {}).get("pages", [])

    if not pages or pages[0].get("missing"):
        raise ValueError(f"Page not found: {page_title}")

    revisions = pages[0].get("revisions", [])

    if not revisions:
        raise ValueError(f"No revision content found: {page_title}")

    return revisions[0]["slots"]["main"]["content"]


def clean_wiki_text(text: str) -> str:
    if not text:
        return ""

    text = re.sub(
        r"\{\{(?:Quest|Book|NPC|Place) Link\|([^}|]+)(?:\|[^}]*)?\}\}",
        r"\1",
        text,
    )
    text = re.sub(r"\{\{Service Icon\|[^}]+\}\}", "", text)
    text = re.sub(r"\{\{Image Link\|([^}|]+)(?:\|[^}]*)?\}\}", r"\1", text)

    text = re.sub(r"\[\[ON:[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)

    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)

    text = re.sub(r"'''?", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", "", text)

    text = re.sub(r"^\{\|.*?$", "", text, flags=re.M)
    text = re.sub(r"^\|\}.*?$", "", text, flags=re.M)
    text = re.sub(r"^[|!]+", "", text, flags=re.M)

    text = re.sub(r"\s+", " ", text)
    return text.strip(" -|")


def extract_template_field(wikitext: str, field: str) -> str:
    match = re.search(
        rf"^\|{re.escape(field)}\s*=\s*(.*)$",
        wikitext,
        flags=re.M,
    )

    if not match:
        return ""

    return clean_wiki_text(match.group(1).strip())


def extract_section(wikitext: str, section_name: str) -> str:
    pattern = (
        rf"^==\s*{re.escape(section_name)}\s*==\s*$"
        rf"(.*?)(?=^==[^=].*?==\s*$|\Z)"
    )
    match = re.search(pattern, wikitext, flags=re.S | re.M | re.I)
    return match.group(1).strip() if match else ""


def extract_bullets(text: str) -> list[str]:
    bullets = []

    for line in text.splitlines():
        line = line.strip()

        if not line.startswith("*"):
            continue

        cleaned = clean_wiki_text(line.lstrip("*").strip())

        if cleaned:
            bullets.append(cleaned)

    return bullets


def extract_opening_summary(wikitext: str) -> str:
    match = re.search(
        r"\{\{TOCleft\}\}(.*?)(?=^==[^=].*?==\s*$|\Z)",
        wikitext,
        flags=re.S | re.M,
    )

    if match:
        return clean_wiki_text(match.group(1))[:1000]

    start = wikitext.find("}}")

    if start == -1:
        return ""

    fallback = wikitext[start + 2 :]
    fallback = re.split(
        r"^==[^=].*?==\s*$",
        fallback,
        maxsplit=1,
        flags=re.M,
    )[0]

    return clean_wiki_text(fallback)[:1000]


def extract_clearing_bosses(wikitext: str) -> list[str]:
    section = extract_section(wikitext, "Clearing the Dungeon")
    return extract_bullets(section)


def extract_related_quests(wikitext: str) -> list[str]:
    section = extract_section(wikitext, "Related Quests")
    return extract_bullets(section)


def extract_notable_items(wikitext: str) -> list[str]:
    for heading in ("Notable Items", "Notable items"):
        section = extract_section(wikitext, heading)

        if section:
            return extract_bullets(section)

    return []


def extract_notes(wikitext: str) -> list[str]:
    return extract_bullets(extract_section(wikitext, "Notes"))


def parse_delve(
    name: str,
    page_title: str,
    alliance: str,
    input_zone: str,
    wikitext: str,
) -> dict:
    bosses = extract_clearing_bosses(wikitext)
    quests = extract_related_quests(wikitext)
    notable_items = extract_notable_items(wikitext)
    notes = extract_notes(wikitext)

    template_zone = extract_template_field(wikitext, "zone")

    return {
        "name": name,
        "page_title": page_title,
        "alliance": alliance,
        "zone": template_zone or input_zone,
        "place_type": extract_template_field(wikitext, "type"),
        "place_class": extract_template_field(wikitext, "class"),
        "description": extract_template_field(wikitext, "description"),
        "location": extract_template_field(wikitext, "location"),
        "loadtext": extract_template_field(wikitext, "loadtext"),
        "summary": extract_opening_summary(wikitext),
        "bosses": "; ".join(bosses),
        "related_quests": "; ".join(quests),
        "notable_items": "; ".join(notable_items),
        "notes": "; ".join(notes),
    }


def empty_row(name: str, page_title: str, alliance: str, zone: str) -> dict:
    return {
        "name": name,
        "page_title": page_title,
        "alliance": alliance,
        "zone": zone,
        "place_type": "",
        "place_class": "",
        "description": "",
        "location": "",
        "loadtext": "",
        "summary": "",
        "bosses": "",
        "related_quests": "",
        "notable_items": "",
        "notes": "",
    }


def main():
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    with INPUT_CSV.open("r", encoding="utf-8", newline="") as infile:
        rows = list(csv.DictReader(infile))

    output_rows = []

    for index, row in enumerate(rows, start=1):
        name = row["name"].strip()
        page_title = row["page_title"].strip()
        alliance = row.get("alliance", "").strip()
        zone = row.get("zone", "").strip()

        print(f"[{index}/{len(rows)}] Fetching {page_title}...")

        try:
            wikitext = fetch_wikitext(page_title)
            parsed = parse_delve(
                name=name,
                page_title=page_title,
                alliance=alliance,
                input_zone=zone,
                wikitext=wikitext,
            )
            output_rows.append(parsed)
        except Exception as exc:
            print(f"ERROR: {page_title}: {exc}")
            output_rows.append(
                empty_row(
                    name=name,
                    page_title=page_title,
                    alliance=alliance,
                    zone=zone,
                )
            )

        time.sleep(0.5)

    fieldnames = [
        "name",
        "page_title",
        "alliance",
        "zone",
        "place_type",
        "place_class",
        "description",
        "location",
        "loadtext",
        "summary",
        "bosses",
        "related_quests",
        "notable_items",
        "notes",
    ]

    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as outfile:
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Done. Wrote {len(output_rows)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()