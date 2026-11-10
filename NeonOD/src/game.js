/* ============================================================
   NEON BLOCKS — nucleo del gioco
   Gestisce stato, camera, collisioni decorative, punteggio,
   vite, particelle, sfondo e rendering.
   ============================================================ */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    /* stato: splash | menu | levels | shop | settings |
              playing | paused | complete | gameover */
    this.state = 'splash';
    this.mode = 'levels';       // 'levels' | 'endless'
    this.levelIndex = 0;
    this.level = null;
    this.endless = null;
    this.ui = null;

    this.player = new Player();
    this.fx = new ParticleSystem(420);

    this.vw = DESIGN.minWidth;
    this.vh = DESIGN.viewHeight;
    this.cam = { x: 0, y: 0, w: this.vw, h: this.vh };
    this.camSnap = true;
    this.scale = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;

    this.time = 0;
    this.score = 0;
    this.coinCount = 0;
    this.lives = 3;
    this.checkpoint = { x: 0, y: 0 };

    this.shake = 0;
    this.flash = 0;
    this.flashColor = PALETTE.white;

    this._hud = { score: 0, coins: 0, lives: 3, energy: 'cyber' };
    this._buildBackdrop();
    this._bindLifecycle();
  }

  /* ---------------- sfondo decorativo (stelle, forme, griglia) ---------- */
  _buildBackdrop() {
    this.stars = [];
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * 2600,
        y: Math.random() * 700,
        s: rand(0.8, 2.6),
        p: rand(0.08, 0.35),
        tw: rand(0, 6.28),
        c: choice([PALETTE.cyan, PALETTE.pink, PALETTE.white, PALETTE.gold]),
      });
    }
    this.shapes = [];
    for (let i = 0; i < 12; i++) {
      this.shapes.push({
        x: Math.random() * 2600,
        y: rand(60, 560),
        size: rand(38, 110),
        rot: rand(0, 6.28),
        vr: rand(-0.35, 0.35),
        p: rand(0.18, 0.5),
        sides: choice([3, 4, 6]),
        c: choice([PALETTE.purple, PALETTE.cyan, PALETTE.pink]),
      });
    }
    this._vignette = null;
  }

  _buildVignette() {
    const g = this.ctx.createRadialGradient(
      this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.35,
      this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(4,2,12,0.55)');
    this._vignette = g;
  }

  /* ---------------- ridimensionamento / DPR ---------------- */
  resize() {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // DPR elevato ma contenuto
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    /* scala del mondo: garantisce almeno l'area di progettazione visibile */
    this.scale = Math.min(cssH / DESIGN.viewHeight, cssW / DESIGN.minWidth);
    this.vw = cssW / this.scale;
    this.vh = cssH / this.scale;
    this.cam.w = this.vw;
    this.cam.h = this.vh;

    this._buildVignette();
    this._bgGrad = null;
    this._bgSun = null;
    this.camSnap = true;
  }

  /* ---------------- transizioni di stato ---------------- */
  toMenu() {
    this.state = 'menu';
    this.mode = 'levels';
    this.level = null;
    this.endless = null;
    this.fx.clear();
    Input.resetHeld();
    this.ui.hideScreens();
    this.ui.show('menu');
    this.ui.setPlayingUI(false);
    this.ui.refreshCoins();
    this.ui.buildLevels();
    this.camSnap = true;
  }

  quickPlay() {
    const done = SaveManager.data.levels;
    let idx = 0;
    for (let i = 0; i < done.length; i++) if (!done[i]) { idx = i; break; }
    if (!SaveManager.isLevelUnlocked(idx)) idx = 0;
    this.startLevel(idx);
  }

  startLevel(index) {
    this.mode = 'levels';
    this.levelIndex = clamp(index, 0, LEVELS.length - 1);
    SaveManager.set('lastLevel', this.levelIndex);
    this.level = new Level(LEVELS[this.levelIndex]);
    this.endless = null;
    this._resetRun();

    const sp = this.level.spawn;
    this.player.reset(sp.x, sp.y);
    this.player.autoRun = false;
    this.player.energy = 0;
    this.checkpoint = { x: sp.x, y: sp.y };

    this.cam.x = 0; this.cam.y = 0;
    this.camSnap = true;
    this.state = 'playing';
    this.ui.hideScreens();
    this.ui.setPlayingUI(true);
    this._hud = {};
    this._syncHud();
  }

  startEndless() {
    this.mode = 'endless';
    this.endless = new EndlessWorld();
    this.level = this.endless.level;
    this._resetRun();

    const sp = this.level.spawn;
    this.player.reset(sp.x, sp.y);
    this.player.autoRun = true;
    this.player.autoSpeed = 270;
    this.player.energy = 0;

    this.cam.x = 0; this.cam.y = 0;
    this.camSnap = true;
    this.state = 'playing';
    this.ui.hideScreens();
    this.ui.setPlayingUI(true);
    this._hud = {};
    this._syncHud();
  }

  restartLevel() {
    if (this.mode === 'endless') this.startEndless();
    else this.startLevel(this.levelIndex);
  }

  nextLevel() {
    if (this.levelIndex + 1 < LEVELS.length) this.startLevel(this.levelIndex + 1);
    else this.toMenu();
  }

  _resetRun() {
    this.score = 0;
    this.coinCount = 0;
    this.lives = 3;
    this.shake = 0;
    this.flash = 0;
    this.fx.clear();
    Input.resetHeld();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      Input.resetHeld();
      this.ui.setPlayingUI(false);
      const info = this.mode === 'endless'
        ? 'Modalità INFINITA — Punti: ' + this.score
        : 'Livello ' + (this.levelIndex + 1) + ' — ' + this.level.name + ' — Punti: ' + this.score;
      this.ui.showPause(info);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.hideScreens();
      this.ui.setPlayingUI(true);
      this.camSnap = true;
    }
  }

  onConfirm() {
    if (this.state === 'splash') this.toMenu();
    else if (this.state === 'gameover') this.restartLevel();
    else if (this.state === 'complete') this.nextLevel();
  }

  cycleEnergy() {
    if (this.state !== 'playing') return;
    const id = this.player.cycleEnergy(1, this.fx);
    AudioFX.play('shift');
    this.flashPulse(ENERGY_META[id].color, 0.20);
    this.shake = Math.max(this.shake, 3);
    this._syncHud(true);
  }

  /* ---------------- effetti ---------------- */
  flashPulse(color, strength) {
    if (SaveManager.data.reducedFx) strength *= 0.4;
    this.flash = Math.max(this.flash, strength);
    this.flashColor = color;
  }

  addShake(amount) {
    if (!SaveManager.data.shake || SaveManager.data.reducedFx) return;
    this.shake = Math.max(this.shake, amount);
  }

  /* ---------------- ciclo principale ---------------- */
  frame(dt) {
    this.time += dt;

    if (this.state === 'playing') this._updateWorld(dt);
    else this.fx.update(dt);

    /* decadimenti (anche fuori dal gioco, per transizioni morbide) */
    this.shake *= Math.exp(-dt * 5.5);
    if (this.shake < 0.05) this.shake = 0;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);

    this.render();
    Input.endFrame();
  }

  _updateWorld(dt) {
    const p = this.player;
    const lv = this.level;

    /* generazione/pulizia modalità infinita */
    if (this.mode === 'endless') {
      this.endless.update(dt, this.cam.x, this.vw, p);
      p.autoSpeed = 270 + 150 * this.endless.difficulty;
      this.score = this.endless.score(p);
    }

    /* piattaforme mobili e temporanee */
    lv.update(dt, this.fx, this.time);
    /* cortesia: una piattaforma temporanea non si spegne sotto i piedi
       del giocatore (evita cadute impossibili da prevedere) */
    for (let i = 0; i < lv.temp.length; i++) {
      const t = lv.temp[i];
      if (!t.on && p.groundRef === t) t.on = true;
    }

    /* SHIFT */
    if (Input.shiftPressed) this.cycleEnergy();

    /* fisica del giocatore */
    p.update(dt, Input, lv, this.fx);

    /* interazioni con il mondo */
    this._interact();

    /* morte per caduta nel vuoto */
    if (p.y > lv.height - 40) this.damage(p.x, true);

    /* camera */
    this._updateCamera(dt);

    /* HUD */
    this._syncHud();

    /* particelle */
    this.fx.update(dt);
  }

  _interact() {
    const p = this.player;
    const lv = this.level;
    const fx = this.fx;

    /* monete */
    for (let i = 0; i < lv.coins.length; i++) {
      const c = lv.coins[i];
      if (c.taken) continue;
      if (circleHitsRect(c.x, c.y, c.r + 5, p)) {
        c.taken = true;
        this.coinCount++;
        this.score += SCORE.coin;
        AudioFX.play('coin');
        fx.burst(c.x, c.y, PALETTE.gold, 9, { speed: 190, life: 0.45, size: 4 });
        fx.ring(c.x, c.y, PALETTE.gold, 4, 30, 0.3);
      }
    }

    /* sfere energetiche */
    for (let i = 0; i < lv.orbs.length; i++) {
      const o = lv.orbs[i];
      if (o.taken) continue;
      if (circleHitsRect(o.x, o.y, o.r + 5, p)) {
        o.taken = true;
        if (!o.counted) {
          o.counted = true;
          this.score += SCORE.orb;
        }
        const changed = p.setEnergy(o.energy, fx);
        if (changed) {
          AudioFX.play('orb');
          this.flashPulse(ENERGY_META[o.energy].color, 0.14);
        }
        fx.burst(o.x, o.y, ENERGY_META[o.energy].color, 12, { speed: 200, life: 0.5, size: 4 });
      }
    }

    /* barriere energetiche: una volta superata (done) la barriera
       resta aperta e non nuoce più, anche con energia diversa —
       altrimenti dopo un respawn (che azzera le sfere) sarebbe
       una fonte di danni ingiusti */
    for (let i = 0; i < lv.barriers.length; i++) {
      const b = lv.barriers[i];
      if (b.done) continue;
      if (!rectsOverlap(p, b)) continue;
      if (p.energyId === b.energy) {
        if (!b.done) {
          b.done = true;
          this.score += SCORE.barrier;
          AudioFX.play('portal');
          const col = ENERGY_META[b.energy].color;
          fx.ring(rectCenterX(b), p.y + p.h / 2, col, 10, 120, 0.55);
          fx.sparks(rectCenterX(b), p.y + p.h / 2, col, 16);
          this.flashPulse(col, 0.24);
          this.addShake(6);
        }
      } else {
        this.damage(rectCenterX(b));
      }
    }

    /* portali */
    for (let i = 0; i < lv.portals.length; i++) {
      const pl = lv.portals[i];
      if (pl.used) continue;
      if (!circleHitsRect(pl.x, pl.y, pl.r, p)) continue;
      if (p.energyId === pl.energy) {
        pl.used = true;
        this.score += SCORE.portal;
        AudioFX.play('portal');
        const col = ENERGY_META[pl.energy].color;
        fx.ring(pl.x, pl.y, col, 10, 140, 0.6);
        fx.sparks(pl.x, pl.y, col, 18);
        if (pl.to) {
          fx.ring(pl.to.x, pl.to.y, col, 10, 120, 0.6);
          fx.sparks(pl.to.x, pl.to.y, col, 14);
          p.x = pl.to.x;
          p.y = pl.to.y;
          p.vy = 0;
          p.vx = Math.max(p.vx, 240);
          p.onGround = false;
          p.groundRef = null;
          this.camSnap = true;
        }
        this.flashPulse(col, 0.30);
        this.addShake(7);
      } else {
        this.damage(pl.x);
      }
    }

    /* spine */
    for (let i = 0; i < lv.spikes.length; i++) {
      const s = lv.spikes[i];
      if (rectsOverlap(p, s)) this.damage(s.x + s.w / 2);
    }

    /* checkpoint: la zona è volutamente ampia (140px e tutta la
       colonna verticale utile) così non viene saltata saltando un varco */
    for (let i = 0; i < lv.checkpoints.length; i++) {
      const c = lv.checkpoints[i];
      if (c.reached) continue;
      const zone = { x: c.x - 70, y: DESIGN.groundY - 420, w: 140, h: 480 };
      if (rectsOverlap(p, zone)) {
        c.reached = true;
        this.checkpoint = { x: c.x + 18, y: DESIGN.groundY - TUNING.playerH };
        AudioFX.play('checkpoint');
        fx.ring(c.x, c.y - 26, PALETTE.cyan, 8, 90, 0.55);
        fx.burst(c.x, c.y - 26, PALETTE.cyan, 14, { speed: 180, life: 0.5, size: 4 });
        this.ui.toast('CHECKPOINT');
      }
    }

    /* meta */
    if (lv.goal && rectsOverlap(p, lv.goal)) {
      if (lv.goal.energy && p.energyId !== lv.goal.energy) {
        if (!this._goalHintT || this.time - this._goalHintT > 2) {
          this._goalHintT = this.time;
          this.ui.toast('SERVE ENERGIA ' + ENERGY_META[lv.goal.energy].label + '!');
          AudioFX.play('error');
        }
        this.damage(rectCenterX(lv.goal));
      } else {
        this.completeLevel();
      }
    }
  }

  /* ---------------- danno / respawn ---------------- */
  damage(sourceX, isFall = false) {
    if (this.state !== 'playing' || this.player.invuln > 0) return;
    const p = this.player;
    this.lives--;
    AudioFX.play('damage');
    this.addShake(13);
    this.flashPulse(PALETTE.danger, 0.32);
    this.fx.burst(p.x + p.w / 2, p.y + p.h / 2, PALETTE.danger, 22,
      { speed: 320, life: 0.6, size: 5 });
    this.fx.ring(p.x + p.w / 2, p.y + p.h / 2, PALETTE.danger, 12, 110, 0.5);
    /* vibrazione tattile (solo se l'utente ha già interagito, altrimenti
       i browser la bloccano loggando un errore in console) */
    try {
      const canVibrate = navigator.vibrate &&
        (!navigator.userActivation || navigator.userActivation.hasBeenActive);
      if (canVibrate) navigator.vibrate(55);
    } catch (e) { /* ignore */ }
    void sourceX;

    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.respawn();
    if (isFall) this.ui.toast('ATTENZIONE: VUOTO!');
  }

  respawn() {
    const p = this.player;
    if (this.mode === 'endless') {
      const sg = this.endless.safeGround;
      if (sg) {
        p.x = clamp(this.endless.safeX, sg.x + 8, sg.x + sg.w - 60);
        p.y = sg.y - p.h - 2;
      } else {
        p.x = this.cam.x + 80;
        p.y = 300;
      }
    } else {
      p.x = this.checkpoint.x;
      p.y = this.checkpoint.y;
    }
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.groundRef = null;
    p.invuln = 1.6;
    p.energyPulse = 1;
    this.level.resetOrbs();      // le sfere tornano utilizzabili
    this.camSnap = true;
    this.fx.ring(p.x + p.w / 2, p.y + p.h / 2, PALETTE.white, 8, 80, 0.45);
  }

  /* ---------------- esiti ---------------- */
  completeLevel() {
    if (this.state !== 'playing') return;
    this.state = 'complete';
    const bonus = SCORE.levelBonus * this.lives;
    this.score += bonus;
    const bank = this.coinCount + SCORE.coinBankBonus;
    SaveManager.addCoins(bank);
    SaveManager.completeLevel(this.levelIndex);

    AudioFX.play('win');
    this.addShake(16);
    this.flashPulse(PALETTE.gold, 0.5);
    const p = this.player;
    for (let i = 0; i < 5; i++) {
      this.fx.burst(p.x + p.w / 2 + rand(-140, 140), p.y + rand(-160, 40),
        choice([PALETTE.gold, PALETTE.cyan, PALETTE.pink, PALETTE.purple]),
        16, { speed: 300, life: 0.9, size: 5 });
    }
    this.fx.ring(p.x + p.w / 2, p.y + p.h / 2, PALETTE.gold, 20, 260, 1.0);

    this.ui.setPlayingUI(false);
    this.ui.showComplete({
      title: this.levelIndex === LEVELS.length - 1
        ? 'TUTTI I LIVELLI COMPLETATI!' : 'LIVELLO COMPLETATO',
      score: this.score,
      coins: this.coinCount,
      bonus: bonus,
      hasNext: this.levelIndex < LEVELS.length - 1,
    });
    this.ui.buildLevels();
    this.ui.refreshCoins();
  }

  gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    AudioFX.play('over');
    this.addShake(18);
    this.flashPulse(PALETTE.danger, 0.45);

    const bank = this.coinCount;
    SaveManager.addCoins(bank);

    let best = SaveManager.data.record;
    if (this.mode === 'endless') {
      best = Math.max(best, this.score);
      SaveManager.submitRecord(this.score);
      best = SaveManager.data.record;
    }

    this.ui.setPlayingUI(false);
    this.ui.showGameOver({ score: this.score, best, coins: bank });
    this.ui.refreshCoins();
  }

  /* ---------------- camera ---------------- */
  _updateCamera(dt) {
    const p = this.player;
    const targetX = p.x + p.w / 2 - this.vw * 0.42;
    const maxX = Math.max(0, this.level.width - this.vw);
    const tx = clamp(targetX, 0, maxX);

    const maxY = this.level.height - this.vh;
    let ty = p.y + p.h / 2 - this.vh * 0.56;
    ty = maxY <= 0 ? maxY / 2 : clamp(ty, 0, maxY);

    if (this.camSnap) {
      this.cam.x = tx;
      this.cam.y = ty;
      this.camSnap = false;
    } else {
      this.cam.x = damp(this.cam.x, tx, 7, dt);
      this.cam.y = damp(this.cam.y, ty, 5, dt);
    }
  }

  /* ---------------- HUD ---------------- */
  _syncHud(force) {
    const h = this._hud;
    h.score = this.score;
    h.coins = this.coinCount;
    h.lives = this.lives;
    h.energy = this.player.energyId;
    if (force) this.ui._hudCache = {};
    this.ui.updateHud(h);
  }

  /* ============================ RENDER ============================ */
  render() {
    const ctx = this.ctx;
    /* spazio CSS pixels */
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    this._drawBackdrop(ctx);

    const inWorld = this.level &&
      (this.state === 'playing' || this.state === 'paused' ||
       this.state === 'complete' || this.state === 'gameover');

    if (inWorld) {
      const reduced = SaveManager.data.reducedFx;
      const shakeAmp = this.shake;
      const sx = shakeAmp ? rand(-shakeAmp, shakeAmp) : 0;
      const sy = shakeAmp ? rand(-shakeAmp, shakeAmp) : 0;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.cam.x, -this.cam.y);

      this.level.draw(ctx, this.time, reduced, this.cam);
      this.fx.draw(ctx, reduced);
      this.player.draw(ctx, this.time, reduced);

      ctx.restore();
    }

    /* flash di energia / danno */
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(this.flashColor, this.flash * 0.55);
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.restore();
    }

    /* vignettatura (cached) */
    if (this._vignette) {
      ctx.fillStyle = this._vignette;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }

  /* Sfondo: gradiente, stelle parallasse, forme, griglia prospettica */
  _drawBackdrop(ctx) {
    const w = this.cssW;
    const h = this.cssH;
    const t = this.time;
    const camX = this.level ? this.cam.x : t * 26;

    /* gradiente verticale */
    const grad = this._bgGrad || (this._bgGrad = (() => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0C0722');
      g.addColorStop(0.55, PALETTE.bg);
      g.addColorStop(1, '#170C36');
      return g;
    })());
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    /* alone all'orizzonte */
    const hz = h * 0.60;
    const sun = this._bgSun || (this._bgSun = (() => {
      const g = ctx.createRadialGradient(w / 2, hz, 0, w / 2, hz, Math.max(w, h) * 0.5);
      g.addColorStop(0, rgba(PALETTE.pink, 0.20));
      g.addColorStop(0.5, rgba(PALETTE.purple, 0.10));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      return g;
    })());
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    /* stelle */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.stars) {
      const span = w + 240;
      let sx = ((s.x - camX * s.p) % span + span) % span - 120;
      const alpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + s.tw));
      ctx.fillStyle = rgba(s.c, alpha);
      ctx.fillRect(sx, s.y * (h / 780), s.s, s.s);
    }

    /* forme geometriche fluttuanti */
    for (const sh of this.shapes) {
      const span = w + 420;
      const sx = ((sh.x - camX * sh.p) % span + span) % span - 210;
      const sy = sh.y * (h / 820);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(sh.rot + t * sh.vr);
      ctx.strokeStyle = rgba(sh.c, 0.16);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < sh.sides; i++) {
        const a = (i / sh.sides) * 6.2832;
        const px = Math.cos(a) * sh.size;
        const py = Math.sin(a) * sh.size;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    /* griglia prospettica in basso */
    ctx.save();
    ctx.strokeStyle = rgba(PALETTE.purple, 1);
    ctx.lineWidth = 1.4;
    const vpX = w * 0.5;
    const spacing = Math.max(60, w / 12);
    const shift = ((camX * 0.55) % spacing + spacing) % spacing;
    ctx.globalAlpha = 0.20;
    for (let i = -3; i <= 15; i++) {
      const bx = i * spacing - shift;
      ctx.beginPath();
      ctx.moveTo(vpX, hz);
      ctx.lineTo(bx, h);
      ctx.stroke();
    }
    for (let i = 1; i <= 10; i++) {
      const k = i / 10;
      const y = hz + Math.pow(k, 2.3) * (h - hz);
      ctx.globalAlpha = 0.06 + 0.16 * k;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- ciclo di vita (pausa su blur/scheda nascosta) ------- */
  _bindLifecycle() {
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.togglePause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
    window.addEventListener('contextmenu', (e) => {
      if (e.target && e.target.id === 'game') e.preventDefault();
    });
  }
}
