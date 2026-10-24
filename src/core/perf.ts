/**
 * v4.2.1 performance recorder (?perf=1). Pure logic — no DOM — so the statistics are unit-tested.
 * The game feeds one sample per frame: the real frame interval, the JS update time and the time spent
 * submitting the render (CPU side). Reports average FPS and frame-time percentiles (p50 / p95 / p99).
 */
export interface PerfSample {
  /** frame interval (ms) */
  frame: number;
  /** JS update (game logic + scene updates) (ms) */
  js: number;
  /** render call (CPU submit; on software GL it includes rasterising) (ms) */
  render: number;
}

export interface PerfReport {
  frames: number;
  seconds: number;
  fps: number;
  frame: { p50: number; p95: number; p99: number; max: number };
  js: { avg: number; p95: number };
  render: { avg: number; p95: number };
  /** frames slower than 33.3 ms (dropped below 30 fps) */
  slow: number;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export class PerfRecorder {
  private frame: Float32Array;
  private js: Float32Array;
  private render: Float32Array;
  private n = 0;
  private head = 0;
  constructor(private capacity = 3600) {
    this.frame = new Float32Array(capacity);
    this.js = new Float32Array(capacity);
    this.render = new Float32Array(capacity);
  }
  add(s: PerfSample) {
    this.frame[this.head] = s.frame;
    this.js[this.head] = s.js;
    this.render[this.head] = s.render;
    this.head = (this.head + 1) % this.capacity;
    this.n = Math.min(this.capacity, this.n + 1);
  }
  reset() {
    this.n = 0;
    this.head = 0;
  }
  /** statistics over the last `last` frames (default: everything recorded) */
  report(last = this.n): PerfReport {
    const k = Math.min(last, this.n);
    const f: number[] = [];
    const j: number[] = [];
    const r: number[] = [];
    for (let i = 0; i < k; i++) {
      const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
      f.push(this.frame[idx]);
      j.push(this.js[idx]);
      r.push(this.render[idx]);
    }
    const sum = f.reduce((a, b) => a + b, 0);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    f.sort((a, b) => a - b);
    j.sort((a, b) => a - b);
    r.sort((a, b) => a - b);
    return {
      frames: k,
      seconds: r1(sum / 1000),
      fps: r1(k && sum ? (1000 * k) / sum : 0),
      frame: { p50: r1(pct(f, 0.5)), p95: r1(pct(f, 0.95)), p99: r1(pct(f, 0.99)), max: r1(f[f.length - 1] ?? 0) },
      js: { avg: r1(avg(j)), p95: r1(pct(j, 0.95)) },
      render: { avg: r1(avg(r)), p95: r1(pct(r, 0.95)) },
      slow: f.filter((x) => x > 33.4).length,
    };
  }
}
