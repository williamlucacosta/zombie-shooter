// Motore audio: WebAudio puro con tre bus (master/musica/sfx), suoni da file
// (manifest sotto) con fallback su un sintetizzatore procedurale, pan posizionale
// e ambiente sonoro (vento + drone) generato proceduralmente sotto la musica.

// I file vengono cercati in assets/audio/. Le chiavi con array offrono varianti casuali.
const AUDIO_MANIFEST = {
  zombie_growl: [
    'zombie_growl_1.mp3', 'zombie_growl_2.mp3', 'zombie_growl_3.mp3', 'zombie_growl_4.mp3',
    'zombie_growl_5.mp3', 'zombie_growl_6.mp3', 'zombie_growl_7.wav', 'zombie_growl_8.wav',
    'zombie_growl_9.wav', 'zombie_growl_10.wav',
  ],
  zombie_attack: ['zombie_attack_1.wav', 'zombie_attack_2.wav', 'zombie_attack_3.wav', 'zombie_attack_4.wav'],
  zombie_death: ['zombie_death_1.wav', 'zombie_death_2.wav', 'zombie_death_3.wav'],
  boss_roar: ['boss_roar.wav'],
  shot_pistol: ['shot_pistol.wav', 'shot_pistol_2.wav'],
  shot_shotgun: ['shot_shotgun.wav'],
  shot_smg: ['shot_smg.wav'],
  shot_magnum: ['shot_magnum.wav'],
  reload_pistol: ['reload_pistol.wav'],
  reload_rifle: ['reload_rifle.wav'],
  shotgun_pump: ['shotgun_pump.wav'],
  slam: ['slam.wav'],
  heartbeat: ['heartbeat.wav'],
  pickup: ['pickup.wav'],
  click: ['click.wav'],
  music_ambient: ['music_ambient.ogg'],
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map(); // name -> AudioBuffer[]
    this.started = false;
    this.intensity = 0;
    this._musicSource = null;
    this._vol = { master: 0.8, music: 0.7, sfx: 0.9 };
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this._vol.master;
    // limiter morbido per evitare clipping con tanti suoni insieme
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 9;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(c.destination);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = this._vol.music;
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this._vol.sfx;
    this.sfxBus.connect(this.master);

    // buffer di rumore bianco riutilizzato da tutto il synth
    const len = c.sampleRate * 1.2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() { this.ctx?.resume(); }

  setMaster(v) { this._vol.master = v; if (this.master) this.master.gain.value = v; }
  setMusic(v) { this._vol.music = v; if (this.musicBus) this.musicBus.gain.value = v; }
  setSfx(v) { this._vol.sfx = v; if (this.sfxBus) this.sfxBus.gain.value = v; }

  async loadFiles(onProgress) {
    const entries = [];
    for (const [name, files] of Object.entries(AUDIO_MANIFEST)) {
      for (const f of files) entries.push([name, f]);
    }
    let done = 0;
    await Promise.all(entries.map(async ([name, file]) => {
      try {
        const res = await fetch('assets/audio/' + file);
        if (!res.ok) throw new Error(res.status);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (!this.buffers.has(name)) this.buffers.set(name, []);
        this.buffers.get(name).push(buf);
      } catch { /* manca il file: si userà il synth */ }
      done++;
      onProgress?.(done / entries.length);
    }));
  }

  /** Riproduce un suono per nome: file se disponibile, altrimenti synth. */
  play(name, { vol = 1, rate = 1, pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (vol <= 0.01) return;
    const list = this.buffers.get(name);
    if (list && list.length) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = list[(Math.random() * list.length) | 0];
      src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
      const g = c.createGain();
      g.gain.value = vol;
      const p = c.createStereoPanner();
      p.pan.value = pan;
      src.connect(g).connect(p).connect(this.sfxBus);
      src.start();
    } else {
      this.synth(name, vol, rate, pan);
    }
  }

  /** Suono posizionale: attenua e fa pan in base alla distanza dal giocatore. */
  playAt(name, pos, listener, opts = {}) {
    const dx = pos.x - listener.x, dz = pos.z - listener.z;
    const dist = Math.hypot(dx, dz);
    const vol = Math.pow(Math.max(0, 1 - dist / 34), 1.5) * (opts.vol ?? 1);
    if (vol <= 0.02) return;
    const pan = Math.max(-1, Math.min(1, dx / 16)) * 0.7;
    this.play(name, { ...opts, vol, pan });
  }

  // ---------------------------------------------------------------- synth --

  _env(g, t0, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _noise(t0, dur, { hp = 0, lp = 20000, lpEnd, peak = 0.5, attack = 0.002, pan = 0 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lpF = c.createBiquadFilter();
    lpF.type = 'lowpass';
    lpF.frequency.setValueAtTime(lp, t0);
    if (lpEnd) lpF.frequency.exponentialRampToValueAtTime(lpEnd, t0 + dur);
    const hpF = c.createBiquadFilter();
    hpF.type = 'highpass';
    hpF.frequency.value = hp;
    const g = c.createGain();
    this._env(g, t0, attack, peak, dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    src.connect(lpF).connect(hpF).connect(g).connect(p).connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  _tone(t0, dur, { type = 'sine', f0 = 440, f1, peak = 0.4, attack = 0.003, pan = 0, vibrato = 0, vibratoHz = 6 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    if (vibrato > 0) {
      const lfo = c.createOscillator(); lfo.frequency.value = vibratoHz;
      const lg = c.createGain(); lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    }
    const g = c.createGain();
    this._env(g, t0, attack, peak, dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  synth(name, vol = 1, rate = 1, pan = 0) {
    const alias = { reload_pistol: 'reload', reload_rifle: 'reload', shotgun_pump: 'reload' };
    name = alias[name] || name;
    const t = this.ctx.currentTime;
    const v = vol;
    switch (name) {
      case 'shot_pistol':
        this._noise(t, 0.09, { hp: 350, lp: 7000, lpEnd: 900, peak: 0.55 * v, pan });
        this._tone(t, 0.1, { type: 'sine', f0: 160, f1: 55, peak: 0.5 * v, pan });
        break;
      case 'shot_smg':
        this._noise(t, 0.055, { hp: 500, lp: 6500, lpEnd: 1200, peak: 0.4 * v, pan });
        this._tone(t, 0.07, { type: 'sine', f0: 180, f1: 70, peak: 0.35 * v, pan });
        break;
      case 'shot_shotgun':
        this._noise(t, 0.22, { hp: 120, lp: 3800, lpEnd: 350, peak: 0.8 * v, pan });
        this._tone(t, 0.18, { type: 'sine', f0: 110, f1: 38, peak: 0.7 * v, pan });
        break;
      case 'shot_magnum':
        this._noise(t, 0.14, { hp: 250, lp: 8000, lpEnd: 500, peak: 0.75 * v, pan });
        this._tone(t, 0.2, { type: 'sine', f0: 130, f1: 34, peak: 0.7 * v, pan });
        this._tone(t, 0.05, { type: 'square', f0: 900, f1: 300, peak: 0.12 * v, pan });
        break;
      case 'reload':
        this._noise(t, 0.04, { hp: 1200, lp: 6000, peak: 0.3 * v, pan });
        this._noise(t + 0.22, 0.05, { hp: 900, lp: 5000, peak: 0.35 * v, pan });
        break;
      case 'click':
        this._noise(t, 0.03, { hp: 1500, lp: 5000, peak: 0.25 * v, pan });
        break;
      case 'hit_flesh':
        this._noise(t, 0.07, { hp: 80, lp: 1400, lpEnd: 300, peak: 0.5 * v, pan });
        this._tone(t, 0.08, { type: 'triangle', f0: 280 * rate, f1: 90, peak: 0.3 * v, pan });
        break;
      case 'crit':
        this._noise(t, 0.08, { hp: 100, lp: 2200, lpEnd: 300, peak: 0.55 * v, pan });
        this._tone(t, 0.12, { type: 'square', f0: 520, f1: 130, peak: 0.18 * v, pan });
        break;
      case 'splat':
        this._noise(t, 0.16, { hp: 60, lp: 900, lpEnd: 150, peak: 0.5 * v, pan });
        break;
      case 'zombie_growl': {
        const f = (60 + Math.random() * 50) * rate;
        this._tone(t, 0.55, { type: 'sawtooth', f0: f, f1: f * 0.75, peak: 0.22 * v, vibrato: f * 0.25, vibratoHz: 9 + Math.random() * 6, pan });
        this._noise(t, 0.5, { hp: 200, lp: 1100, peak: 0.1 * v, attack: 0.05, pan });
        break;
      }
      case 'zombie_attack': {
        const f = (90 + Math.random() * 60) * rate;
        this._tone(t, 0.3, { type: 'sawtooth', f0: f, f1: f * 1.6, peak: 0.26 * v, vibrato: 30, vibratoHz: 14, pan });
        this._noise(t, 0.25, { hp: 300, lp: 2000, peak: 0.14 * v, pan });
        break;
      }
      case 'zombie_death':
        this._tone(t, 0.5, { type: 'sawtooth', f0: 110 * rate, f1: 35, peak: 0.24 * v, vibrato: 25, vibratoHz: 8, pan });
        this._noise(t + 0.05, 0.3, { hp: 60, lp: 700, lpEnd: 120, peak: 0.4 * v, pan });
        break;
      case 'boss_roar':
        this._tone(t, 1.2, { type: 'sawtooth', f0: 95, f1: 38, peak: 0.5 * v, vibrato: 22, vibratoHz: 7, attack: 0.08 });
        this._tone(t, 1.2, { type: 'sawtooth', f0: 63, f1: 30, peak: 0.4 * v, vibrato: 14, vibratoHz: 5, attack: 0.08 });
        this._noise(t, 1.0, { hp: 80, lp: 1500, lpEnd: 200, peak: 0.3 * v, attack: 0.1 });
        break;
      case 'slam':
        this._noise(t, 0.5, { hp: 30, lp: 800, lpEnd: 80, peak: 0.8 * v });
        this._tone(t, 0.55, { type: 'sine', f0: 70, f1: 22, peak: 0.8 * v });
        break;
      case 'spit':
        this._noise(t, 0.12, { hp: 300, lp: 2500, lpEnd: 500, peak: 0.3 * v, pan });
        this._tone(t, 0.12, { type: 'triangle', f0: 600, f1: 200, peak: 0.12 * v, pan });
        break;
      case 'hurt':
        this._tone(t, 0.18, { type: 'square', f0: 140, f1: 70, peak: 0.25 * v });
        this._noise(t, 0.12, { hp: 200, lp: 1500, peak: 0.2 * v });
        break;
      case 'pickup':
        this._tone(t, 0.09, { type: 'sine', f0: 660, peak: 0.25 * v });
        this._tone(t + 0.09, 0.14, { type: 'sine', f0: 990, peak: 0.25 * v });
        break;
      case 'weapon_pickup':
        [523, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.07, 0.12, { type: 'triangle', f0: f, peak: 0.22 * v }));
        break;
      case 'dash':
        this._noise(t, 0.18, { hp: 600, lp: 1200, lpEnd: 5000, peak: 0.22 * v, attack: 0.02 });
        break;
      case 'wave_start':
        this._tone(t, 1.6, { type: 'sine', f0: 98, peak: 0.4 * v, attack: 0.01 });
        this._tone(t, 1.6, { type: 'sine', f0: 196, peak: 0.18 * v, attack: 0.01 });
        this._tone(t + 0.02, 1.2, { type: 'sine', f0: 49, peak: 0.35 * v });
        break;
      case 'wave_clear':
        [392, 523, 659].forEach((f, i) => this._tone(t + i * 0.12, 0.3, { type: 'sine', f0: f, peak: 0.2 * v }));
        break;
      case 'heartbeat':
        this._tone(t, 0.1, { type: 'sine', f0: 55, f1: 35, peak: 0.5 * v });
        this._tone(t + 0.28, 0.1, { type: 'sine', f0: 50, f1: 32, peak: 0.4 * v });
        break;
      case 'step':
        this._noise(t, 0.045, { hp: 100, lp: 600, peak: 0.07 * v, pan });
        break;
    }
  }

  // -------------------------------------------------------------- ambient --

  /** Avvia musica (file se presente) + letto sonoro procedurale di vento e drone. */
  startMusic() {
    if (this.started || !this.ctx) return;
    this.started = true;
    const c = this.ctx;

    const music = this.buffers.get('music_ambient');
    if (music && music.length) {
      const src = c.createBufferSource();
      src.buffer = music[0];
      src.loop = true;
      const g = c.createGain();
      g.gain.value = 0.55;
      src.connect(g).connect(this.musicBus);
      src.start();
      this._musicSource = src;
    }

    // vento: rumore filtrato con LFO lentissimo
    const wind = c.createBufferSource();
    wind.buffer = this.noiseBuf; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 320; wf.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0.05;
    const wlfo = c.createOscillator(); wlfo.frequency.value = 0.07;
    const wlg = c.createGain(); wlg.gain.value = 0.035;
    wlfo.connect(wlg).connect(wg.gain);
    const wflfo = c.createOscillator(); wflfo.frequency.value = 0.045;
    const wflg = c.createGain(); wflg.gain.value = 140;
    wflfo.connect(wflg).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.musicBus);
    wind.start(); wlfo.start(); wflfo.start();

    // drone cupo: due oscillatori scordati, sale con l'intensità del combattimento
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.02;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    [55, 55.7, 36.7].forEach((f) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = 0.33;
      o.connect(og).connect(lp);
      o.start();
    });
    lp.connect(this.droneGain).connect(this.musicBus);
  }

  /** 0 = calma, 1 = battaglia piena: alza il drone. */
  setIntensity(x) {
    this.intensity = x;
    if (this.droneGain && this.ctx) {
      this.droneGain.gain.setTargetAtTime(0.02 + 0.075 * x, this.ctx.currentTime, 0.8);
    }
  }
}

export const Audio = new AudioEngine();
