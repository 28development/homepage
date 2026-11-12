/**
 * The flood.
 *
 * A stream of ink runs down through its root element and parts around
 * whatever stands in it: the letters of a name, a block of text, the
 * visitor's pointer.
 *
 *   live   particles are carried by the field and leave fading strokes
 *   still  the streamlines are drawn once and left standing
 *
 * `still` is what visitors get who prefer reduced motion, and what the
 * strength control shows at zero.
 */

import { buildMask, type Mask } from './mask';
import { solve, uniform, type Field } from './solver';
import { Trails, STROKE_VERTICES, VERTEX_FLOATS } from './trails';

export interface FlowOptions {
  /** Ink colour as #rrggbb. */
  colour: string;
  /** Multiplies the number of lines. */
  density: number;
  /** 0 = still, 1 = storm. */
  strength: number;
  /** Let the first wave pour in from the top edge. */
  pour: boolean;
  /** React to the pointer. */
  pointer: boolean;
  /** Opacity of the ink. */
  alpha: number;
}

const DEFAULTS: FlowOptions = {
  colour: '#38450f',
  density: 1,
  strength: 0.4,
  pour: false,
  pointer: true,
  alpha: 0.9,
};

const QUAD = STROKE_VERTICES * VERTEX_FLOATS;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim().replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [0.22, 0.27, 0.06];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Flow {
  private options: FlowOptions;
  private trails: Trails;
  private worker: Worker | null = null;
  private job = 0;
  private mask: Mask | null = null;
  private field: Field | null = null;
  private settled = false;

  private width = 1;
  private height = 1;
  private colour: [number, number, number];

  // Particles, struct of arrays.
  private count = 0;
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private value = new Float32Array(0);
  private halfWidth = new Float32Array(0);
  private age = new Float32Array(0);
  private stuck = new Float32Array(0);
  private vertices = new Float32Array(0);

  private frame = 0;
  private last = 0;
  private time = 0;
  private fadeDebt = 0;
  private surge = 1;
  private visible = false;
  private started = false;
  /** The standing drawing has to be made (again). */
  private dirty = true;
  private boost = 1;
  private boostTarget = 1;

  private pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, power: 0 };
  private observer: IntersectionObserver;
  private resizer: ResizeObserver;
  private resizeTimer = 0;
  private disposers: (() => void)[] = [];

  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
    options: Partial<FlowOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.colour = hexToRgb(this.options.colour);
    this.trails = new Trails(canvas);

    try {
      this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event) => this.receive(event.data);
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        this.solveHere();
      };
    } catch {
      this.worker = null;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        this.visible = entries.some((entry) => entry.isIntersecting);
        this.schedule();
      },
      { rootMargin: '80px 0px' },
    );
    this.resizer = new ResizeObserver(() => {
      if (this.root.clientWidth === this.width && this.root.clientHeight === this.height) return;
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.measure(), 180);
    });

    if (this.options.pointer) this.listen();

    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    };
    const restored = () => {
      this.trails.setup();
      this.measure();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.disposers.push(() => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    });
  }

  /** Reads the page, builds the obstacles and lets the water in. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.observer.observe(this.root);
    this.resizer.observe(this.root);
    this.measure();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.resizeTimer);
    this.observer.disconnect();
    this.resizer.disconnect();
    this.worker?.terminate();
    this.disposers.forEach((dispose) => dispose());
  }

  /** Reads the page again, for when the obstacles have moved. */
  refresh(): void {
    if (this.started) this.measure();
  }

  /** 0 draws the standing streamlines, anything above lets them run. */
  setStrength(strength: number): void {
    const next = Math.min(1, Math.max(0, strength));
    const wasLive = this.options.strength > 0;
    this.options.strength = next;
    if (!this.started || !this.field) return;
    if (next > 0 && !wasLive) {
      this.trails.clear();
      this.populate(false);
    }
    if (next === 0) this.dirty = true;
    this.resizeParticles();
    this.schedule();
  }

  /** Re-inks the lines, for when the palette changes. */
  setColour(hex: string): void {
    this.colour = hexToRgb(hex);
    this.dirty = true;
    this.schedule();
  }

  /** A temporary push, used while a preview is hovered. */
  setBoost(boost: number): void {
    this.boostTarget = boost;
  }

  get strength(): number {
    return this.options.strength;
  }

  // ---------------------------------------------------------------- setup

  private listen(): void {
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const bounds = this.root.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      const p = this.pointer;
      if (p.active) {
        p.vx = p.vx * 0.6 + (px - p.x) * 0.4 * 60;
        p.vy = p.vy * 0.6 + (py - p.y) * 0.4 * 60;
      }
      p.x = px;
      p.y = py;
      p.active = true;
    };
    const leave = () => {
      this.pointer.active = false;
    };
    this.root.addEventListener('pointermove', move, { passive: true });
    this.root.addEventListener('pointerleave', leave, { passive: true });
    this.disposers.push(() => {
      this.root.removeEventListener('pointermove', move);
      this.root.removeEventListener('pointerleave', leave);
    });
  }

  private measure(): void {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    if (width < 2 || height < 2) return;
    const resized = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;

    const small = width < 720;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75);
    this.trails.resize(width, height, dpr);

    this.mask = buildMask(this.root, small ? 30000 : 46000);
    const first = !this.field;
    // Until the solver answers, the water simply falls.
    if (first || resized) this.field = uniform(this.mask);
    this.settled = false;

    this.job++;
    const { cols, rows, solid } = this.mask;
    if (this.worker) {
      this.worker.postMessage({ id: this.job, cols, rows, solid: solid.slice() });
    } else {
      this.solveHere();
    }

    this.resizeParticles();
    if (first) this.populate(this.options.pour && this.options.strength > 0);
    this.dirty = true;
    this.schedule();
  }

  private solveHere(): void {
    if (!this.mask) return;
    const id = this.job;
    const { cols, rows, solid } = this.mask;
    void solve(
      { cols, rows, solid },
      (field, done) => this.receive({ id, vx: field.vx, vy: field.vy, done }),
      () => id === this.job,
    );
  }

  private receive(message: { id: number; vx: Float32Array; vy: Float32Array; done: boolean }): void {
    if (message.id !== this.job || !this.mask) return;
    if (message.vx.length !== this.mask.cols * this.mask.rows) return;
    this.field = { vx: message.vx, vy: message.vy };
    if (message.done) {
      // A standing drawing is only worth making from the settled field.
      this.settled = true;
      this.schedule();
    }
  }

  private isLive(): boolean {
    return this.options.strength > 0;
  }

  private target(): number {
    const area = this.width * this.height;
    const base = Math.round((area / 430) * this.options.density);
    const scale = 0.7 + 0.6 * this.options.strength;
    return Math.max(120, Math.min(9000, Math.round(base * scale)));
  }

  private resizeParticles(): void {
    const next = this.target();
    if (next === this.count) return;
    const grow = (old: Float32Array) => {
      const array = new Float32Array(next);
      array.set(old.subarray(0, Math.min(old.length, next)));
      return array;
    };
    const previous = this.count;
    this.x = grow(this.x);
    this.y = grow(this.y);
    this.value = grow(this.value);
    this.halfWidth = grow(this.halfWidth);
    this.age = grow(this.age);
    this.stuck = grow(this.stuck);
    this.count = next;
    for (let i = previous; i < next; i++) this.spawn(i, true);
    this.vertices = new Float32Array(next * QUAD);
    this.trails.reserve(next);
  }

  /** Scatters every particle: over the whole field, or above the top edge. */
  private populate(pour: boolean): void {
    for (let i = 0; i < this.count; i++) {
      this.spawn(i, !pour);
      if (pour) this.y[i] = -Math.random() * this.height * 0.75;
    }
    this.surge = pour ? 3.2 : 1;
  }

  private spawn(i: number, anywhere: boolean): void {
    const mask = this.mask;
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      x = Math.random() * this.width;
      y = anywhere ? Math.random() * this.height : -Math.random() * 8;
      if (!mask || !this.solidAt(x, Math.max(0, y))) break;
    }
    this.x[i] = x;
    this.y[i] = y;
    this.age[i] = anywhere ? Math.random() * 0.4 : 0;
    this.stuck[i] = 0;
    // Three weights of line: most are fine, a few carry more ink.
    const r = Math.random();
    this.value[i] = r < 0.55 ? 0.42 + Math.random() * 0.2 : r < 0.9 ? 0.7 + Math.random() * 0.15 : 1;
    this.halfWidth[i] = r < 0.9 ? 0.5 : 0.72;
  }

  private solidAt(x: number, y: number): boolean {
    const mask = this.mask!;
    const i = Math.floor(x / mask.cell);
    const j = Math.floor(y / mask.cell);
    if (i < 0 || j < 0 || i >= mask.cols || j >= mask.rows) return false;
    return mask.solid[j * mask.cols + i] === 1;
  }

  // ----------------------------------------------------------------- loop

  private schedule(): void {
    if (!this.started || !this.field) return;
    if (!this.visible) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      return;
    }
    if (this.isLive()) {
      if (!this.frame) {
        this.last = 0;
        this.frame = requestAnimationFrame(this.tick);
      }
      return;
    }
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.dirty && this.settled) this.frame = requestAnimationFrame(this.drawStill);
  }

  private tick = (now: number): void => {
    this.frame = 0;
    if (!this.visible || !this.isLive()) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 30) : 1 / 60;
    this.last = now;
    this.time += dt;

    const strength = this.options.strength;
    this.boost += (this.boostTarget - this.boost) * Math.min(1, dt * 4);
    this.surge += (1 - this.surge) * Math.min(1, dt * 1.1);
    const p = this.pointer;
    p.power += ((p.active ? 1 : 0) - p.power) * Math.min(1, dt * 6);
    p.vx *= Math.max(0, 1 - dt * 5);
    p.vy *= Math.max(0, 1 - dt * 5);

    const strokes = this.advance(dt, strength);

    const trail = 1.7 - 0.8 * strength;
    this.fadeDebt += (dt * 255) / trail;
    const levels = Math.floor(this.fadeDebt);
    this.fadeDebt -= levels;
    this.trails.fade(levels);
    this.trails.strokesFrom(this.vertices, strokes);
    this.trails.present(this.colour, this.options.alpha);

    this.frame = requestAnimationFrame(this.tick);
  };

  /** Moves every particle one step and writes its stroke. Returns the stroke count. */
  private advance(dt: number, strength: number): number {
    const mask = this.mask!;
    const field = this.field!;
    const { cols, rows, cell } = mask;
    const { vx, vy } = field;
    const W = this.width;
    const H = this.height;
    const speed = (46 + 250 * strength) * this.surge * this.boost;
    const turbulence = 0.08 + 0.85 * strength * strength;
    const t = this.time;
    const k1 = (Math.PI * 2) / 420;
    const k2 = (Math.PI * 2) / 190;

    const p = this.pointer;
    const radius = Math.min(72, Math.max(40, W * 0.05));
    const r2 = radius * radius;
    const stir = p.power * 0.0032;

    const X = this.x;
    const Y = this.y;
    const out = this.vertices;
    let strokes = 0;

    for (let i = 0; i < this.count; i++) {
      const x = X[i];
      const y = Y[i];

      // Bilinear sample of the field.
      let gx = x / cell - 0.5;
      let gy = (y < 0 ? 0 : y) / cell - 0.5;
      if (gx < 0) gx = 0;
      else if (gx > cols - 1.001) gx = cols - 1.001;
      if (gy < 0) gy = 0;
      else if (gy > rows - 1.001) gy = rows - 1.001;
      const i0 = gx | 0;
      const j0 = gy | 0;
      const fx = gx - i0;
      const fy = gy - j0;
      const k = j0 * cols + i0;
      const a = (1 - fx) * (1 - fy);
      const b = fx * (1 - fy);
      const c = (1 - fx) * fy;
      const d = fx * fy;
      let u = vx[k] * a + vx[k + 1] * b + vx[k + cols] * c + vx[k + cols + 1] * d;
      let v = vy[k] * a + vy[k + 1] * b + vy[k + cols] * c + vy[k + cols + 1] * d;

      // Even out the speed: fast in the gaps, never dead in the lee.
      const m = Math.sqrt(u * u + v * v);
      if (m > 1e-4) {
        const s = Math.min(2.3, Math.max(0.32, Math.pow(m, 0.62))) / m;
        u *= s;
        v *= s;
      } else {
        u = 0;
        v = 0.32;
        this.stuck[i] += dt * 30;
      }

      // Turbulence: the curl of a slowly drifting potential, so it adds
      // eddies without creating or destroying water.
      const ax = x * k1 + t * 0.21;
      const ay = y * k1 - t * 0.13;
      const bx = x * k2 - t * 0.17;
      const by = y * k2 + t * 0.29;
      u += turbulence * (-Math.sin(ax) * Math.sin(ay) + 0.5 * Math.cos(bx) * Math.cos(by));
      v += turbulence * (-Math.cos(ax) * Math.cos(ay) + 0.5 * Math.sin(bx) * Math.sin(by));

      // The pointer is a stone in the stream: ideal flow around a cylinder.
      if (p.power > 0.01) {
        const dx = x - p.x;
        const dy = y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2 * 36) {
          const dist = Math.sqrt(d2) || 1;
          const nx = dx / dist;
          const ny = dy / dist;
          if (d2 < r2) {
            const push = (1 - dist / radius) * 5 * p.power;
            u += nx * push;
            v += ny * push;
          } else {
            const q = (r2 / d2) * p.power;
            const along = u * nx + v * ny;
            u += q * (u - 2 * along * nx);
            v += q * (v - 2 * along * ny);
          }
          const wake = Math.exp(-d2 / (r2 * 4)) * stir;
          u += p.vx * wake;
          v += p.vy * wake;
        }
      }

      let nx = x + u * speed * dt;
      let ny = y + v * speed * dt;

      if (ny >= 0 && this.solidAt(nx, ny)) {
        if (!this.solidAt(nx, y)) ny = y;
        else if (!this.solidAt(x, ny)) nx = x;
        else {
          nx = x;
          ny = y;
        }
        this.stuck[i] += dt * 60;
      } else if (this.stuck[i] > 0) {
        this.stuck[i] -= dt * 20;
      }

      if (ny > H + 6 || nx < -6 || nx > W + 6 || this.stuck[i] > 26) {
        this.spawn(i, false);
        continue;
      }

      const age = this.age[i];
      this.age[i] = age + dt;
      X[i] = nx;
      Y[i] = ny;
      if (ny < 0) continue;

      const sx = nx - x;
      const sy = ny - y;
      const length = Math.sqrt(sx * sx + sy * sy);
      if (length < 0.02) continue;

      const hw = this.halfWidth[i] + 0.55;
      const value = this.value[i] * Math.min(1, age * 2.5);
      const ex = (sx / length) * hw * 0.5;
      const ey = (sy / length) * hw * 0.5;
      const px = (-sy / length) * hw;
      const py = (sx / length) * hw;
      const o = strokes * QUAD;
      const x0 = x - ex;
      const y0 = y - ey;
      const x1 = nx + ex;
      const y1 = ny + ey;
      out[o] = x0 + px;
      out[o + 1] = y0 + py;
      out[o + 2] = 1;
      out[o + 3] = value;
      out[o + 4] = hw;
      out[o + 5] = x0 - px;
      out[o + 6] = y0 - py;
      out[o + 7] = -1;
      out[o + 8] = value;
      out[o + 9] = hw;
      out[o + 10] = x1 + px;
      out[o + 11] = y1 + py;
      out[o + 12] = 1;
      out[o + 13] = value;
      out[o + 14] = hw;
      out[o + 15] = x1 - px;
      out[o + 16] = y1 - py;
      out[o + 17] = -1;
      out[o + 18] = value;
      out[o + 19] = hw;
      strokes++;
    }
    return strokes;
  }

  /** The standing drawing: streamlines traced once through the settled field. */
  private drawStill = (): void => {
    this.frame = 0;
    if (!this.mask || !this.field) return;
    this.dirty = false;
    const mask = this.mask;
    const { cols, rows, cell } = mask;
    const { vx, vy } = this.field;
    const W = this.width;
    const H = this.height;

    const spacing = 11 / Math.sqrt(this.options.density);
    const fromTop = Math.max(12, Math.round(W / spacing));
    const scattered = Math.round(fromTop * 0.45);
    const seeds = fromTop + scattered;
    const step = 3;
    const steps = Math.ceil((H * 1.15) / step);

    const sx = new Float32Array(seeds);
    const sy = new Float32Array(seeds);
    const value = new Float32Array(seeds);
    const half = new Float32Array(seeds);
    const budget = new Int32Array(seeds);
    for (let i = 0; i < seeds; i++) {
      if (i < fromTop) {
        sx[i] = ((i + 0.2 + Math.random() * 0.6) / fromTop) * W;
        sy[i] = 0.5;
        budget[i] = steps;
      } else {
        sx[i] = Math.random() * W;
        sy[i] = Math.random() * H;
        budget[i] = Math.round(steps * (0.15 + Math.random() * 0.3));
      }
      if (this.solidAt(sx[i], sy[i])) budget[i] = 0;
      const r = Math.random();
      value[i] = r < 0.55 ? 0.4 + Math.random() * 0.2 : r < 0.9 ? 0.68 + Math.random() * 0.15 : 1;
      half[i] = r < 0.9 ? 0.5 : 0.72;
    }

    const out = new Float32Array(seeds * QUAD);
    this.trails.reserve(seeds);
    this.trails.clear();

    for (let n = 0; n < steps; n++) {
      let strokes = 0;
      for (let i = 0; i < seeds; i++) {
        if (budget[i] <= 0) continue;
        budget[i]--;
        const x = sx[i];
        const y = sy[i];
        let gx = x / cell - 0.5;
        let gy = y / cell - 0.5;
        if (gx < 0) gx = 0;
        else if (gx > cols - 1.001) gx = cols - 1.001;
        if (gy < 0) gy = 0;
        else if (gy > rows - 1.001) gy = rows - 1.001;
        const i0 = gx | 0;
        const j0 = gy | 0;
        const fx = gx - i0;
        const fy = gy - j0;
        const k = j0 * cols + i0;
        const a = (1 - fx) * (1 - fy);
        const b = fx * (1 - fy);
        const c = (1 - fx) * fy;
        const d = fx * fy;
        const u = vx[k] * a + vx[k + 1] * b + vx[k + cols] * c + vx[k + cols + 1] * d;
        const v = vy[k] * a + vy[k + 1] * b + vy[k + cols] * c + vy[k + cols + 1] * d;
        const m = Math.sqrt(u * u + v * v);
        if (m < 0.02) {
          budget[i] = 0;
          continue;
        }
        const nx = x + (u / m) * step;
        const ny = y + (v / m) * step;
        if (ny > H || nx < 0 || nx > W || this.solidAt(nx, ny)) {
          budget[i] = 0;
          continue;
        }
        sx[i] = nx;
        sy[i] = ny;

        const hw = half[i] + 0.55;
        const dx = nx - x;
        const dy = ny - y;
        const ex = (dx / step) * hw * 0.5;
        const ey = (dy / step) * hw * 0.5;
        const px = (-dy / step) * hw;
        const py = (dx / step) * hw;
        const o = strokes * QUAD;
        const x0 = x - ex;
        const y0 = y - ey;
        const x1 = nx + ex;
        const y1 = ny + ey;
        out[o] = x0 + px;
        out[o + 1] = y0 + py;
        out[o + 2] = 1;
        out[o + 3] = value[i];
        out[o + 4] = hw;
        out[o + 5] = x0 - px;
        out[o + 6] = y0 - py;
        out[o + 7] = -1;
        out[o + 8] = value[i];
        out[o + 9] = hw;
        out[o + 10] = x1 + px;
        out[o + 11] = y1 + py;
        out[o + 12] = 1;
        out[o + 13] = value[i];
        out[o + 14] = hw;
        out[o + 15] = x1 - px;
        out[o + 16] = y1 - py;
        out[o + 17] = -1;
        out[o + 18] = value[i];
        out[o + 19] = hw;
        strokes++;
      }
      if (strokes === 0) break;
      this.trails.strokesFrom(out, strokes);
    }
    this.trails.present(this.colour, this.options.alpha * 0.8);
  };
}
