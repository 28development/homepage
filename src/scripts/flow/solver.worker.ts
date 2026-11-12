/// <reference lib="webworker" />
import { solve, type Grid } from './solver';

interface Job extends Grid {
  id: number;
}

let current = 0;

self.onmessage = (event: MessageEvent<Job>) => {
  const job = event.data;
  current = job.id;
  void solve(
    job,
    (field, done) => {
      (self as DedicatedWorkerGlobalScope).postMessage(
        { id: job.id, vx: field.vx, vy: field.vy, done },
        [field.vx.buffer, field.vy.buffer],
      );
    },
    () => current === job.id,
  );
};
