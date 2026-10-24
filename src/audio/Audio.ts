/**
 * Procedural Web Audio: every SFX is synthesized, plus a small synthwave
 * sequencer for music. Any SFX can be overridden by a real file via
 * `loadOverride(name, url)` (see assets/manifest.ts).
 */
export type Sfx =
  | 'coin' | 'lane' | 'up' | 'down' | 'land' | 'power' | 'shield' | 'shieldBreak' | 'crash' | 'explode'
  | 'near' | 'ring' | 'beep' | 'go' | 'mission' | 'click' | 'turbo' | 'respawn' | 'bump' | 'combo' | 'warp' | 'expire' | 'fanfare';

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private overrides = new Map<string, AudioBuffer>();
  private pendingOverrides: [string, string][] = [];
  sfxOn = true;
  musicOn = true;
  private coinPitch = 0;
  private coinPitchT = 0;
  // music
  private seqTimer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private bpm = 100;
  /** warm lowpass + echo for the music (pads / arp) */
  private musicTone!: BiquadFilterNode;
  private echo!: GainNode;
  intensity = 0; // 0 menu, 1 run, 2 turbo
  private playing = false;

  /** called when the context becomes able to sound (first gesture, back from background) */
  onRunning: (() => void) | null = null;
  /** performance.now() of the last request per SFX (Step 06.5 latency instrumentation) */
  lastPlayed: Partial<Record<Sfx, number>> = {};
  /** true once the context is running (sound can actually be heard) */
  get running() {
    return this.ctx?.state === 'running';
  }

  /**
   * Must be called from a real user gesture (browser autoplay policy) — Game calls it on every tap /
   * key until the context runs, so the first VALID gesture anywhere (Play, a menu button, the canvas)
   * unlocks sound; Settings is never needed. Creates the context once; afterwards only resumes it
   * (also from the iOS 'interrupted' state). Inside the gesture a 1-sample silent buffer is started:
   * WebKit only unlocks output when something starts from the gesture itself.
   */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => undefined);
        this.prime();
      }
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    c.addEventListener('statechange', () => {
      if (c.state === 'running') this.onRunning?.();
    });
    if (c.state !== 'running') c.resume().catch(() => undefined);
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.9 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
    this.musicBus.connect(this.master);
    // soft, airy mix: everything melodic goes through a gentle lowpass; the arp also feeds a
    // dotted-eighth echo so it shimmers like a road at night
    this.musicTone = c.createBiquadFilter();
    this.musicTone.type = 'lowpass';
    this.musicTone.frequency.value = 2600;
    this.musicTone.Q.value = 0.5;
    this.musicTone.connect(this.musicBus);
    this.echo = c.createGain();
    this.echo.gain.value = 0.55;
    const dl = c.createDelay(1);
    dl.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1800;
    this.echo.connect(dl).connect(damp).connect(fb).connect(dl);
    damp.connect(this.musicTone);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [n, u] of this.pendingOverrides) void this.loadOverride(n, u);
    this.pendingOverrides.length = 0;
    this.prime();
    if (c.state === 'running') queueMicrotask(() => this.onRunning?.());
  }

  /** silent 1-sample buffer started from the current gesture (WebKit output unlock) */
  private prime() {
    const c = this.ctx;
    if (!c) return;
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  }

  /** app hidden: stop the audio clock (no sounds pile up); shown: try to resume (a later tap also does) */
  setHidden(hidden: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (hidden) {
      if (c.state === 'running') c.suspend().catch(() => undefined);
    } else if (c.state !== 'running') c.resume().catch(() => undefined);
  }

  async loadOverride(name: string, url: string) {
    if (!this.ctx) {
      this.pendingOverrides.push([name, url]);
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.overrides.set(name, buf);
    } catch {
      /* keep procedural */
    }
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.value = on ? 0.9 : 0;
  }
  /** silence everything while an ad plays */
  duck(on: boolean) {
    if (this.ctx) this.master.gain.value = on ? 0 : 0.8;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.value = on ? 0.32 : 0;
  }

  // ---------------------------------------------------------------- helpers
  private osc(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, bus?: AudioNode, pan = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out: AudioNode = g;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    o.connect(g);
    out.connect(bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(t0: number, dur: number, vol: number, f0: number, f1: number, q = 1, type: BiquadFilterType = 'bandpass', bus?: AudioNode, pan = 0) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g);
    let out: AudioNode = g;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(bus ?? this.sfxBus);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
  }

  /** @param opt.delay seconds after now on the AUDIO clock (sample-accurate; never a timer) */
  play(name: Sfx, opt: { pan?: number; delay?: number } = {}) {
    this.lastPlayed[name] = performance.now();
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx;
    const t = c.currentTime + (opt.delay ?? 0);
    const ov = this.overrides.get(name);
    if (ov) {
      const s = c.createBufferSource();
      s.buffer = ov;
      s.connect(this.sfxBus);
      s.start(t);
      return;
    }
    const pan = opt.pan ?? 0;
    switch (name) {
      case 'coin': {
        // rising pitch on fast streaks
        if (t - this.coinPitchT > 0.6) this.coinPitch = 0;
        this.coinPitchT = t;
        const base = 1320 * Math.pow(2, Math.min(this.coinPitch, 12) / 24);
        this.coinPitch++;
        this.osc('square', base, base, t, 0.06, 0.06);
        this.osc('sine', base * 1.5, base * 1.5, t + 0.05, 0.16, 0.12);
        break;
      }
      case 'lane':
        this.noise(t, 0.16, 0.22, 900, 3200, 1.4, 'bandpass', undefined, pan);
        this.osc('sine', 300, 520, t, 0.1, 0.05, undefined, pan);
        break;
      case 'bump':
        this.osc('sine', 160, 90, t, 0.12, 0.2, undefined, pan);
        break;
      case 'up':
        // pneumatic "pssshh" of the air blast, then the thrusters spool up
        this.noise(t, 0.55, 0.42, 7000, 2500, 0.6, 'highpass');
        this.noise(t, 0.4, 0.2, 900, 3500, 0.9);
        this.osc('sawtooth', 160, 520, t + 0.05, 0.32, 0.05);
        break;
      case 'down':
        this.osc('sawtooth', 500, 140, t, 0.22, 0.07);
        this.noise(t, 0.22, 0.18, 2500, 400, 0.8);
        break;
      case 'land':
        // tyres touch down + an air release
        this.osc('sine', 120, 55, t, 0.16, 0.22);
        this.noise(t, 0.45, 0.3, 5000, 1500, 0.6, 'highpass');
        break;
      case 'power':
        [0, 4, 7, 12].forEach((n, i) => this.osc('triangle', 523 * Math.pow(2, n / 12), 523 * Math.pow(2, n / 12), t + i * 0.055, 0.2, 0.12));
        this.noise(t, 0.4, 0.08, 4000, 9000, 1);
        break;
      case 'shield':
        this.osc('sine', 400, 900, t, 0.35, 0.12);
        this.osc('sine', 600, 1350, t + 0.04, 0.35, 0.06);
        break;
      case 'shieldBreak':
        this.noise(t, 0.45, 0.4, 6000, 1200, 2);
        this.osc('triangle', 900, 200, t, 0.35, 0.12);
        break;
      case 'crash':
        this.noise(t, 0.6, 0.6, 2000, 120, 0.7, 'lowpass');
        this.osc('sine', 110, 35, t, 0.6, 0.45);
        break;
      case 'explode':
        this.noise(t, 1.2, 0.7, 1200, 60, 0.6, 'lowpass');
        this.osc('sine', 80, 25, t, 1.0, 0.5);
        break;
      case 'near':
        this.noise(t, 0.18, 0.3, 3000, 8000, 3, 'bandpass', undefined, pan);
        this.osc('square', 1800, 2600, t, 0.08, 0.04);
        break;
      case 'ring':
        [0, 7, 12].forEach((n, i) => this.osc('sine', 880 * Math.pow(2, n / 12), 880 * Math.pow(2, n / 12), t + i * 0.04, 0.3, 0.09));
        break;
      case 'beep':
        this.osc('square', 660, 660, t, 0.12, 0.08);
        break;
      case 'go':
        this.osc('square', 1320, 1320, t, 0.3, 0.09);
        this.osc('sawtooth', 660, 1320, t, 0.3, 0.05);
        break;
      case 'fanfare':
        // Step 06.5 class promotion: low swell + bright major chord, then a high sparkle (≈1.4 s)
        this.noise(t, 0.9, 0.12, 200, 2400, 0.5);
        [0, 7, 12].forEach((n) => this.osc('sawtooth', 220 * Math.pow(2, n / 12), 220 * Math.pow(2, n / 12), t + 0.05, 1.2, 0.05));
        [0, 4, 7, 12].forEach((n, i) => this.osc('square', 523 * Math.pow(2, n / 12), 523 * Math.pow(2, n / 12), t + 0.25 + i * 0.09, 0.5, 0.05));
        this.osc('triangle', 2093, 2637, t + 0.7, 0.6, 0.05);
        break;
      case 'mission':
        [0, 4, 7, 12, 16].forEach((n, i) => this.osc('square', 660 * Math.pow(2, n / 12), 660 * Math.pow(2, n / 12), t + i * 0.08, 0.22, 0.06));
        break;
      case 'combo':
        this.osc('triangle', 880, 1760, t, 0.18, 0.09);
        break;
      case 'click':
        this.osc('square', 900, 700, t, 0.05, 0.05);
        break;
      case 'turbo':
        this.noise(t, 1.0, 0.35, 300, 3000, 0.7);
        this.osc('sawtooth', 90, 300, t, 0.8, 0.1);
        break;
      case 'respawn':
        [12, 7, 4, 0].reverse().forEach((n, i) => this.osc('sine', 440 * Math.pow(2, n / 12), 440 * Math.pow(2, n / 12), t + i * 0.07, 0.3, 0.1));
        break;
      case 'warp':
        this.noise(t, 1.2, 0.4, 200, 6000, 1);
        this.osc('sawtooth', 60, 900, t, 1.0, 0.08);
        break;
      case 'expire':
        this.osc('triangle', 700, 350, t, 0.25, 0.08);
        break;
    }
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.seqTimer = window.setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    this.playing = false;
    if (this.seqTimer !== null) window.clearInterval(this.seqTimer);
    this.seqTimer = null;
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    const spb = 60 / this.bpm / 4; // 16th notes
    while (this.nextTime < c.currentTime + 0.12) {
      this.note(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 128;
    }
  }

  /** slow-attack pad voice (two detuned saws through the music lowpass) */
  private pad(midi: number, t0: number, dur: number, vol: number) {
    const c = this.ctx!;
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.9, dur * 0.35));
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(this.musicTone);
    for (const det of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = det;
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  }

  /** soft pluck for the arpeggio (sine + triangle), sent to the echo */
  private pluck(midi: number, t0: number, vol: number) {
    const c = this.ctx!;
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    g.connect(this.musicTone);
    g.connect(this.echo);
    for (const [type, mul] of [['sine', 1], ['triangle', 2]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = hz * mul;
      const og = c.createGain();
      og.gain.value = mul === 1 ? 1 : 0.25;
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + 0.45);
    }
  }

  /**
   * Original procedural soundtrack (no samples, no licensed material → safe for commercial use).
   * Calm synthwave: Fmaj7 – G6 – Em7 – Am7 at 100 bpm, warm pads, round bass, soft drums,
   * echoing arpeggio. Intensity 0 = menu (pads + arp only), 1 = run (drums in), 2 = turbo.
   */
  private note(step: number, t: number, spb: number) {
    const bus = this.musicBus;
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    // chord tones (relative) per bar: Fmaj7, G6, Em7, Am7
    const roots = [53, 55, 52, 57];
    const chords = [
      [0, 4, 7, 11],
      [0, 4, 7, 9],
      [0, 3, 7, 10],
      [0, 3, 7, 10],
    ];
    const bar = Math.floor(step / 16) % 4;
    const root = roots[bar];
    const ch = chords[bar];
    const s = step % 16;
    const run = this.intensity >= 1;
    // pads: whole-bar chord, gentle attack
    if (s === 0) for (const iv of ch) this.pad(root + 12 + iv, t, spb * 16.5, run ? 0.022 : 0.03);
    // round bass: root on 1, fifth on the "and" of 2, octave pickup
    if (s === 0 || s === 6 || s === 10 || s === 14) {
      const m = root - 12 + (s === 6 ? 7 : s === 14 ? 12 : 0);
      this.osc('triangle', hz(m), hz(m), t, spb * (s === 0 ? 3.5 : 1.8), run ? 0.16 : 0.1, this.musicTone);
    }
    // arpeggio (8ths, up-down through the chord), sparkle an octave up in turbo
    if (s % 2 === 0) {
      const seq = [0, 1, 2, 3, 2, 1, 2, 3];
      const m = root + 24 + ch[seq[(s / 2) % 8]] + (this.intensity >= 2 ? 12 : 0);
      this.pluck(m, t, run ? 0.05 : 0.04);
    }
    if (!run) return;
    // soft kick on 1 and 3 (four-on-the-floor only in turbo)
    if (s % 8 === 0 || (this.intensity >= 2 && s % 4 === 0)) this.osc('sine', 110, 42, t, 0.22, 0.32, bus);
    // light shaker on off-beats
    if (s % 4 === 2) this.noise(t, 0.05, 0.05, 7000, 7000, 0.8, 'highpass', bus);
    // brushed clap on 2 and 4
    if (s === 4 || s === 12) this.noise(t, 0.18, 0.09, 1400, 900, 0.7, 'bandpass', bus);
  }
}
