/**
 * Finds every <canvas data-flow> on the page and lets the water in when it
 * comes near the viewport. One place owns the rules about when a flow may
 * move: never when the visitor asked for reduced motion.
 */
import { Flow } from './flow';

const motionReduced = () => document.documentElement.dataset.motion !== 'full';

function setup(canvas: HTMLCanvasElement): void {
  const root = canvas.closest<HTMLElement>('[data-flow-root]');
  if (!root) return;
  const data = canvas.dataset;
  const base = parseFloat(data.flowStrength ?? '0.4');
  // A strength the visitor chose by hand wins over everything else.
  let chosen: number | null = null;
  const effective = () => (chosen !== null ? chosen : motionReduced() ? 0 : base);

  const colour = () =>
    getComputedStyle(root).getPropertyValue(data.flowVar || '--ink').trim() || '#2a4536';

  let flow: Flow;
  try {
    flow = new Flow(root, canvas, {
      colour: colour(),
      density: parseFloat(data.flowDensity ?? '1'),
      alpha: parseFloat(data.flowAlpha ?? '0.9'),
      pour: data.flowPour !== undefined,
      pointer: data.flowPointer !== 'off',
      strength: effective(),
    });
  } catch {
    root.dataset.flowState = 'unsupported';
    return;
  }

  const begin = () => {
    flow.start();
    root.dataset.flowState = 'running';
  };

  // The hero waits until its name has risen into place.
  if (data.flowWait !== undefined) {
    const go = () => window.setTimeout(begin, parseInt(data.flowWait || '0', 10) || 0);
    if (document.documentElement.classList.contains('is-ready')) go();
    else document.addEventListener('site:ready', go, { once: true });
  } else {
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          near.disconnect();
          begin();
        }
      },
      { rootMargin: '300px 0px' },
    );
    near.observe(root);
  }

  canvas.addEventListener('flow:strength', (event) => {
    chosen = (event as CustomEvent<number>).detail;
    flow.setStrength(effective());
  });
  document.addEventListener('motionchange', () => {
    chosen = null;
    flow.setStrength(effective());
  });
  document.addEventListener('palettechange', () => flow.setColour(colour()));
  document.fonts?.addEventListener?.('loadingdone', () => flow.refresh());

  if (data.flowHover !== undefined) {
    root.addEventListener('pointerenter', () => flow.setBoost(2.4));
    root.addEventListener('pointerleave', () => flow.setBoost(1));
  }
}

document.querySelectorAll<HTMLCanvasElement>('canvas[data-flow]').forEach(setup);
