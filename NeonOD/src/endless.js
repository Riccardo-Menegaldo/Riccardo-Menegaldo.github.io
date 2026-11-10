/* ============================================================
   NEON BLOCKS — modalità infinita
   Generatore procedurale: terreni, varchi, ostacoli, sfere,
   barriere e portali. La difficoltà cresce con la distanza e
   gli oggetti dietro la camera vengono eliminati (prestazioni).
   I varchi restano sempre entro la portata di salto.
   ============================================================ */

class EndlessWorld {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = new Level({
      name: 'INFINITA',
      theme: 'city',
      width: 1e7,
      height: DESIGN.worldHeight,
      spawn: { x: 140, y: 600 },
      platforms: [], moving: [], temp: [], spikes: [],
      orbs: [], barriers: [], portals: [], checkpoints: [],
      coins: [], goal: null,
    });

    this.cursorX = 0;
    this.difficulty = 0;
    this.safeGround = null;
    this.safeX = 140;
    this.pruneTimer = 0;
    this.scoreBonus = 0;   // punti da portali/barriere
    this.startX = 140;

    /* terreno iniziale sempre sicuro */
    this._addGround(0, 950);
    this.cursorX = 950;
  }

  /* ---------------- helper di generazione ---------------- */
  _addGround(x, w) {
    const p = g(x, w);
    p.kind = 'static';
    this.level.platforms.push(p);
    this.level.solids.push(p);
    return p;
  }

  _addPlatform(x, y, w) {
    const p = pf(x, y, w);
    p.kind = 'static';
    this.level.platforms.push(p);
    this.level.solids.push(p);
    return p;
  }

  _addCoin(x, y) {
    this.level.coins.push({ x, y, r: 13, taken: false });
  }

  _addOrb(x, y, energy) {
    this.level.orbs.push({ x, y, r: 26, energy, taken: false, counted: false });
  }

  _addSpike(x, w) {
    this.level.spikes.push({ x, y: DESIGN.groundY - 22, w, h: 22 });
  }

  _addBarrier(x, energy) {
    this.level.barriers.push({
      x, y: 120, w: 34, h: DESIGN.groundY - 120, energy, done: false,
    });
  }

  _addPortal(x, toX, energy) {
    this.level.portals.push({
      x, y: 630, r: 62, energy, to: { x: toX, y: DESIGN.groundY - TUNING.playerH - 6 }, used: false,
    });
  }

  /* ---------------- aggiornamento ---------------- */
  update(dt, camX, viewW, player) {
    /* difficoltà progressiva */
    this.difficulty = clamp((player.x - this.startX) / 9000, 0, 1);

    /* genera avanti rispetto alla camera */
    const ahead = camX + viewW + 800;
    let guard = 0;
    while (this.cursorX < ahead && guard++ < 24) this._generate();

    /* tenere traccia del punto di ripristino sicuro */
    const ref = player.groundRef;
    if (player.onGround && ref && ref.kind === 'static' && ref.h > 100) {
      this.safeGround = ref;
      this.safeX = clamp(player.x, ref.x + 8, ref.x + ref.w - 60);
    }

    /* pulizia periodica degli oggetti dietro la camera */
    this.pruneTimer -= dt;
    if (this.pruneTimer <= 0) {
      this.pruneTimer = 0.4;
      this._prune(camX - 450);
    }
  }

  _generate() {
    const d = this.difficulty;
    const prevEnd = this.cursorX;

    /* varco: sempre entro la portata di salto (max ~195 px) */
    const gap = Math.round(rand(110, 110 + 85 * d));
    const nextX = prevEnd + gap;
    const len = Math.round(rand(300, 430 + 210 * d));
    this._addGround(nextX, len);

    /* monete sull'arco del varco */
    if (Math.random() < 0.8) {
      const n = randInt(3, 5);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        this._addCoin(lerp(prevEnd, nextX, t), DESIGN.groundY - 80 - Math.sin(t * Math.PI) * 70);
      }
    }

    /* piattaforma bonus con monete */
    if (Math.random() < 0.5) {
      const px = nextX + rand(40, Math.max(50, len - 190));
      const py = Math.random() < 0.55 ? 560 : 470;
      this._addPlatform(px, py, rand(110, 160));
      for (let i = 0; i < 3; i++) this._addCoin(px + 25 + i * 45, py - 55);
    }

    /* UNA sola "feature" per segmento: mai spine e barriere insieme */
    const roll = Math.random();
    if (d > 0.12 && roll < 0.22) {
      /* barriera energetica: la sfera corrisponde appena atterrati */
      const energy = choice(ENERGIES);
      this._addOrb(nextX + 60, DESIGN.groundY - 60, energy);
      this._addBarrier(nextX + 195, energy);
      for (let i = 0; i < 3; i++) this._addCoin(nextX + 120 + i * 48, DESIGN.groundY - 150);
    } else if (d > 0.18 && roll < 0.34) {
      /* portale sopra il varco: serve l'energia giusta prima di staccarsi */
      const energy = choice(ENERGIES);
      const target = nextX + Math.min(240, len - 150);
      this._addOrb(prevEnd - rand(140, 210), DESIGN.groundY - 60, energy);
      this._addPortal(prevEnd + gap / 2, target, energy);
    } else if (d > 0.05 && roll < 0.55) {
      /* spina sul terreno (mai ai bordi: zone di atterraggio libere) */
      const sw = Math.round(rand(70, 110 + 30 * d));
      const sx = Math.round(nextX + rand(150, Math.max(151, len - sw - 110)));
      this._addSpike(sx, sw);
      this._addCoin(sx + sw / 2, DESIGN.groundY - 130);
    } else if (Math.random() < 0.45) {
      /* terreno pulito: fila di monete a terra */
      const n = randInt(2, 4);
      const base = nextX + rand(60, Math.max(70, len - 160));
      for (let i = 0; i < n; i++) this._addCoin(base + i * 50, DESIGN.groundY - 60);
    }

    this.cursorX = nextX + len;
  }

  _prune(limitX) {
    const lv = this.level;
    const keep = (o, extra) => (o.x + extra > limitX) || (o === this.safeGround);
    lv.platforms = lv.platforms.filter((p) => keep(p, p.w));
    lv.moving = lv.moving.filter((p) => keep(p, p.w));
    lv.temp = lv.temp.filter((p) => keep(p, p.w));
    lv.spikes = lv.spikes.filter((s) => keep(s, s.w));
    lv.coins = lv.coins.filter((c) => keep(c, c.r * 2));
    lv.orbs = lv.orbs.filter((o) => keep(o, o.r * 2));
    lv.barriers = lv.barriers.filter((b) => keep(b, b.w));
    lv.portals = lv.portals.filter((p) => keep(p, p.r * 2));
    /* ricostruzione coerente con i tagli */
    lv.solids = lv.platforms.concat(lv.moving, lv.temp);
  }

  /* punteggio in base alla distanza + azioni */
  score(player) {
    return Math.max(0, Math.floor((player.x - this.startX) / 10)) + this.scoreBonus;
  }
}
