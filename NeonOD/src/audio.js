/* ============================================================
   NEON BLOCKS — audio arcade generato con Web Audio API
   Nessun file audio esterno: ogni effetto è un oscillatore
   sintetizzato al momento. Il contesto audio viene creato
   SOLO dopo la prima interazione dell'utente (regola autoplay).
   ============================================================ */

const AudioFX = {
  ctx: null,
  master: null,
  enabled: true,
  unlocked: false,

  /* Va chiamato al primo tocco/click: crea e riprende il contesto */
  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) {
      this.ctx = null;
    }
  },

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? 0.5 : 0;
  },

  /* Tono con sweep di frequenza e inviluppo ADSR semplificato */
  _tone(o) {
    if (!this.enabled || !this.ctx || !this.master) return;
    try {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.f0, t0);
      if (o.f1 && o.f1 !== o.f0) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
      }
      const vol = o.gain == null ? 0.18 : o.gain;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + o.dur + 0.05);
    } catch (e) { /* audio mai bloccante */ }
  },

  /* Breve rumore (rumble/danno) generato proceduralmente */
  _noise(dur, gain, filterFreq) {
    if (!this.enabled || !this.ctx || !this.master) return;
    try {
      const ctx = this.ctx;
      const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const bq = ctx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.value = filterFreq || 900;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(bq); bq.connect(g); g.connect(this.master);
      src.start();
    } catch (e) { /* ignore */ }
  },

  /* ----------------------------------------------------------
     Banca effetti: ogni nome corrisponde a un evento di gioco
     ---------------------------------------------------------- */
  play(name) {
    if (!this.enabled) return;
    switch (name) {
      case 'jump':
        this._tone({ type: 'square', f0: 300, f1: 660, dur: 0.14, gain: 0.14 });
        break;
      case 'coin':
        this._tone({ type: 'sine', f0: 940, f1: 940, dur: 0.07, gain: 0.16 });
        this._tone({ type: 'sine', f0: 1420, f1: 1420, dur: 0.10, gain: 0.14, delay: 0.07 });
        break;
      case 'orb':
        this._tone({ type: 'triangle', f0: 520, f1: 1040, dur: 0.22, gain: 0.16 });
        this._tone({ type: 'sine', f0: 1560, f1: 1560, dur: 0.14, gain: 0.10, delay: 0.10 });
        break;
      case 'shift':
        this._tone({ type: 'sawtooth', f0: 240, f1: 900, dur: 0.18, gain: 0.12 });
        this._tone({ type: 'square', f0: 480, f1: 1300, dur: 0.14, gain: 0.07, delay: 0.04 });
        break;
      case 'portal':
        this._tone({ type: 'sine', f0: 660, f1: 660, dur: 0.12, gain: 0.14 });
        this._tone({ type: 'sine', f0: 880, f1: 880, dur: 0.12, gain: 0.14, delay: 0.08 });
        this._tone({ type: 'sine', f0: 1320, f1: 1320, dur: 0.22, gain: 0.14, delay: 0.16 });
        break;
      case 'damage':
        this._tone({ type: 'sawtooth', f0: 320, f1: 70, dur: 0.32, gain: 0.16 });
        this._noise(0.22, 0.14, 700);
        break;
      case 'checkpoint':
        this._tone({ type: 'triangle', f0: 700, f1: 1050, dur: 0.16, gain: 0.13 });
        break;
      case 'land':
        this._tone({ type: 'sine', f0: 190, f1: 90, dur: 0.10, gain: 0.10 });
        break;
      case 'win': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this._tone({ type: 'square', f0: f, f1: f, dur: 0.18, gain: 0.13, delay: i * 0.11 }));
        this._tone({ type: 'triangle', f0: 1568, f1: 1568, dur: 0.5, gain: 0.10, delay: notes.length * 0.11 });
        break;
      }
      case 'over': {
        const notes = [523, 392, 311, 233];
        notes.forEach((f, i) => this._tone({ type: 'sawtooth', f0: f, f1: f * 0.97, dur: 0.26, gain: 0.13, delay: i * 0.14 }));
        break;
      }
      case 'buy':
        this._tone({ type: 'square', f0: 700, f1: 700, dur: 0.09, gain: 0.13 });
        this._tone({ type: 'square', f0: 1050, f1: 1050, dur: 0.14, gain: 0.13, delay: 0.09 });
        break;
      case 'error':
        this._tone({ type: 'square', f0: 220, f1: 160, dur: 0.18, gain: 0.12 });
        break;
      case 'click':
      default:
        this._tone({ type: 'square', f0: 620, f1: 780, dur: 0.06, gain: 0.10 });
        break;
    }
  },
};
