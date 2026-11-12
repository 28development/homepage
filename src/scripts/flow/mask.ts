/**
 * Turns what is on the page into the obstacles of the flow.
 *
 * - `[data-flow-glyphs]`  the real letter shapes of that element's text
 * - `[data-flow-block]`   the element's box, padded, as one solid stone
 *
 * The result is a coarse grid (one cell is a few CSS pixels) in which every
 * cell is either water or stone.
 */

export interface Mask {
  cols: number;
  rows: number;
  /** Size of one cell in CSS pixels. */
  cell: number;
  /** 1 = stone, 0 = water. Row-major, cols × rows. */
  solid: Uint8Array;
}

const STRETCH_KEYWORDS: [number, string][] = [
  [50, 'ultra-condensed'],
  [62.5, 'extra-condensed'],
  [75, 'condensed'],
  [87.5, 'semi-condensed'],
  [100, 'normal'],
  [112.5, 'semi-expanded'],
  [125, 'expanded'],
  [150, 'extra-expanded'],
  [200, 'ultra-expanded'],
];

function stretchKeyword(value: string): string {
  const percent = parseFloat(value);
  if (Number.isNaN(percent)) return value || 'normal';
  let best = STRETCH_KEYWORDS[4];
  for (const entry of STRETCH_KEYWORDS) {
    if (Math.abs(entry[0] - percent) < Math.abs(best[0] - percent)) best = entry;
  }
  return best[1];
}

/** The y position of the text baseline of an element's (single) line. */
function baselineOf(element: HTMLElement): number {
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
  element.appendChild(probe);
  const y = probe.getBoundingClientRect().bottom;
  element.removeChild(probe);
  return y;
}

function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  originX: number,
  originY: number,
): void {
  const style = getComputedStyle(element);
  const upper = style.textTransform === 'uppercase';
  const stretch = stretchKeyword(style.fontStretch);
  ctx.font = `${style.fontWeight} ${stretch} ${style.fontSize} ${style.fontFamily}`;
  // Newer engines expose the stretch on the context; set it where it exists.
  if ('fontStretch' in ctx) {
    try {
      (ctx as unknown as { fontStretch: string }).fontStretch = stretch;
    } catch {
      /* keyword not supported, the shorthand above already carries it */
    }
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const baseline = baselineOf(element) - originY;
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!char.trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) continue;
      ctx.fillText(upper ? char.toUpperCase() : char, rect.left - originX, baseline);
    }
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  originX: number,
  originY: number,
): void {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const pad = parseFloat(element.dataset.flowBlock || '') || 14;
  const x = rect.left - originX - pad;
  const y = rect.top - originY - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, Math.min(pad, 18));
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

/** Water that cannot be reached from the top edge (a closed counter) becomes stone. */
function sealUnreachable(solid: Uint8Array, cols: number, rows: number): void {
  const seen = new Uint8Array(cols * rows);
  const stack = new Int32Array(cols * rows);
  let top = 0;
  for (let i = 0; i < cols; i++) {
    if (!solid[i]) {
      seen[i] = 1;
      stack[top++] = i;
    }
  }
  while (top > 0) {
    const k = stack[--top];
    const i = k % cols;
    const j = (k - i) / cols;
    if (i > 0 && !solid[k - 1] && !seen[k - 1]) {
      seen[k - 1] = 1;
      stack[top++] = k - 1;
    }
    if (i < cols - 1 && !solid[k + 1] && !seen[k + 1]) {
      seen[k + 1] = 1;
      stack[top++] = k + 1;
    }
    if (j > 0 && !solid[k - cols] && !seen[k - cols]) {
      seen[k - cols] = 1;
      stack[top++] = k - cols;
    }
    if (j < rows - 1 && !solid[k + cols] && !seen[k + cols]) {
      seen[k + cols] = 1;
      stack[top++] = k + cols;
    }
  }
  for (let k = 0; k < solid.length; k++) if (!seen[k]) solid[k] = 1;
}

export function buildMask(root: HTMLElement, targetCells = 46000): Mask {
  const bounds = root.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const cell = Math.min(7, Math.max(2.5, Math.sqrt((width * height) / targetCells)));
  const cols = Math.max(8, Math.ceil(width / cell));
  const rows = Math.max(8, Math.ceil(height / cell));

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const solid = new Uint8Array(cols * rows);
  if (!ctx) return { cols, rows, cell, solid };

  ctx.setTransform(1 / cell, 0, 0, 1 / cell, 0, 0);
  ctx.fillStyle = '#000';

  root.querySelectorAll<HTMLElement>('[data-flow-glyphs]').forEach((element) => {
    drawGlyphs(ctx, element, bounds.left, bounds.top);
  });
  // Letters claim a cell only when they cover most of it, so the gaps between
  // them stay open and the water can pass.
  const glyphs = ctx.getImageData(0, 0, cols, rows).data;
  for (let k = 0; k < solid.length; k++) if (glyphs[k * 4 + 3] > 150) solid[k] = 1;

  ctx.clearRect(0, 0, width + cell, height + cell);
  const blockElements = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-block]'));
  // Elements outside the root can stand in its stream too (the page header over the hero).
  if (root.id) {
    document
      .querySelectorAll<HTMLElement>(`[data-flow-for="${root.id}"]`)
      .forEach((element) => {
        if (!element.closest('.is-pinned')) blockElements.push(element);
      });
  }
  blockElements.forEach((element) => {
    drawBlock(ctx, element, bounds.left, bounds.top);
  });
  const blocks = ctx.getImageData(0, 0, cols, rows).data;
  for (let k = 0; k < solid.length; k++) if (blocks[k * 4 + 3] > 60) solid[k] = 1;

  sealUnreachable(solid, cols, rows);
  return { cols, rows, cell, solid };
}
