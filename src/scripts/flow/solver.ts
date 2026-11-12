/**
 * Potential flow through a field of obstacles.
 *
 * The water enters at the top edge and leaves at the bottom. Solving
 * Laplace's equation for the potential (fixed at the two edges, no flux
 * into stone) gives a velocity field that is incompressible and squeezes
 * through every gap, which is what makes the stream read as water.
 *
 * Solved coarse-to-fine with successive over-relaxation.
 */

export interface Grid {
  cols: number;
  rows: number;
  solid: Uint8Array;
}

export interface Field {
  /** Velocity per cell, scaled so the mean inflow speed is 1. */
  vx: Float32Array;
  vy: Float32Array;
}

function coarsen(fine: Grid): Grid {
  const cols = Math.ceil(fine.cols / 2);
  const rows = Math.ceil(fine.rows / 2);
  const solid = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // Stone only if every child is stone: gaps survive the coarsening.
      let all = 1;
      for (let dj = 0; dj < 2 && all; dj++) {
        for (let di = 0; di < 2; di++) {
          const fi = Math.min(fine.cols - 1, i * 2 + di);
          const fj = Math.min(fine.rows - 1, j * 2 + dj);
          if (!fine.solid[fj * fine.cols + fi]) {
            all = 0;
            break;
          }
        }
      }
      solid[j * cols + i] = all;
    }
  }
  return { cols, rows, solid };
}

function initial(grid: Grid): Float32Array {
  const phi = new Float32Array(grid.cols * grid.rows);
  for (let j = 0; j < grid.rows; j++) {
    const value = j / (grid.rows - 1);
    phi.fill(value, j * grid.cols, (j + 1) * grid.cols);
  }
  return phi;
}

function prolong(coarsePhi: Float32Array, coarse: Grid, fine: Grid): Float32Array {
  const phi = new Float32Array(fine.cols * fine.rows);
  for (let j = 0; j < fine.rows; j++) {
    const cj = Math.min(coarse.rows - 1, j >> 1);
    for (let i = 0; i < fine.cols; i++) {
      const ci = Math.min(coarse.cols - 1, i >> 1);
      phi[j * fine.cols + i] = coarsePhi[cj * coarse.cols + ci];
    }
  }
  pin(phi, fine);
  return phi;
}

function pin(phi: Float32Array, grid: Grid): void {
  const last = (grid.rows - 1) * grid.cols;
  for (let i = 0; i < grid.cols; i++) {
    phi[i] = 0;
    phi[last + i] = 1;
  }
}

function relax(phi: Float32Array, grid: Grid, iterations: number, omega: number): void {
  const { cols, rows, solid } = grid;
  for (let n = 0; n < iterations; n++) {
    // Alternate the sweep direction so the result has no directional bias.
    const forward = (n & 1) === 0;
    for (let jj = 1; jj < rows - 1; jj++) {
      const j = forward ? jj : rows - 1 - jj;
      const row = j * cols;
      for (let ii = 0; ii < cols; ii++) {
        const i = forward ? ii : cols - 1 - ii;
        const k = row + i;
        if (solid[k]) continue;
        let sum = 0;
        let count = 0;
        if (i > 0 && !solid[k - 1]) {
          sum += phi[k - 1];
          count++;
        }
        if (i < cols - 1 && !solid[k + 1]) {
          sum += phi[k + 1];
          count++;
        }
        if (!solid[k - cols]) {
          sum += phi[k - cols];
          count++;
        }
        if (!solid[k + cols]) {
          sum += phi[k + cols];
          count++;
        }
        if (count === 0) continue;
        phi[k] += omega * (sum / count - phi[k]);
      }
    }
  }
}

export function velocity(phi: Float32Array, grid: Grid): Field {
  const { cols, rows, solid } = grid;
  const vx = new Float32Array(cols * rows);
  const vy = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (solid[k]) continue;
      const here = phi[k];
      const left = i > 0 && !solid[k - 1] ? phi[k - 1] : here;
      const right = i < cols - 1 && !solid[k + 1] ? phi[k + 1] : here;
      vx[k] = (right - left) * 0.5;
      if (j === 0) vy[k] = solid[k + cols] ? 0 : phi[k + cols] - here;
      else if (j === rows - 1) vy[k] = solid[k - cols] ? 0 : here - phi[k - cols];
      else {
        const up = solid[k - cols] ? here : phi[k - cols];
        const down = solid[k + cols] ? here : phi[k + cols];
        vy[k] = (down - up) * 0.5;
      }
    }
  }
  // Scale so the mean speed of the water entering at the top is 1.
  let inflow = 0;
  let open = 0;
  const probe = Math.min(rows - 1, 1) * cols;
  for (let i = 0; i < cols; i++) {
    if (!solid[probe + i]) {
      inflow += vy[probe + i];
      open++;
    }
  }
  const mean = open ? inflow / open : 0;
  if (mean > 1e-9) {
    const scale = 1 / mean;
    for (let k = 0; k < vx.length; k++) {
      vx[k] *= scale;
      vy[k] *= scale;
    }
  } else {
    // Fully dammed (should not happen): fall back to a plain downward stream.
    for (let k = 0; k < vx.length; k++) {
      vx[k] = 0;
      vy[k] = solid[k] ? 0 : 1;
    }
  }
  return { vx, vy };
}

/** A plain downward stream, used until the solver has answered. */
export function uniform(grid: Grid): Field {
  const vx = new Float32Array(grid.cols * grid.rows);
  const vy = new Float32Array(grid.cols * grid.rows);
  for (let k = 0; k < vy.length; k++) vy[k] = grid.solid[k] ? 0 : 1;
  return { vx, vy };
}

/**
 * Solves in slices and reports the field as it improves.
 * `alive` lets the caller abandon a job that has been superseded.
 */
export async function solve(
  grid: Grid,
  report: (field: Field, done: boolean) => void,
  alive: () => boolean,
): Promise<void> {
  const levels: Grid[] = [grid];
  while (levels.length < 3) {
    const last = levels[levels.length - 1];
    if (Math.min(last.cols, last.rows) < 48) break;
    levels.push(coarsen(last));
  }

  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  let phi: Float32Array | null = null;

  for (let l = levels.length - 1; l >= 0; l--) {
    const level = levels[l];
    phi = phi ? prolong(phi, levels[l + 1], level) : initial(level);
    const finest = l === 0;
    const total = finest ? 960 : 420;
    const omega = finest ? 1.94 : 1.9;
    const slice = 60;
    for (let done = 0; done < total; done += slice) {
      relax(phi, level, slice, omega);
      await pause();
      if (!alive()) return;
      if (finest && (done === 0 || done % 240 === 180)) report(velocity(phi, level), false);
    }
  }
  if (phi) report(velocity(phi, grid), true);
}
