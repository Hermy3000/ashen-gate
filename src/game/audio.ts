export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  muted = false;
  private volume = 0.7;

  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const master = ctx.createGain();
      const sfx = ctx.createGain();
      const music = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      sfx.gain.value = 0.9;
      music.gain.value = 0.22;
      sfx.connect(master);
      music.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.sfx = sfx;
      this.music = music;
      this.startDrone();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(
      muted ? 0 : this.volume,
      this.ctx.currentTime,
      0.03,
    );
  }

  place() {
    this.blip(180, 0.08, 0.12, "square");
    this.blip(90, 0.12, 0.08, "sine", 0.04);
  }

  shoot(kind: "bolt" | "bomb" | "ice") {
    if (kind === "bolt") {
      this.noise(0.05, 0.12, 1800);
      this.blip(420, 0.06, 0.08, "square");
    } else if (kind === "bomb") {
      this.blip(70, 0.16, 0.2, "sine");
      this.noise(0.08, 0.14, 400);
    } else {
      this.blip(720, 0.08, 0.07, "triangle");
      this.blip(1080, 0.1, 0.05, "sine", 0.03);
    }
  }

  hit() {
    this.blip(220 + Math.random() * 80, 0.04, 0.07, "square");
  }

  death() {
    this.noise(0.12, 0.16, 500);
    this.blip(110, 0.14, 0.1, "sawtooth");
  }

  leak() {
    this.blip(160, 0.18, 0.16, "sawtooth");
    this.blip(120, 0.22, 0.12, "square", 0.05);
  }

  wave() {
    this.blip(196, 0.18, 0.12, "sine");
    this.blip(247, 0.22, 0.1, "sine", 0.08);
  }

  upgrade() {
    this.blip(523, 0.08, 0.08, "sine");
    this.blip(659, 0.1, 0.08, "sine", 0.06);
    this.blip(784, 0.14, 0.09, "sine", 0.12);
  }

  sell() {
    this.blip(300, 0.08, 0.08, "triangle");
    this.blip(180, 0.12, 0.1, "sine", 0.05);
  }

  victory() {
    const notes = [392, 494, 587, 784];
    notes.forEach((n, i) => this.blip(n, 0.28, 0.12, "sine", i * 0.12));
  }

  defeat() {
    this.blip(196, 0.3, 0.16, "sawtooth");
    this.blip(147, 0.4, 0.14, "sine", 0.12);
  }

  private startDrone() {
    const ctx = this.ctx;
    const music = this.music;
    if (!ctx || !music) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc2.type = "sine";
    osc.frequency.value = 55;
    osc2.frequency.value = 82.4;
    g.gain.value = 0.18;
    osc.connect(g);
    osc2.connect(g);
    g.connect(music);
    osc.start();
    osc2.start();
    this.drone = osc;
  }

  private blip(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
    delay = 0,
  ) {
    const ctx = this.ctx;
    const sfx = this.sfx;
    if (!ctx || !sfx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.6), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private noise(dur: number, gain: number, cutoff: number) {
    const ctx = this.ctx;
    const sfx = this.sfx;
    if (!ctx || !sfx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }
}
