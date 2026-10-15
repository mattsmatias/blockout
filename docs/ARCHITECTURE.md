# BLOCKOUT — Arkkitehtuuri (Milestone 1)

## Tekninen ratkaisu

**Renderöinti: valittu vaihtoehto A.** Avatarit ovat 2D-spriteatlaksia isometrisessä 3D-maailmassa
(three.js, ortografinen kamera). Maailma (lattiat, seinät, rakennukset) on oikeaa 3D-geometriaa,
jotta törmäykset, sisätilat, kerrokset ja seinien häivytys toimivat luontevasti.

| Kriteeri | A: spriteatlas | B: 3D-avatar pikselöitynä |
|---|---|---|
| 8 suunnan yhdenmukaisuus | Riippuu taiteilijasta (8 piirrettyä suuntaa) | Automaattinen |
| Animaatioiden laajennettavuus | Jokainen animaatio × 8 suuntaa piirretään | Yksi animaatio riittää |
| Varusteiden vaihto | Kerrostetut atlakset (pää/vartalo/jalat) | Helppo (meshit) |
| Mobiilisuorituskyky | Erinomainen (1 quad / hahmo) | Hyvä, mutta skinning × 20 pelaajaa |
| Tuotantokustannus | Suuri piirtotyö | Mallinnus + rigaus + shader-työ |
| Visuaalinen laatu (konseptin tyyli) | Paras — käsin piirretty pikselitaide | Vaikea saada yhtä siistiksi |

Riski A:ssa on assettituotanto (12 hahmoa × 8 suuntaa × N animaatiota). Siksi Mack tehdään ensin
ja hyväksytetään (Milestone 2). Jos tuotantokustannus osoittautuu liian suureksi, B voidaan
ottaa käyttöön ilman muutoksia simulaatioon, koska avatarin renderöinti on oma kerroksensa.

**Pikselitarkkuus:** maailma renderöidään matalan resoluution render targetiin (art pixel) ja
skaalataan kokonaislukukertoimella näytölle nearest-suodatuksella. Render targetin koko on aina
parillinen ja kamera snapataan art-pikseliruudukkoon, jotta pikselit eivät väreile liikkuessa.

## Koordinaatistot

Määritelty yhdessä paikassa: `src/utils/CoordinateUtils.ts` ja `src/core/Config.ts`.

- **World**: metrit. X = itä (ruudulla oikealle alas), Y = ylös, Z = etelä (ruudulla vasemmalle alas). Liike XZ-tasossa.
- **Tile**: 1 tile = 1 m. Tile (tx, tz) kattaa [tx, tx+1) × [tz, tz+1).
- **Screen**: CSS-pikselit, origo vasen yläkulma.
- **Art pixel**: render targetin pikseli. 1 tile = 64 × 36,95 px timantti (kamera: yaw 45°, korkeuskulma ≈ 35,26° = true isometric, lattian reunat 30°). Ks. kohta "Isometrinen kulma".
- **Collision**: sama kuin world XZ. Ei koskaan pikseliyksiköitä.
- **Sprite anchor**: (M2) jalkojen ankkuripiste framessa → asetetaan tarkalleen entiteetin world-sijaintiin.

## Kerrokset

```
input/       laitteet → InputActions (näytön suhteen, laiteriippumaton)
player/      InputActions → nopeus → MovementResolver (vain simulaatiossa)
physics/     CollisionWorld (AABB + spatial hash), moveCircle (sub-step, liukuminen)
core/        GameLoop (60 Hz kiinteä askel + interpolointi), GameState (sarjallistettava), EventBus, Diagnostics
world/       MapDefinition (data), World (törmäykset ja rajat datasta), maps/
assets/      AssetManifest + AssetManager (cache, dedup, refcount, virheet näkyviin)
rendering/   Renderer, CameraRig (puhdas logiikka), IsometricCamera, WorldView, PlayerMarkerView
ui/          LoadingScreen, DebugPanel (?dev=1)
```

Säännöt: simulaatio ei importtaa three.js:ää eikä DOMia. Renderöinti lukee GameStatea, ei muuta sitä.
Kartta on dataa, josta sekä törmäykset että grafiikka rakennetaan erikseen.

## Moninpelin valmistelu (ei verkkokoodia)

- `GameState` on pelkkää dataa, entity ID:t ovat yksilöllisiä eikä niitä kierrätetä, `snapshot()` on JSON-turvallinen.
- Syöte on irrotettu (`InputActions`) — sama rakenne voidaan myöhemmin lähettää palvelimelle.
- Kiinteä 60 Hz tick + interpoloitu renderöinti = valmis pohja snapshot-interpoloinnille.
- Tämä EI tarkoita, että peli olisi valmis 20 pelaajan moninpeliin. Palvelinarkkitehtuuri arvioidaan erikseen.

## Avoimet tekniset riskit

1. **Avatar-assettien tuotanto** — konseptikuvat eivät ole käytettäviä spriteatlaksia (eri koot, ei ruudukkoa, ei yhteistä ankkuria, ei kaikkia 8 suuntaa, ei animaatiofremejä). Mack-atlas pitää piirtää/tuottaa.
2. **Sprite + 3D-syvyysjärjestys** — billboard-spritet 3D-seinien vieressä: ratkaistaan M2/M3:ssa (depth-offset tai jalkapisteen mukainen sorttaus).
3. **Zoom-taso mobiilissa** — `MIN_ART_PIXELS_SHORT_SIDE = 360` on arvaus; testattava oikeilla puhelimilla (pystyasennossa näkymä on kapea).
4. **Seinien häivytys** — vaatii rakennusten jakamisen osiin (seinä/katto/kerros) M3:ssa.
5. **Suorituskyky** — mitattu vain headless-selaimessa ohjelmistorenderöinnillä; oikea laitetestaus puuttuu.

## Isometrinen kulma (muutettu)

Alun perin käytössä oli 2:1-dimetria (korkeuskulma 30°, lattian reunat 26,57°, tile 64 × 32).
Kaikki BLOCKOUTin assettiarkit on kuitenkin piirretty **true isometric** -kulmassa: reunat 28–31°,
keskiarvo 29,6° (`python tools/measure_iso_angles.py props`). Ero näkyi esineiden vinoutena lattiaan
nähden. Projektio vaihdettiin vastaamaan taidetta (`src/core/Config.ts`, yksi vakio), eikä assetteja
venytetä tai vinouteta.

Assettien vaatimus jatkossa: lattian suuntaiset reunat 30° vaakatasosta (tile ≈ 64 × 37 px),
pystyreunat pystysuoria, läpinäkyvä tausta, sama mittakaava kaikissa kuvissa, ja kääntyville esineille
neljä isometristä näkymää (istuin/etupuoli ↙, ↘, ↗, ↖).
