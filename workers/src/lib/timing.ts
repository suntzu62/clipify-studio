import { performance } from 'node:perf_hooks';

export function stopwatch() {
  const t0 = performance.now();
  return { elapsedMs: () => Math.round(performance.now() - t0) };
}
