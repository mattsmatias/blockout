"""
Builds the world-props atlas from the BLOCKOUT props sheet (v2).

    python tools/extract_props_sheet.py

Input : concept/blockout-props-sheet-v2.png (1536x1024, transparent background)
        + EXTRA_SOURCES (single-prop sheets with several angles, e.g. concept/bench-angles.png)
Output: public/assets/concept/props/props-atlas.png (all props, packed, shipped)
        concept/props/<key>.png                     (individual crops, not shipped)
        concept/props-contact-sheet.png             (review sheet)
        src/assets/conceptProps.generated.ts        (names, sizes, atlas regions)

The v2 sheet draws every object at one consistent scale (a bench ≈ 150 px wide),
about 2× the game's art-pixel size. Each object is therefore downsampled by
SCALE with a high-quality filter, and its alpha is hardened so edges stay crisp
and the faint coloured glows around some objects disappear.

Objects are found as connected regions of the alpha channel and assigned to the
sheet's six rows by where their base sits, then named left to right.
Requires Pillow, numpy, scipy.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "concept" / "blockout-props-sheet-v2.png"
CROPS = ROOT / "concept" / "props"
PUBLIC = ROOT / "public" / "assets" / "concept" / "props"
ATLAS = PUBLIC / "props-atlas.png"
TS_OUT = ROOT / "src" / "assets" / "conceptProps.generated.ts"
CONTACT = ROOT / "concept" / "props-contact-sheet.png"

SCALE = 0.5  # sheet px → art px
ALPHA_CUT = 110  # alpha below this is background (removes glows / soft edges)
MIN_AREA = 300
ATLAS_WIDTH = 1024
ATLAS_PAD = 2

# Lower edge (sheet y) of each row band; an object belongs to the first band its base fits.
ROW_BOTTOMS = [262, 426, 594, 727, 872, 10_000]

# (key, Finnish name, category key, category label) per row, left to right.
ROWS: list[list[tuple[str, str, str, str]]] = [
    [
        ("arcade", "Pelikone", "fun", "Viihde"),
        ("vending", "Juoma-automaatti", "shop", "Automaatit ja kioskit"),
        ("atm", "Pankkiautomaatti", "shop", "Automaatit ja kioskit"),
        ("phone-booth", "Puhelinkoppi", "shop", "Automaatit ja kioskit"),
        ("trash-bin", "Roskis", "street", "Katukalusteet"),
        ("dumpster", "Jäteastia", "street", "Katukalusteet"),
        ("bench-simple", "Penkki (arkki v2)", "street", "Katukalusteet"),
        ("street-lamp", "Katulamppu", "street", "Katukalusteet"),
        ("cone", "Liikennekartio", "traffic", "Liikenne ja esteet"),
        ("hydrant", "Paloposti", "street", "Katukalusteet"),
        ("manhole", "Kaivonkansi", "street", "Katukalusteet"),
    ],
    [
        ("hedge-planter", "Pensaslaatikko", "plants", "Kasvit"),
        ("palm-pot", "Palmu ruukussa", "plants", "Kasvit"),
        ("cypress-pot", "Sypressi ruukussa", "plants", "Kasvit"),
        ("bush-planter", "Pensasruukku", "plants", "Kasvit"),
        ("tree-pot", "Puu ruukussa", "plants", "Kasvit"),
        ("iron-fence", "Rautaaita", "fences", "Aidat ja kaiteet"),
        ("chain-fence", "Verkkoaita", "fences", "Aidat ja kaiteet"),
        ("guardrail", "Kaide", "fences", "Aidat ja kaiteet"),
        ("barrier-small", "Betoniesteen pätkä", "traffic", "Liikenne ja esteet"),
        ("barrier", "Betonieste", "traffic", "Liikenne ja esteet"),
        ("bollard-red", "Pollari (puna-valk.)", "traffic", "Liikenne ja esteet"),
        ("bollard-yellow", "Pollari (kelta-musta)", "traffic", "Liikenne ja esteet"),
    ],
    [
        ("sign-bar", "Neonkyltti BAR", "signs", "Kyltit ja merkit"),
        ("sign-ramen", "Neonkyltti ramen", "signs", "Kyltit ja merkit"),
        ("sign-hotel", "Neonkyltti hotelli", "signs", "Kyltit ja merkit"),
        ("sign-arrow", "Suuntanuoli", "signs", "Kyltit ja merkit"),
        ("sign-no-entry", "Kielletty ajosuunta", "signs", "Kyltit ja merkit"),
        ("traffic-light", "Liikennevalo", "traffic", "Liikenne ja esteet"),
        ("cctv", "Valvontakamera", "tech", "Tekniikka"),
        ("utility-cabinet", "Sähkökaappi", "tech", "Tekniikka"),
        ("ac-unit", "Ilmalämpöpumppu", "tech", "Tekniikka"),
        ("radiator", "Lämpöpatteri", "tech", "Tekniikka"),
        ("pipe-valve", "Putki ja venttiili", "tech", "Tekniikka"),
    ],
    [
        ("crate", "Puulaatikko", "cargo", "Laatikot ja tynnyrit"),
        ("cardboard-box", "Pahvilaatikko", "cargo", "Laatikot ja tynnyrit"),
        ("pallet-stack", "Lavapino", "cargo", "Laatikot ja tynnyrit"),
        ("pallet-blue", "Muovilava", "cargo", "Laatikot ja tynnyrit"),
        ("barrel-red", "Tynnyri (punainen)", "cargo", "Laatikot ja tynnyrit"),
        ("barrel-blue", "Tynnyri (sininen)", "cargo", "Laatikot ja tynnyrit"),
        ("barrel-orange", "Tynnyri (oranssi)", "cargo", "Laatikot ja tynnyrit"),
        ("ibc-tank", "IBC-säiliö", "cargo", "Laatikot ja tynnyrit"),
        ("toolbox", "Työkalulaatikko", "cargo", "Laatikot ja tynnyrit"),
        ("ammo-box", "Sotilaslaatikko", "cargo", "Laatikot ja tynnyrit"),
        ("flight-case", "Kuljetuslaatikko", "cargo", "Laatikot ja tynnyrit"),
    ],
    [
        ("scooter", "Skootteri", "vehicles", "Kulkuneuvot"),
        ("bicycle", "Polkupyörä", "vehicles", "Kulkuneuvot"),
        ("kick-scooter", "Potkulauta", "vehicles", "Kulkuneuvot"),
        ("shopping-cart", "Ostoskärry", "vehicles", "Kulkuneuvot"),
        ("food-cart", "Ruokakärry", "market", "Tori ja kojut"),
        ("market-stall", "Myyntikoju", "market", "Tori ja kojut"),
        ("ice-freezer", "Jäätelöpakastin", "market", "Tori ja kojut"),
        ("food-stand", "Ruokakoju", "market", "Tori ja kojut"),
        ("kiosk", "Kioski", "market", "Tori ja kojut"),
        ("power-box-dark", "Jakokaappi (tumma)", "tech", "Tekniikka"),
        ("power-box-green", "Jakokaappi (vihreä)", "tech", "Tekniikka"),
    ],
    [
        ("ac-unit-2", "Ulkoyksikkö", "roof", "Katto ja ilmastointi"),
        ("ac-unit-3", "Ulkoyksikkö (iso)", "roof", "Katto ja ilmastointi"),
        ("vent-box", "Ilmanvaihtolaatikko", "roof", "Katto ja ilmastointi"),
        ("duct", "Ilmastointikanava", "roof", "Katto ja ilmastointi"),
        ("roof-box", "Kattolaite", "roof", "Katto ja ilmastointi"),
        ("roof-turbine", "Kattotuuletin", "roof", "Katto ja ilmastointi"),
        ("pipes", "Putkinippu", "construction", "Rakennustarvikkeet"),
        ("cable-spool", "Kaapelikela", "construction", "Rakennustarvikkeet"),
        ("ladder", "Tikkaat", "construction", "Rakennustarvikkeet"),
        ("scaffold", "Rakennusteline", "construction", "Rakennustarvikkeet"),
        ("planks", "Lankkupino", "construction", "Rakennustarvikkeet"),
    ],
]


# Extra single-object sheets that show one prop from several angles.
# Each entry: (sheet, scale, [(key, name, cat, cat_label, (x0, y0, x1, y1)), ...]).
# Only the views that match the fixed isometric camera are used; flat front/side/top
# views on those sheets cannot appear in this camera and are skipped.
EXTRA_SOURCES = [
    (
        ROOT / "concept" / "bench-angles.png",
        0.25,  # the bench is drawn ~320 px wide here vs ~150 px on sheet v2
        [
            ("bench-r0", "Penkki (istuin ↙)", "street", "Katukalusteet", (65, 6, 385, 310)),
            # ↘ and ↖ views are mirror images of ↙ and ↗ (see MIRRORED below): the sheet's own
            # ↘/↖ drawings were ~1.5° too shallow (28.3°/28.5° vs 30°).
            ("bench-r180", "Penkki (istuin ↗, selkä näkyy)", "street", "Katukalusteet", (63, 286, 385, 541)),
        ],
    ),
]

# Views produced by mirroring another view horizontally. With the camera's fixed
# 45° yaw, a left-right mirror on screen swaps world X and Z, so a symmetric prop
# turned 90° is exactly the mirror image of the unturned one — same pixels, same
# edge angles, no resampling. (Highlights move to the other side, as in a mirror.)
MIRRORED = [
    ("bench-r90", "Penkki (istuin ↘)", "bench-r0"),
    ("bench-r270", "Penkki (istuin ↖, selkä näkyy)", "bench-r180"),
]


def find_objects(rgba: np.ndarray):
    mask = rgba[..., 3] > ALPHA_CUT
    grouped = ndimage.binary_dilation(mask, iterations=3)
    labels, _ = ndimage.label(grouped)
    out = []
    for label_id, sl in enumerate(ndimage.find_objects(labels), 1):
        if sl is None:
            continue
        own = labels[sl] == label_id
        if int(own.sum()) < MIN_AREA:
            continue
        out.append((sl, own))
    return out


def downscale(img: Image.Image, scale: float = SCALE) -> Image.Image:
    w = max(1, round(img.width * scale))
    h = max(1, round(img.height * scale))
    small = img.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    a = np.asarray(small).copy()
    hard = a[..., 3] > ALPHA_CUT
    a[..., 3] = np.where(hard, 255, 0)
    a[~hard, :3] = 0
    out = Image.fromarray(a, "RGBA")
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def main() -> None:
    sheet = Image.open(SHEET).convert("RGBA")
    rgba = np.asarray(sheet)
    found = find_objects(rgba)

    rows: list[list] = [[] for _ in ROWS]
    for sl, own in found:
        bottom = sl[0].stop
        r = next(i for i, b in enumerate(ROW_BOTTOMS) if bottom <= b)
        rows[r].append((sl, own))
    for r, items in enumerate(rows):
        if len(items) != len(ROWS[r]):
            raise SystemExit(f"row {r}: found {len(items)} objects, expected {len(ROWS[r])}")
        items.sort(key=lambda it: it[0][1].start)

    CROPS.mkdir(parents=True, exist_ok=True)
    for f in CROPS.glob("*.png"):
        f.unlink()
    entries, tiles = [], []
    for r, items in enumerate(rows):
        for (sl, own), (key, name, cat, cat_label) in zip(items, ROWS[r]):
            ys, xs = sl
            crop = sheet.crop((xs.start, ys.start, xs.stop, ys.stop))
            a = np.asarray(crop).copy()
            a[..., 3] = np.where(own, a[..., 3], 0)  # drop neighbours inside the box
            small = downscale(Image.fromarray(a, "RGBA"))
            small.save(CROPS / f"{key}.png", optimize=True)
            entries.append(
                {
                    "id": f"concept.props.{key}",
                    "group": "props",
                    "category": cat,
                    "categoryLabel": cat_label,
                    "key": key,
                    "label": name,
                    "file": f"concept/props/{key}.png",
                    "width": small.width,
                    "height": small.height,
                    "sourceBox": [xs.start, ys.start, xs.stop, ys.stop],
                }
            )
            tiles.append(small)

    for path, scale, picks in EXTRA_SOURCES:
        src = Image.open(path).convert("RGBA")
        for key, name, cat, cat_label, box in picks:
            crop = np.asarray(src.crop(box)).copy()
            # Keep only the largest alpha region inside the box (drops neighbours).
            lab, _ = ndimage.label(ndimage.binary_dilation(crop[..., 3] > ALPHA_CUT, iterations=3))
            biggest = np.bincount(lab.ravel())[1:].argmax() + 1
            crop[..., 3] = np.where(lab == biggest, crop[..., 3], 0)
            small = downscale(Image.fromarray(crop, "RGBA"), scale)
            small.save(CROPS / f"{key}.png", optimize=True)
            entries.append(
                {
                    "id": f"concept.props.{key}",
                    "group": "props",
                    "category": cat,
                    "categoryLabel": cat_label,
                    "key": key,
                    "label": name,
                    "file": f"concept/props/{key}.png",
                    "width": small.width,
                    "height": small.height,
                    "sourceBox": list(box),
                }
            )
            tiles.append(small)

    for key, name, source in MIRRORED:
        i = next(n for n, e in enumerate(entries) if e["key"] == source)
        img = tiles[i].transpose(Image.FLIP_LEFT_RIGHT)
        img.save(CROPS / f"{key}.png", optimize=True)
        entries.append({**entries[i], "id": f"concept.props.{key}", "key": key, "label": name,
                        "file": f"concept/props/{key}.png", "mirrorOf": source})
        tiles.append(img)

    # Shelf-pack into one atlas, tallest first.
    order = sorted(range(len(tiles)), key=lambda i: -tiles[i].height)
    x = y = shelf = 0
    for i in order:
        t = tiles[i]
        if x + t.width + ATLAS_PAD > ATLAS_WIDTH:
            x, y, shelf = 0, y + shelf + ATLAS_PAD, 0
        entries[i]["atlas"] = [x, y, t.width, t.height]
        x += t.width + ATLAS_PAD
        shelf = max(shelf, t.height)
    atlas_h = y + shelf
    atlas = Image.new("RGBA", (ATLAS_WIDTH, atlas_h), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        atlas.alpha_composite(t, tuple(entries[i]["atlas"][:2]))
    PUBLIC.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS, optimize=True)

    cell, cols, k = 120, 12, 2
    contact = Image.new("RGBA", (cols * cell, ((len(tiles) + cols - 1) // cols) * cell), (24, 26, 44, 255))
    for i, t in enumerate(tiles):
        big = t.resize((t.width * k, t.height * k), Image.NEAREST)
        big.thumbnail((cell - 6, cell - 6), Image.NEAREST)
        contact.alpha_composite(big, ((i % cols) * cell + (cell - big.width) // 2, (i // cols) * cell + (cell - big.height) // 2))
    contact.save(CONTACT)

    TS_OUT.write_text(
        "// AUTO-GENERATED by tools/extract_props_sheet.py — do not edit by hand.\n"
        "import type { ConceptPropInfo } from './AssetManifest';\n\n"
        f"export const PROPS_ATLAS = {{ url: 'assets/concept/props/props-atlas.png', width: {ATLAS_WIDTH}, height: {atlas_h} }};\n\n"
        "export const CONCEPT_PROPS: ConceptPropInfo[] = " + json.dumps(entries, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(entries)} props → atlas {ATLAS_WIDTH}x{atlas_h}")


if __name__ == "__main__":
    main()
