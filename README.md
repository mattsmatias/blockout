# BLOCKOUT — Battle Royale

Isometrinen pikselitaide-battle royale. TypeScript + Vite + three.js.

**Tila:** Milestone 1 (Foundation) — pelisilmukka, renderer, kamera, syöte, AssetManager, kehitystila.
Hahmona on vielä selvästi merkitty kehitysmerkki (magenta kapseli), ei Mack-avatar. Kartta on testikenttä, ei Neon City.

## Käynnistys

```bash
npm install
npm run dev          # http://localhost:5173  (kehitystila: /?dev=1)
npm test             # yksikkötestit (node:test + tsx)
npm run build        # typecheck + tuotantobuild → dist/
```

Selaintesti (vaatii Playwrightin): `npx playwright install chromium` ja sitten
`node tests/browser/smoke.mjs http://localhost:5173`.

## Ohjaus

- **Tietokone:** WASD / nuolet, Shift = juoksu
- **Mobiili:** kosketa ruudun vasenta puolta → virtuaalinen joystick, täysi taivutus = juoksu
- **?dev=1:** F3 tai ⚙ avaa paneelin — FPS, frame time, draw calls, ruudukko, törmäykset, ankkuri, kamerarajat, zoom, teleport, assettien tila

Arkkitehtuuri, koordinaatistot ja riskit: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Konseptiassetit ja Mack-atlaksen tilauspohja: [docs/ASSET_AUDIT.md](docs/ASSET_AUDIT.md). Dev-tilassa: ⚙ → Avatar → Assetit-katalogi.
