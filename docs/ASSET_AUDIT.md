# Asset-auditointi — konseptiarkki v1

Lähde: `concept/blockout-asset-sheet-v1.png` (1536 × 1024, tekoälyllä tehty konseptikuva).
Leikkaus: `python tools/extract_concept_sheet.py` → `public/assets/concept/` (36 kuvaa, läpinäkyvä tausta).

## Mitä otettiin käyttöön

| Ryhmä | Määrä | Koko (px) | Käyttö |
|---|---|---|---|
| Avatar-muotokuvat | 12 | n. 60–75 × 110–125 | Hahmonvalinta, dev-paneeli, katalogi |
| Aseet | 10 | n. 30–60 × 50 | UI-ikonit (ei asejärjestelmää vielä) |
| Tarvikkeet | 10 | n. 35–55 × 40–55 | UI-ikonit |
| Loot cratet | 4 | n. 45 × 50 | UI-ikonit |

Kaikki on merkitty manifestiin tilalla `concept`. Validointi estää konseptikuvan käytön spriteatlaksena.

## Miksi konseptikuvat eivät kelpaa pelihahmoiksi

1. **Ei 8 suuntaa.** Pienet hahmot ovat lähinnä edestä ja takaa. Sivuja ja viistoja suuntia (NE/SE/SW/NW) ei ole johdonmukaisesti.
2. **Ei animaatioruutuja.** Kohta "Animaatiot" näyttää yhden asennon per animaatio, ei ruutusarjaa.
3. **Liian pieni ja sumea.** Suuntasprite on n. 25 × 40 px ja skaalauksesta pehmeä. Tavoite on 128 × 128 framessa terävä pikselitaide.
4. **Ei yhteistä ankkuria tai mittakaavaa.** Hahmojen koot ja jalkojen korkeus vaihtelevat.
5. **Epäjohdonmukaisuuksia arkissa:**
   - Otsikot ja hahmot ovat sarakkeittain sekaisin (esim. MACK-otsikon alla on Nova).
   - River-tyyppinen violettihiuksinen hahmo esiintyy kahdesti, ja ylimääräinen on Leon kohdalla.
   - JAY-sarakkeen pienet hahmot (oikealla) ovat kiharatukkaisia oransseissa/maastoasuissa, eivät Jay.
   - Mackin takaa-kuvissa on pinkkihiuksinen hahmo.
   - Aseissa "Bow"-teksti on keltaisen esineen alla, ja varsinainen jousi on "Melee"-kohdassa.

## Mack-spriteatlaksen tilauspohja (Milestone 2)

- **Frame:** 128 × 128 px, läpinäkyvä tausta, ei antialiasointia reunoilla.
- **Hahmon korkeus:** n. 72–80 px (≈1,6 m kun tile on 64 × 32).
- **Jalka-ankkuri:** sama pikseli kaikissa frameissa, x = 64, y = 112 (jalkojen keskikohta maassa).
- **Suunnat (8):** S, SW, W, NW, N, NE, E, SE. Kamera katsoo 30° kulmassa (2:1-isometria).
- **Animaatiot ja framet:**
  - idle 4 framea, 6 fps
  - walk 8 framea, 10 fps
  - run 8 framea, 14 fps
- **Paletti:** Mackin muotokuvan värit (punainen lippis, musta huppari punaisilla hihoilla, valkoiset kengät).
- **Toimitus:** `mack.png` (atlas) + `mack.atlas.json` (frame-rectit, ankkuri, animaatiot).
- **Määrä:** 8 suuntaa × 20 framea = 160 framea.

Vaihtoehto: kaikki 12 hahmoa samalla rungolla (`blocky-v1`) 3D-mallina, joka renderöidään pikselitaiteeksi (vaihtoehto B).
Tämä poistaa 8 suunnan piirtotyön ja takaa yhtenäisen koon, mutta vaatii hyväksynnän tyylille.
