/**
 * Browser smoke test (Playwright). Usage:
 *   node tests/browser/smoke.mjs http://localhost:5173 [outDir]
 *
 * Checks: boots without console errors, WebGL renders non-blank pixels,
 * keyboard + touch move the player, camera keeps the player on screen,
 * missing Mack atlas is reported, dev panel only appears with ?dev=1.
 * Writes screenshots and a JSON report to outDir.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'test-results';
fs.mkdirSync(out, { recursive: true });

const report = { base, checks: [], perf: {}, consoleErrors: [] };
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const state = (page) =>
  page.evaluate(() => {
    const g = window.__blockout;
    if (!g) return null;
    const p = g.state.get(g.playerId);
    const view = {
      target: g.camera.rig.renderTarget(),
      zoom: g.renderer.zoom / (window.devicePixelRatio || 1),
      width: innerWidth,
      height: innerHeight,
    };
    return {
      x: p.transform.x,
      z: p.transform.z,
      running: p.motion.running,
      cam: { ...g.camera.rig.target },
      view,
      diag: g.diagnostics.snapshot(),
      assetErrors: g.assets.errors,
      flags: { grid: g.getFlag('grid') },
    };
  });

async function nonBlank(page) {
  // Render and read back in the same task (the WebGL drawing buffer is not preserved).
  return page.evaluate(() => {
    const g = window.__blockout;
    g.renderer.render(g.scene, g.camera.camera);
    const gl = g.renderer.gl.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const colors = new Set();
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        gl.readPixels(Math.floor(((i + 0.5) / 16) * w), Math.floor(((j + 0.5) / 16) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        colors.add((px[0] << 16) | (px[1] << 8) | px[2]);
      }
    }
    return colors.size;
  });
}

// ---------------------------------------------------------------- desktop, dev
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__blockout?.loop.running, null, { timeout: 15000 });
  await page.waitForTimeout(800);

  const s0 = await state(page);
  check('game boots and loop runs', !!s0);
  check('canvas renders non-blank image', (await nonBlank(page)) > 4);
  await page.screenshot({ path: path.join(out, 'desktop-dev-start.png') });

  const unexpected = report.consoleErrors.filter((e) => !e.includes('avatar.mack.atlas'));
  check('no unexpected console errors on boot', unexpected.length === 0, unexpected.join(' | '));
  check(
    'missing Mack atlas is reported (not hidden)',
    s0.assetErrors.some((e) => e.id === 'avatar.mack.atlas'),
    s0.assetErrors.map((e) => e.id).join(','),
  );
  check('dev panel visible with ?dev=1', await page.locator('.dev-panel').isVisible());

  // Keyboard walk: W+D for 1 s (screen up-right → world +X? no: up-right = -Z)
  const speed = () => page.evaluate(() => { const g = window.__blockout; const m = g.state.get(g.playerId).motion; return Math.hypot(m.vx, m.vz); });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  const walkSpeed = await speed();
  await page.waitForTimeout(400);
  const s1 = await state(page);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  const walked = Math.hypot(s1.x - s0.x, s1.z - s0.z);
  check('keyboard W+D moves the player toward screen up-right (world -Z)', s1.z < s0.z - 1 && Math.abs(s1.x - s0.x) < 0.2, `moved ${walked.toFixed(2)} m, dx ${(s1.x - s0.x).toFixed(2)} dz ${(s1.z - s0.z).toFixed(2)}`);

  // Run.
  await page.waitForTimeout(300);
  const r0 = await state(page);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(600);
  const runSpeed = await speed();
  await page.waitForTimeout(400);
  const r1 = await state(page);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ShiftLeft');
  // Compare speeds, not distances: headless software rendering drops frames, which makes distances noisy.
  check('Shift runs faster than walking', runSpeed > walkSpeed * 1.5, `run ${runSpeed.toFixed(2)} m/s vs walk ${walkSpeed.toFixed(2)} m/s (moved ${Math.hypot(r1.x - r0.x, r1.z - r0.z).toFixed(2)} m)`);

  // Player stays on screen.
  const onScreen = await page.evaluate(() => {
    const g = window.__blockout;
    const p = g.state.get(g.playerId).transform;
    const t = g.camera.rig.renderTarget();
    const b = g.camera.rig.halfExtents();
    const r = { x: 0.7071067811865476, z: -0.7071067811865476 };
    const dx = p.x - t.x, dz = p.z - t.z;
    const sx = dx * r.x + dz * r.z;
    return Math.abs(sx) < b.halfW;
  });
  check('camera keeps the player on screen', onScreen);

  // Teleport to corner, wall walk.
  await page.locator('.dev-tp button', { hasText: 'Kulma SE' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyS');
  const c = await state(page);
  check('map bounds hold at the SE corner', c.x <= 32 - 0.3 + 1e-6 && c.z <= 32 - 0.3 + 1e-6, `x ${c.x.toFixed(3)} z ${c.z.toFixed(3)}`);
  await page.locator('.dev-flags button', { hasText: 'Kamerarajat' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'desktop-corner-bounds.png') });
  await page.locator('.dev-flags button', { hasText: 'Kamerarajat' }).click();

  // Collision against block-b: teleport to crates, walk into them.
  await page.locator('.dev-tp button', { hasText: 'Laatikot' }).click();
  await page.locator('.dev-flags button', { hasText: 'Ruudukko' }).click();
  await page.locator('.dev-flags button', { hasText: 'Törmäykset' }).click();
  await page.locator('.dev-flags button', { hasText: 'Ankkuri' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const blocked = await page.evaluate(() => {
    const g = window.__blockout;
    const p = g.state.get(g.playerId).transform;
    return { x: p.x, z: p.z, overlap: g.world.collision.overlaps(p.x, p.z, 0.3 - 1e-4) };
  });
  check('player does not penetrate obstacles', !blocked.overlap, JSON.stringify(blocked));
  await page.screenshot({ path: path.join(out, 'desktop-debug-overlays.png') });

  // Concept catalogue: every image loads, picking an avatar changes identity.
  await page.locator('.dev-avatar button', { hasText: 'Assetit-katalogi' }).click();
  await page.waitForTimeout(800);
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('.catalog img')].map((i) => ({ src: i.getAttribute('src'), ok: !(i.complete && i.naturalWidth === 0) })),
  );
  const broken = imgs.filter((i) => !i.ok);
  check('concept catalogue lists all images and none fail to load', imgs.length === 36 && broken.length === 0 && (await page.locator('.catalog .atlas-sprite').count()) === 71, `${imgs.length} imgs, broken: ${broken.map((b) => b.src).join(',')}`);
  await page.screenshot({ path: path.join(out, 'desktop-catalog.png') });
  await page.locator('.catalog [data-avatar="luna"]').click();
  await page.locator('.catalog [data-act="close"]').click();
  await page.waitForTimeout(400);
  const av = await page.evaluate(() => {
    const g = window.__blockout;
    return { id: g.state.get(g.playerId).avatarId, err: g.assets.errors.some((e) => e.id === 'avatar.luna.atlas') };
  });
  check('selecting Luna switches avatar identity and reports her missing atlas', av.id === 'luna' && av.err, JSON.stringify(av));
  await page.screenshot({ path: path.join(out, 'desktop-luna-selected.png') });

  // Performance sample (headless software GL: NOT representative of devices).
  await page.locator('.dev-tp button', { hasText: 'Keskusta' }).click();
  await page.waitForTimeout(3000);
  const p = await state(page);
  report.perf.desktopHeadless = { fps: p.diag.fps, frameMsAvg: p.diag.frameMsAvg, frameMsMax: p.diag.frameMsMax, drawCalls: p.diag.render.drawCalls, triangles: p.diag.render.triangles, textures: p.diag.render.textures, geometries: p.diag.render.geometries, heapMB: p.diag.heapMB, res: p.diag.internalResolution };
  console.log('perf', report.perf.desktopHeadless);

  // Dispose frees GPU resources.
  const disposed = await page.evaluate(() => {
    const g = window.__blockout;
    const before = { ...g.renderer.gl.info.memory };
    g.worldView.dispose();
    g.renderer.render(g.scene, g.camera.camera);
    const after = { ...g.renderer.gl.info.memory };
    return { before, after };
  });
  check('WorldView.dispose releases its geometries', disposed.after.geometries < disposed.before.geometries, JSON.stringify(disposed));
  await ctx.close();
}

// ------------------------------------------------------------- normal player
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__blockout?.loop.running, null, { timeout: 15000 });
  check('dev panel hidden without ?dev=1', (await page.locator('.dev-panel').count()) === 0);
  await ctx.close();
}

// -------------------------------------------------------------- mobile touch
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__blockout?.loop.running, null, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.dev-panel').classList.add('hidden'));
  await page.waitForTimeout(500);
  const s0 = await state(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', 150, 250);
  for (let i = 1; i <= 5; i++) await touch('touchMove', 150 + i * 6, 250);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, 'mobile-joystick.png') });
  await page.waitForTimeout(850);
  await touch('touchEnd', 0, 0);
  const s1 = await state(page);
  check('touch joystick (drag right) moves the player toward screen-right', s1.x - s0.x > 0.5 && s1.z - s0.z < -0.5, `dx ${(s1.x - s0.x).toFixed(2)} dz ${(s1.z - s0.z).toFixed(2)}`);
  check('mobile uses integer zoom with readable view', Number.isInteger(s1.diag.zoom), s1.diag.internalResolution);
  report.perf.mobileEmuHeadless = { fps: s1.diag.fps, frameMsAvg: s1.diag.frameMsAvg, drawCalls: s1.diag.render.drawCalls, res: s1.diag.internalResolution };
  await ctx.close();
}

await browser.close();
report.passed = report.checks.every((c) => c.ok);
fs.writeFileSync(path.join(out, 'smoke-report.json'), JSON.stringify(report, null, 2));
console.log(report.passed ? '\nALL BROWSER CHECKS PASSED' : '\nSOME BROWSER CHECKS FAILED');
process.exit(report.passed ? 0 : 1);
