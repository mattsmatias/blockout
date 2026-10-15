import { Game } from '../core/Game';
import { DebugPanel } from '../ui/DebugPanel';
import { LoadingScreen } from '../ui/LoadingScreen';
import { DEV_TEST_MAP } from '../world/maps/dev-test/map';

/** Entry point: builds the DOM shell, boots the game, wires dev tools for ?dev=1. */
async function bootstrap(): Promise<void> {
  const root = document.getElementById('app')!;
  const stage = document.createElement('div');
  stage.className = 'stage';
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  root.append(stage, overlay);

  const params = new URLSearchParams(location.search);
  // ?dev=1 locally; #dev where query strings are unavailable (hosted previews).
  // TEST_BUILD (hosted test preview) always shows the dev tools.
  const dev = params.get('dev') === '1' || location.hash === '#dev' || import.meta.env?.TEST_BUILD === true;
  const loading = new LoadingScreen(root);

  let game: Game | null = null;
  try {
    game = new Game({ container: stage, overlay, map: DEV_TEST_MAP, dev, baseUrl: import.meta.env?.BASE_URL ?? '/' });
    game.events.on('asset:progress', ({ loaded, total }) => loading.progress(loaded, total));
    await game.load();
    loading.progress(1, 1, 'Valmis');
    if (dev) {
      const panel = new DebugPanel(game, overlay);
      game.onFrame = (dt) => panel.update(dt);
      document.body.classList.add('dev');
    }
    game.start();
    loading.hide();
    // Exposed for automated browser tests and console debugging only.
    (window as unknown as { __blockout?: Game }).__blockout = game;
  } catch (err) {
    console.error(err);
    loading.error(err instanceof Error ? `Käynnistys epäonnistui: ${err.message}` : 'Käynnistys epäonnistui');
    game?.dispose();
  }
}

void bootstrap();
