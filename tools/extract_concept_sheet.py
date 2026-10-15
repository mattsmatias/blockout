"""
Cuts individual reference images out of the BLOCKOUT concept sheet.

    python tools/extract_concept_sheet.py

Input : concept/blockout-asset-sheet-v1.png  (1536x1024, AI-generated concept art)
Output: public/assets/concept/<group>/<id>.png  (transparent background, original pixels)
        concept/extracted-contact-sheet.png     (review sheet, 4x nearest)
        src/assets/conceptAssets.generated.ts   (manifest entries)

These are CONCEPT crops. They are fine as portraits / UI icons in dev tools and
previews, but they are NOT game sprites: no 8-direction views, no animation frames,
no common foot anchor, inconsistent scale. See docs/ASSET_AUDIT.md.

Boxes are (x0, y0, x1, y1) in sheet pixels, chosen by hand from a coordinate grid.
Requires Pillow.
"""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "concept" / "blockout-asset-sheet-v1.png"
OUT = ROOT / "public" / "assets" / "concept"
TS_OUT = ROOT / "src" / "assets" / "conceptAssets.generated.ts"
CONTACT = ROOT / "concept" / "extracted-contact-sheet.png"

# group -> list of (id, label, box)
CROPS: dict[str, list[tuple[str, str, tuple[int, int, int, int]]]] = {
    "avatars": [
        ("mack", "Mack", (28, 82, 104, 197)),
        ("nova", "Nova", (262, 82, 338, 202)),
        ("kai", "Kai", (352, 82, 424, 202)),
        ("zoe", "Zoe", (437, 78, 508, 202)),
        ("river", "River", (522, 82, 594, 202)),
        ("leo", "Leo", (697, 78, 772, 202)),
        ("pixel", "Pixel", (792, 78, 868, 202)),
        ("sage", "Sage", (896, 78, 964, 202)),
        ("knox", "Knox", (997, 82, 1063, 202)),
        ("luna", "Luna", (1097, 76, 1172, 202)),
        ("axel", "Axel", (1207, 82, 1283, 202)),
        ("jay", "Jay", (1302, 78, 1368, 202)),
    ],
    "weapons": [
        ("pistol", "Pistol", (30, 470, 70, 520)),
        ("smg", "SMG", (82, 466, 130, 520)),
        ("shotgun", "Shotgun", (138, 466, 190, 520)),
        ("assault-rifle", "Assault Rifle", (198, 466, 256, 520)),
        ("sniper", "Sniper", (264, 466, 322, 520)),
        ("lmg", "LMG", (330, 466, 386, 520)),
        ("rocket-launcher", "Rocket Launcher", (394, 464, 456, 520)),
        ("grenade-launcher", "Grenade Launcher", (462, 466, 526, 522)),
        ("bow", "Bow", (594, 470, 626, 524)),
        ("melee-bat", "Melee (bat)", (630, 470, 686, 524)),
    ],
    "items": [
        ("medkit", "Medkit", (716, 472, 756, 518)),
        ("shield", "Shield", (762, 468, 800, 518)),
        ("grenade", "Grenade", (812, 466, 850, 522)),
        ("smoke", "Smoke", (864, 468, 898, 520)),
        ("flash", "Flash", (914, 468, 950, 520)),
        ("molotov", "Molotov", (966, 464, 1006, 522)),
        ("healing-drink", "Healing Drink", (1032, 466, 1068, 522)),
        ("speed-boost", "Speed Boost", (1092, 466, 1130, 522)),
        ("jump-pad", "Jump Pad", (1146, 476, 1196, 512)),
        ("trap", "Trap", (1208, 474, 1266, 514)),
    ],
    "crates": [
        ("common", "Common", (1299, 472, 1343, 522)),
        ("rare", "Rare", (1355, 472, 1399, 522)),
        ("epic", "Epic", (1411, 472, 1456, 522)),
        ("legendary", "Legendary", (1465, 468, 1513, 524)),
    ],
}

TOLERANCE = 34  # colour distance treated as background (sheet panels are dark navy)


def remove_background(crop: Image.Image) -> Image.Image:
    """Flood-fills from the crop border through pixels close to the border colour."""
    img = crop.convert("RGBA")
    w, h = img.size
    px = img.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)]
    border += [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    border.sort(key=lambda c: c[0] + c[1] + c[2])
    ref = border[len(border) // 2]

    def is_bg(c) -> bool:
        return abs(c[0] - ref[0]) + abs(c[1] - ref[1]) + abs(c[2] - ref[2]) < TOLERANCE * 1.5

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def main() -> None:
    sheet = Image.open(SHEET).convert("RGBA")
    entries = []
    tiles = []
    for group, items in CROPS.items():
        (OUT / group).mkdir(parents=True, exist_ok=True)
        for cid, label, box in items:
            out = remove_background(sheet.crop(box))
            path = OUT / group / f"{cid}.png"
            out.save(path, optimize=True)
            rel = path.relative_to(ROOT / "public").as_posix()
            entries.append(
                {
                    "id": f"concept.{group}.{cid}",
                    "group": group,
                    "key": cid,
                    "label": label,
                    "url": rel,
                    "width": out.width,
                    "height": out.height,
                    "sourceBox": list(box),
                }
            )
            tiles.append((label, out))

    # Contact sheet for human review.
    cell, cols, scale = 140, 9, 3
    rows = (len(tiles) + cols - 1) // cols
    contact = Image.new("RGBA", (cols * cell, rows * cell), (24, 26, 44, 255))
    for i, (_, t) in enumerate(tiles):
        big = t.resize((t.width * scale, t.height * scale), Image.NEAREST)
        big.thumbnail((cell - 8, cell - 8), Image.NEAREST)
        cx = (i % cols) * cell + (cell - big.width) // 2
        cy = (i // cols) * cell + (cell - big.height) // 2
        contact.alpha_composite(big, (cx, cy))
    contact.save(CONTACT)

    ts = [
        "// AUTO-GENERATED by tools/extract_concept_sheet.py — do not edit by hand.",
        "import type { ConceptAssetInfo } from './AssetManifest';",
        "",
        "export const CONCEPT_ASSETS: ConceptAssetInfo[] = " + json.dumps(entries, indent=2) + ";",
        "",
    ]
    TS_OUT.write_text("\n".join(ts), encoding="utf-8")
    print(f"extracted {len(entries)} concept crops → {OUT}")


if __name__ == "__main__":
    main()
