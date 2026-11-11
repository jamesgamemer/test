// Everything is synthesised with WebAudio: night ambience, a slow pad score and all effects.
export class Audio {
  constructor() { this.ctx = null; this.vol = 0.7; this.fire = 0; this.zone = 'camp'; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // wind through the canopy
    const wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.09;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    wind.connect(wf); wf.connect(wg); wg.connect(this.master); wind.start();
    // fire crackle bed (gain follows distance to the nearest flame)
    const fire = ctx.createBufferSource(); fire.buffer = buf; fire.loop = true; fire.playbackRate.value = 0.6;
    const ff = ctx.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 900; ff.Q.value = 0.4;
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    fire.connect(ff); ff.connect(this.fireGain); this.fireGain.connect(this.master); fire.start();
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
    this._next = { cricket: ctx.currentTime + 1, crackle: ctx.currentTime + 0.5, chord: ctx.currentTime + 0.5, bell: ctx.currentTime + 6 };
    this._chord = 0;
    this._timer = setInterval(() => this._schedule(), 250);
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setFire(k) { this.fire = k; if (this.fireGain) this.fireGain.gain.setTargetAtTime(0.06 * k, this.ctx.currentTime, 0.3); }
  setZone(z) { this.zone = z; }

  _schedule() {
    const ctx = this.ctx, now = ctx.currentTime, n = this._next;
    if (now > n.cricket) {
      n.cricket = now + 0.5 + Math.random() * 2.4;
      const f = 3800 + Math.random() * 1400, g = 0.012 + Math.random() * 0.012, pan = Math.random() * 2 - 1;
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this._tone({ f, type: 'sine', t: now + i * 0.07, a: 0.004, d: 0.045, g, pan });
    }
    if (now > n.crackle) {
      n.crackle = now + 0.05 + Math.random() * 0.35;
      if (this.fire > 0.05) this._noise({ t: now, d: 0.02 + Math.random() * 0.03, g: 0.1 * this.fire * Math.random(), f: 1800 + Math.random() * 2500, q: 2, type: 'bandpass' });
    }
    if (now > n.chord) {
      // Am9 – Fmaj7 – Cmaj7 – Em7, voiced low and slow; the boss arena shifts to a darker pair
      const dark = this.zone === 'gate' || this.zone === 'rot';
      const sets = dark ? [[110, 164.8, 196, 261.6], [98, 146.8, 174.6, 233.1], [103.8, 155.6, 207.7, 246.9], [110, 164.8, 220, 261.6]]
        : [[110, 164.8, 261.6, 329.6, 493.9], [87.3, 174.6, 261.6, 329.6, 440], [130.8, 196, 246.9, 329.6, 392], [82.4, 164.8, 246.9, 293.7, 392]];
      const ch = sets[this._chord++ % sets.length], dur = 13;
      n.chord = now + dur - 3;
      ch.forEach((f, i) => {
        for (const det of [-4, 5]) this._tone({ f, type: i < 2 ? 'triangle' : 'sine', t: now, a: 4, d: dur, g: (i === 0 ? 0.05 : 0.026), det, out: this.musicGain, lp: 900 });
      });
    }
    if (now > n.bell) {
      n.bell = now + 3.5 + Math.random() * 7;
      const scale = [440, 493.9, 587.3, 659.3, 784, 880, 987.8, 1174.7];
      const f = scale[Math.floor(Math.random() * scale.length)];
      this._tone({ f, type: 'sine', t: now, a: 0.01, d: 3.2, g: 0.035, out: this.musicGain, pan: Math.random() * 1.4 - 0.7 });
      this._tone({ f: f * 2.01, type: 'sine', t: now, a: 0.01, d: 1.4, g: 0.01, out: this.musicGain });
    }
  }

  _tone({ f, f2 = null, type = 'sine', t = null, a = 0.005, d = 0.2, g = 0.2, det = 0, pan = 0, out = null, lp = 0 }) {
    const ctx = this.ctx; t = t ?? ctx.currentTime;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; node.connect(fl); node = fl; }
    node.connect(gn);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; gn.connect(p); p.connect(out || this.master); } else gn.connect(out || this.master);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  _noise({ t = null, d = 0.2, g = 0.2, f = 1000, f2 = null, q = 1, type = 'bandpass', a = 0.004 }) {
    const ctx = this.ctx; t = t ?? ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    s.connect(fl); fl.connect(gn); gn.connect(this.master);
    s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  }

  // dist: metres from the listener (0 = own action)
  sfx(name, dist = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const k = Math.max(0, 1 - dist / 42); if (k <= 0.02) return;
    const v = k * k, T = (o) => this._tone({ ...o, g: (o.g || 0.2) * v }), N = (o) => this._noise({ ...o, g: (o.g || 0.2) * v });
    const now = this.ctx.currentTime;
    switch (name) {
      case 'slash': N({ d: 0.16, g: 0.22, f: 2600, f2: 500, q: 0.8 }); break;
      case 'slash3': N({ d: 0.22, g: 0.3, f: 3200, f2: 300, q: 0.7 }); T({ f: 200, f2: 70, d: 0.18, g: 0.12 }); break;
      case 'wave': N({ d: 0.4, g: 0.2, f: 500, f2: 3000, q: 1.2 }); T({ f: 320, f2: 900, d: 0.35, g: 0.07, type: 'triangle' }); break;
      case 'dash': N({ d: 0.26, g: 0.24, f: 600, f2: 5000, q: 0.6, type: 'highpass' }); break;
      case 'nova': T({ f: 130, f2: 42, d: 0.7, g: 0.4 }); N({ d: 0.5, g: 0.16, f: 4000, f2: 600, q: 0.5 }); for (let i = 0; i < 4; i++) T({ f: 880 * (1 + i * 0.5), t: now + i * 0.04, d: 0.6, g: 0.03 }); break;
      case 'starcast': T({ f: 1400, f2: 240, d: 0.8, g: 0.09, type: 'triangle' }); break;
      case 'starfall': T({ f: 90, f2: 30, d: 1.0, g: 0.55 }); N({ d: 0.7, g: 0.3, f: 2500, f2: 200, q: 0.4, type: 'lowpass' }); for (let i = 0; i < 6; i++) T({ f: 1320 + Math.random() * 1400, t: now + i * 0.05, d: 0.5, g: 0.035 }); break;
      case 'hit': T({ f: 190, f2: 70, d: 0.09, g: 0.26 }); N({ d: 0.05, g: 0.13, f: 3000, q: 0.6 }); break;
      case 'crit': T({ f: 240, f2: 60, d: 0.14, g: 0.34 }); N({ d: 0.08, g: 0.2, f: 4200, q: 0.6 }); T({ f: 1760, d: 0.2, g: 0.05 }); break;
      case 'hurt': T({ f: 150, f2: 50, d: 0.2, g: 0.36, type: 'triangle' }); N({ d: 0.1, g: 0.14, f: 700, q: 0.7 }); break;
      case 'mobdie': N({ d: 0.4, g: 0.16, f: 1800, f2: 200, q: 0.8 }); T({ f: 420, f2: 90, d: 0.35, g: 0.1 }); break;
      case 'bolt': T({ f: 620, f2: 1300, d: 0.16, g: 0.09 }); break;
      case 'coin': T({ f: 1318, d: 0.12, g: 0.09 }); T({ f: 1760, t: now + 0.07, d: 0.22, g: 0.09 }); break;
      case 'pickup': T({ f: 880, f2: 1320, d: 0.16, g: 0.1 }); break;
      case 'loot': [659, 880, 1318].forEach((f, i) => T({ f, t: now + i * 0.07, d: 0.3, g: 0.09, type: 'triangle' })); break;
      case 'equip': N({ d: 0.05, g: 0.14, f: 1200, q: 1 }); T({ f: 300, d: 0.14, g: 0.1, type: 'triangle' }); break;
      case 'potion': T({ f: 300, f2: 900, d: 0.22, g: 0.14 }); T({ f: 500, f2: 1300, t: now + 0.1, d: 0.2, g: 0.09 }); break;
      case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => { T({ f, t: now + i * 0.11, d: 0.7, g: 0.13, type: 'triangle' }); T({ f: f * 2, t: now + i * 0.11, d: 0.4, g: 0.035 }); }); break;
      case 'quest': T({ f: 784, d: 0.3, g: 0.12, type: 'triangle' }); T({ f: 1175, t: now + 0.14, d: 0.5, g: 0.12, type: 'triangle' }); break;
      case 'boom': T({ f: 80, f2: 28, d: 0.9, g: 0.6 }); N({ d: 0.6, g: 0.35, f: 900, f2: 120, q: 0.4, type: 'lowpass' }); break;
      case 'roar': T({ f: 82, f2: 55, d: 1.0, g: 0.3, type: 'sawtooth', lp: 500 }); N({ d: 0.9, g: 0.14, f: 300, q: 0.6 }); break;
      case 'tele': T({ f: 220, f2: 440, d: 0.5, g: 0.05, type: 'triangle' }); break;
      case 'death': [220, 174.6, 146.8, 110].forEach((f, i) => T({ f, t: now + i * 0.22, d: 1.2, g: 0.14, type: 'triangle' })); break;
      case 'ui': T({ f: 1200, d: 0.04, g: 0.05 }); break;
      case 'deny': T({ f: 180, d: 0.12, g: 0.1, type: 'square', lp: 600 }); break;
      case 'gather': T({ f: 660, f2: 990, d: 0.25, g: 0.1 }); T({ f: 1320, t: now + 0.12, d: 0.4, g: 0.07 }); break;
    }
  }
}
