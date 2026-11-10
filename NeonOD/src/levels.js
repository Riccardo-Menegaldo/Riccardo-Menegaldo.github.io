/* ============================================================
   NEON BLOCKS — livelli
   Una classe "Level" istanzia i dati statici (i def sono
   condivisi, lo stato no: monete prese, portali usati...).
   Geometria di riferimento:
     terreno (ground)      → y = 700, altezza 200
     salto massimo         → ~176 px  (passi ≤ 145 px)
     portata orizzontale   → ~279 px  (varchi ≤ 190 px)
   ============================================================ */

/* ---------- helper per costruire gruppi di monete ---------- */
function coinRow(x, y, n, step = 52) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ x: x + i * step, y });
  return a;
}
function coinArc(x1, x2, y, n = 5) {
  const a = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    a.push({ x: lerp(x1, x2, t), y: y - Math.sin(t * Math.PI) * 78 });
  }
  return a;
}
function coinList(...groups) {
  const out = [];
  for (const g of groups) for (const c of g) out.push(c);
  return out;
}

/* terreno predefinito: y = groundY, h = 200 */
function g(x, w) { return { x, y: DESIGN.groundY, w, h: DESIGN.worldHeight - DESIGN.groundY }; }

/* piattaforma fluttuante standard: "oneway" = si attraversa dal basso
   e si atterra solo cadendoci sopra — così non blocca mai l'arco di salto */
function pf(x, y, w) { return { x, y, w, h: 22, oneway: true }; }

class Level {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.theme = def.theme || 'city';
    this.width = def.width;
    this.height = def.height || DESIGN.worldHeight;
    this.spawn = { x: def.spawn.x, y: def.spawn.y };

    this.platforms = (def.platforms || []).map((p) => Object.assign({ kind: 'static', h: 24 }, p));
    this.moving = (def.moving || []).map((m) => {
      const o = Object.assign({ kind: 'moving', h: 22, axis: 'y', range: 60, speed: 1.2, t: rand(0, 6.28), dx: 0, dy: 0, oneway: true }, m);
      o.baseX = o.x;
      o.baseY = o.y;
      return o;
    });
    this.temp = (def.temp || []).map((t) =>
      Object.assign({ kind: 'temp', h: 22, cycle: 4.2, duty: 0.6, offset: 0, phase: 0, on: true, oneway: true }, t));

    /* tutti gli ostacoli solidi in un solo array (nessuna allocazione a runtime) */
    this.solids = this.platforms.concat(this.moving, this.temp);

    this.spikes = (def.spikes || []).map((s) => Object.assign({ h: 22 }, s));
    this.barriers = (def.barriers || []).map((b) =>
      Object.assign({ w: 34, y: 120, h: DESIGN.groundY - 120, done: false }, b));
    this.portals = (def.portals || []).map((p) => Object.assign({ r: 58, used: false }, p));
    this.orbs = (def.orbs || []).map((o) => Object.assign({ r: 20, taken: false, counted: false }, o));
    this.coins = (def.coins || []).map((c) => Object.assign({ r: 13, taken: false }, c));
    this.checkpoints = (def.checkpoints || []).map((c) =>
      Object.assign({ y: DESIGN.groundY - 66, reached: false }, c));
    this.goal = def.goal ? Object.assign({ w: 110, h: 200 }, def.goal) : null;
  }

  /* le sfere energetiche "tornano" dopo un danno, così il giocatore
     può sempre recuperare l'energia giusta dal checkpoint */
  resetOrbs() {
    for (const o of this.orbs) o.taken = false;
  }

  update(dt, fx, time) {
    /* piattaforme mobili */
    for (const m of this.moving) {
      m.t += dt * m.speed;
      const off = Math.sin(m.t) * m.range;
      const nx = m.baseX + (m.axis === 'x' ? off : 0);
      const ny = m.baseY + (m.axis === 'y' ? off : 0);
      m.dx = nx - m.x;
      m.dy = ny - m.y;
      m.x = nx;
      m.y = ny;
    }
    /* piattaforme temporanee (acceso/spento a ciclo) */
    for (const t of this.temp) {
      const prev = t.on;
      t.phase += dt;
      const pos = (((t.phase + t.offset) % t.cycle) + t.cycle) % t.cycle;
      t.on = pos < t.cycle * t.duty;
      if (t.on && !prev && fx && !SaveManager.data.reducedFx) {
        fx.burst(t.x + t.w / 2, t.y + t.h / 2, PALETTE.cyan, 8, { speed: 130, life: 0.35, size: 3 });
      }
    }
  }

  /* ============================ DISEGNO ============================
     `view` (camera) serve per disegnare solo gli oggetti visibili:
     in modalità infinita il mondo è lunghissimo, senza culling
     si disegnerebbero centinaia di oggetti fuori schermo. */
  draw(ctx, time, reduced, view) {
    const vw = view && isFinite(view.w) ? view.w : null;
    const vx0 = view && vw !== null ? view.x - 140 : -1e9;
    const vx1 = view && vw !== null ? view.x + vw + 140 : 1e9;
    const hX = (x, w) => (x + w) > vx0 && x < vx1;               // rettangolo
    const hC = (x, r) => (x + r) > vx0 && (x - r) < vx1;          // cerchio

    for (const p of this.platforms) if (hX(p.x, p.w)) this._platform(ctx, p, time, reduced);
    for (const m of this.moving) if (hX(m.x, m.w)) this._platform(ctx, m, time, reduced);
    for (const t of this.temp) if (hX(t.x, t.w)) this._tempPlatform(ctx, t, time, reduced);

    for (const s of this.spikes) if (hX(s.x, s.w)) this._spike(ctx, s, time);
    for (const c of this.coins) if (!c.taken && hC(c.x, c.r)) this._coin(ctx, c, time);
    for (const o of this.orbs) if (!o.taken && hC(o.x, o.r)) this._orb(ctx, o, time, reduced);
    for (const b of this.barriers) if (hX(b.x, b.w)) this._barrier(ctx, b, time, reduced);
    for (const p of this.portals) if (hC(p.x, p.r)) this._portal(ctx, p, time, reduced, false);
    for (const c of this.checkpoints) if (hX(c.x - 40, 80)) this._checkpoint(ctx, c, time, reduced);
    if (this.goal && hX(this.goal.x, this.goal.w)) this._goal(ctx, this.goal, time, reduced);
  }

  _platform(ctx, p, time, reduced) {
    const color = p.kind === 'moving' ? PALETTE.pink : PALETTE.purple;
    roundRectPath(ctx, p.x, p.y, p.w, p.h, 7);
    ctx.fillStyle = '#191140';
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // bordo superiore luminoso
    ctx.fillStyle = rgba(color, 0.95);
    ctx.fillRect(p.x + 5, p.y, p.w - 10, 3);
    ctx.fillStyle = rgba(color, 0.22);
    ctx.fillRect(p.x + 5, p.y + 3, p.w - 10, 11);
    // dettaglio laterale
    ctx.fillStyle = rgba(color, 0.5);
    ctx.fillRect(p.x + 2, p.y + 4, 3, p.h - 8);
    ctx.fillRect(p.x + p.w - 5, p.y + 4, 3, p.h - 8);
    ctx.restore();

    if (p.kind === 'moving' && !reduced) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(PALETTE.pink, 0.10 + 0.06 * Math.sin(time * 6));
      ctx.fillRect(p.x + 6, p.y + p.h, p.w - 12, 8);
      ctx.restore();
    }
  }

  _tempPlatform(ctx, t, time, reduced) {
    if (t.on) {
      roundRectPath(ctx, t.x, t.y, t.w, t.h, 7);
      ctx.fillStyle = rgba(PALETTE.cyan, 0.20);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(PALETTE.cyan, 0.95);
      ctx.fillRect(t.x + 5, t.y, t.w - 10, 3);
      ctx.fillStyle = rgba(PALETTE.cyan, 0.35);
      ctx.fillRect(t.x + 5, t.y + 3, t.w - 10, 8);
      ctx.restore();
    } else {
      ctx.save();
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -time * 30;
      ctx.strokeStyle = rgba(PALETTE.cyan, 0.35);
      ctx.lineWidth = 2;
      roundRectPath(ctx, t.x, t.y, t.w, t.h, 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  _spike(ctx, s, time) {
    const n = Math.max(1, Math.round(s.w / 24));
    const bw = s.w / n;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(PALETTE.danger || '#FF3B6B', 0.95);
    for (let i = 0; i < n; i++) {
      const x = s.x + i * bw;
      ctx.beginPath();
      ctx.moveTo(x + 1, s.y + s.h);
      ctx.lineTo(x + bw * 0.5, s.y);
      ctx.lineTo(x + bw - 1, s.y + s.h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = rgba('#FF3B6B', 0.30 + 0.15 * Math.sin(time * 5 + s.x * 0.01));
    ctx.fillRect(s.x, s.y + s.h - 4, s.w, 5);
    ctx.restore();
  }

  _coin(ctx, c, time) {
    const spin = Math.abs(Math.cos(time * 3.2 + c.x * 0.02));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.scale(0.30 + 0.70 * spin, 1);
    ctx.fillStyle = rgba(PALETTE.gold, 0.35);
    ctx.beginPath(); ctx.arc(0, 0, c.r + 5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#FFF6D0';
    ctx.beginPath(); ctx.arc(0, 0, c.r * 0.45, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  _orb(ctx, o, time, reduced) {
    const meta = ENERGY_META[o.energy];
    const pulse = 1 + Math.sin(time * 5 + o.x * 0.01) * 0.12;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(meta.color, 0.22);
    ctx.beginPath(); ctx.arc(0, 0, o.r * 1.7 * pulse, 0, 6.2832); ctx.fill();
    ctx.fillStyle = rgba(meta.color, 0.95);
    ctx.beginPath(); ctx.arc(0, 0, o.r * pulse, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#0B0620';
    ctx.font = `bold ${Math.round(o.r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.label[0], 0, 1);
    // anello rotante
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, o.r * 1.35, time * 2 + o.x * 0.01, time * 2 + o.x * 0.01 + 1.6);
    ctx.stroke();
    ctx.restore();
  }

  _barrier(ctx, b, time, reduced) {
    const meta = ENERGY_META[b.energy];
    const a = b.done ? 0.16 : 1;
    ctx.save();
    // colonna di energia
    const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    grad.addColorStop(0, rgba(meta.color, 0));
    grad.addColorStop(0.15, rgba(meta.color, 0.35 * a));
    grad.addColorStop(0.85, rgba(meta.color, 0.35 * a));
    grad.addColorStop(1, rgba(meta.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(meta.color, (b.done ? 0.35 : 0.9) * a);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x + 2, b.y); ctx.lineTo(b.x + 2, b.y + b.h);
    ctx.moveTo(b.x + b.w - 2, b.y); ctx.lineTo(b.x + b.w - 2, b.y + b.h);
    ctx.stroke();

    // righe scorrevoli
    ctx.lineWidth = 2;
    ctx.globalAlpha = (b.done ? 0.25 : 0.75) * a;
    const off = (time * 70) % 44;
    for (let y = b.y - 44 + off; y < b.y + b.h; y += 44) {
      ctx.strokeStyle = meta.color;
      ctx.beginPath();
      ctx.moveTo(b.x + 3, y);
      ctx.lineTo(b.x + b.w - 3, y + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  _portal(ctx, p, time, reduced, isGoal) {
    const meta = p.energy ? ENERGY_META[p.energy] : ENERGY_META.nova;
    const dim = p.used ? 0.35 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';

    if (!reduced) {
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 22 * dim;
    }

    // alone interno
    ctx.fillStyle = rgba(meta.color, 0.16 * dim);
    ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.86, p.r * 1.12, 0, 0, 6.2832); ctx.fill();

    // anelli rotanti
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgba(meta.color, 0.95 * dim);
    ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.86, p.r * 1.12, 0, 0, 6.2832); ctx.stroke();

    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a0 = time * (1.6 + i * 0.5) + i * 2.1;
      ctx.strokeStyle = i === 1 ? rgba('#FFFFFF', 0.7 * dim) : rgba(meta.color, 0.8 * dim);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * (0.62 + i * 0.16), p.r * (0.8 + i * 0.16), 0, a0, a0 + 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  _checkpoint(ctx, c, time, reduced) {
    const on = c.reached;
    const col = on ? PALETTE.cyan : '#5A4B9E';
    ctx.save();
    // asta
    ctx.strokeStyle = rgba(col, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(c.x, DESIGN.groundY);
    ctx.lineTo(c.x, c.y - 18);
    ctx.stroke();
    // luce in cima
    ctx.globalCompositeOperation = 'lighter';
    if (!reduced && on) {
      ctx.shadowColor = col; ctx.shadowBlur = 18;
    }
    ctx.fillStyle = rgba(col, on ? 1 : 0.7);
    ctx.save();
    ctx.translate(c.x, c.y - 26);
    ctx.rotate(Math.PI / 4);
    const s = 11 + (on ? Math.sin(time * 5) * 2 : 0);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    if (on) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(c.x, c.y - 26, 26, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _goal(ctx, goal, time, reduced) {
    const meta = goal.energy ? ENERGY_META[goal.energy] : ENERGY_META.nova;
    ctx.save();
    ctx.translate(goal.x + goal.w / 2, goal.y + goal.h / 2);

    if (!reduced) {
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 26;
    }
    // pilastri
    ctx.fillStyle = '#1B1440';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      const px = side * (goal.w / 2) - (side > 0 ? 12 : 0);
      roundRectPath(ctx, px, -goal.h / 2, 12, goal.h, 5);
      ctx.fill(); ctx.stroke();
    }
    // arco superiore
    roundRectPath(ctx, -goal.w / 2, -goal.h / 2 - 14, goal.w, 18, 8);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // vortice interno
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const k = i / 5;
      const rr = (goal.w * 0.42) * (1 - k * 0.7);
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 4 - i);
      ctx.strokeStyle = i % 2 ? '#FFFFFF' : meta.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 1.5, time * (0.8 + k), 0, 6.2832);
      ctx.stroke();
    }
    ctx.restore();

    // etichetta
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(meta.color, 0.95);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('META', 0, -goal.h / 2 - 22);
    ctx.restore();
  }
}

/* ============================================================
   DEFINIZIONI DEI LIVELLI
   ============================================================ */

const LEVELS = [
  /* ---------------- LIVELLO 1 — NEON CITY ---------------- */
  {
    name: 'NEON CITY',
    theme: 'city',
    width: 5000,
    spawn: { x: 90, y: 600 },
    platforms: [
      g(0, 700), g(850, 620), g(1640, 800), g(2620, 700), g(3490, 1510),
      pf(300, 560, 150), pf(540, 470, 140),
      pf(1000, 560, 150), pf(1250, 470, 140),
      pf(1490, 560, 130),
      pf(1760, 545, 150), pf(2010, 455, 160), pf(2260, 545, 150),
      pf(2470, 565, 130),
      pf(2720, 545, 150), pf(3010, 460, 150),
      pf(3350, 560, 130),
      pf(3700, 545, 150), pf(3950, 460, 150),
      pf(4180, 560, 160), pf(4550, 480, 150),
    ],
    spikes: [
      { x: 1100, y: 680, w: 100 }, { x: 2140, y: 680, w: 110 },
      { x: 3800, y: 680, w: 120 }, { x: 4700, y: 680, w: 100 },
    ],
    orbs: [
      { x: 1760, y: 640, energy: 'cyber' },
      { x: 2790, y: 640, energy: 'cyber' },
      { x: 4300, y: 640, energy: 'plasma' },
    ],
    barriers: [
      { x: 2960, energy: 'cyber' },
      { x: 4400, energy: 'plasma' },
    ],
    portals: [
      { x: 1900, y: 640, r: 60, energy: 'cyber', to: { x: 2320, y: 640 } },
    ],
    checkpoints: [{ x: 460, y: 640 }, { x: 1700, y: 640 }, { x: 2660, y: 640 }, { x: 3560, y: 640 }],
    coins: coinList(
      coinRow(320, 500, 3), coinRow(560, 410, 3),
      coinArc(700, 850, 620, 4),
      coinRow(1020, 500, 3), coinRow(1270, 410, 3),
      coinArc(1470, 1640, 620, 4),
      coinRow(1780, 485, 3), coinRow(2030, 395, 3),
      coinArc(2440, 2620, 620, 4),
      coinRow(2740, 485, 3), coinRow(3030, 400, 3),
      coinArc(3320, 3490, 620, 4),
      coinRow(3720, 485, 3), coinRow(3970, 400, 3),
      coinRow(4210, 500, 3), coinRow(4570, 420, 3),
      coinRow(4820, 640, 3), coinRow(500, 640, 2), coinRow(2880, 640, 2)
    ),
    goal: { x: 4880, y: DESIGN.groundY - 200, w: 110, h: 200, energy: null },
  },

  /* ---------------- LIVELLO 2 — PLASMA FACTORY ---------------- */
  {
    name: 'PLASMA FACTORY',
    theme: 'factory',
    width: 5600,
    spawn: { x: 90, y: 600 },
    platforms: [
      g(0, 600), g(780, 520), g(1480, 570), g(2240, 660),
      g(3090, 660), g(3920, 640), g(4740, 860),
      pf(250, 555, 150), pf(470, 465, 140),
      pf(870, 545, 150), pf(1120, 455, 140),
      pf(1520, 560, 150), pf(1760, 470, 150), pf(1960, 560, 120),
      pf(2290, 555, 150), pf(2540, 465, 150), pf(2780, 555, 140),
      pf(3140, 560, 150), pf(3390, 470, 150), pf(3620, 560, 130),
      pf(3980, 550, 150), pf(4230, 460, 150), pf(4460, 560, 130),
      pf(4800, 550, 150), pf(5060, 460, 160), pf(5320, 560, 150),
    ],
    moving: [
      { x: 630, y: 580, w: 130, axis: 'y', range: 70, speed: 1.3 },
      { x: 2090, y: 575, w: 140, axis: 'x', range: 90, speed: 1.1 },
      { x: 2940, y: 570, w: 150, axis: 'x', range: 100, speed: 1.2 },
      { x: 4600, y: 585, w: 130, axis: 'y', range: 75, speed: 1.5 },
    ],
    spikes: [
      { x: 950, y: 680, w: 110 }, { x: 1900, y: 680, w: 90 },
      { x: 2400, y: 680, w: 100 }, { x: 2680, y: 680, w: 100 },
      { x: 3260, y: 680, w: 90 }, { x: 4050, y: 680, w: 130 },
      { x: 4900, y: 680, w: 130 }, { x: 5250, y: 680, w: 120 },
    ],
    orbs: [
      { x: 1650, y: 640, energy: 'plasma' },
      { x: 2480, y: 640, energy: 'plasma' },
      { x: 3300, y: 640, energy: 'nova' },
      { x: 5060, y: 640, energy: 'cyber' },
      { x: 5420, y: 640, energy: 'plasma' },
    ],
    barriers: [
      { x: 1700, energy: 'plasma' },
      { x: 3400, energy: 'nova' },
      { x: 5150, energy: 'cyber' },
    ],
    portals: [
      { x: 2600, y: 640, r: 60, energy: 'plasma', to: { x: 2840, y: 640 } },
    ],
    checkpoints: [
      { x: 220, y: 640 }, { x: 1500, y: 640 }, { x: 2260, y: 640 },
      { x: 3110, y: 640 }, { x: 3960, y: 640 }, { x: 4780, y: 640 },
    ],
    coins: coinList(
      coinRow(270, 495, 3), coinRow(490, 405, 3),
      coinArc(600, 780, 620, 4),
      coinRow(890, 485, 3), coinRow(1140, 395, 3),
      coinArc(1300, 1480, 620, 4),
      coinRow(1540, 500, 3), coinRow(1780, 410, 3),
      coinArc(2050, 2240, 620, 4),
      coinRow(2310, 495, 3), coinRow(2560, 405, 3), coinRow(2800, 495, 3),
      coinArc(2900, 3090, 620, 4),
      coinRow(3160, 500, 3), coinRow(3410, 410, 3),
      coinArc(3750, 3920, 620, 4),
      coinRow(4000, 490, 3), coinRow(4250, 400, 3),
      coinArc(4560, 4740, 620, 4),
      coinRow(4820, 490, 3), coinRow(5080, 400, 3), coinRow(5340, 500, 3),
      coinRow(600, 640, 2), coinRow(3700, 640, 2), coinRow(5480, 640, 2)
    ),
    goal: { x: 5460, y: DESIGN.groundY - 200, w: 110, h: 200, energy: 'plasma' },
  },

  /* ---------------- LIVELLO 3 — CYBER CORE ---------------- */
  {
    name: 'CYBER CORE',
    theme: 'core',
    width: 6200,
    spawn: { x: 90, y: 600 },
    platforms: [
      g(0, 560), g(750, 470), g(1400, 560), g(2150, 490),
      g(2860, 420), g(3460, 560), g(4210, 500), g(4900, 460), g(5550, 650),
      pf(260, 555, 150), pf(500, 465, 140),
      pf(830, 550, 150), pf(1080, 460, 140),
      pf(1470, 555, 150), pf(1720, 465, 150),
      pf(2200, 550, 150), pf(2450, 460, 140),
      pf(2920, 545, 150), pf(3150, 455, 140),
      pf(3520, 555, 150), pf(3770, 465, 150),
      pf(4260, 550, 150), pf(4520, 460, 150),
      pf(4960, 550, 150), pf(5200, 460, 140),
      pf(5600, 550, 150), pf(5850, 470, 160),
    ],
    moving: [
      { x: 1250, y: 560, w: 140, axis: 'x', range: 70, speed: 1.3 },
      { x: 3320, y: 565, w: 140, axis: 'y', range: 80, speed: 1.6 },
      { x: 4750, y: 560, w: 140, axis: 'x', range: 80, speed: 1.4 },
      { x: 5400, y: 555, w: 140, axis: 'y', range: 70, speed: 1.7 },
    ],
    temp: [
      { x: 2690, y: 590, w: 120, cycle: 4.2, duty: 0.62, offset: 0 },
      { x: 1990, y: 585, w: 110, cycle: 4.6, duty: 0.6, offset: 1.5 },
      { x: 4060, y: 585, w: 110, cycle: 4.0, duty: 0.6, offset: 0.8 },
    ],
    spikes: [
      { x: 900, y: 680, w: 80 }, { x: 1760, y: 680, w: 70 },
      { x: 2300, y: 680, w: 100 }, { x: 3600, y: 680, w: 70 },
      { x: 4460, y: 680, w: 90 }, { x: 5150, y: 680, w: 90 },
      { x: 5800, y: 680, w: 100 },
    ],
    orbs: [
      { x: 960, y: 640, energy: 'cyber' },
      { x: 1620, y: 640, energy: 'plasma' },
      { x: 1880, y: 640, energy: 'cyber' },
      { x: 2240, y: 640, energy: 'nova' },
      { x: 3590, y: 640, energy: 'nova' },
      { x: 4300, y: 640, energy: 'cyber' },
      { x: 4960, y: 640, energy: 'plasma' },
      { x: 5300, y: 640, energy: 'nova' },
      { x: 5750, y: 640, energy: 'nova' },
    ],
    barriers: [
      { x: 1050, energy: 'cyber' },
      { x: 1800, energy: 'plasma' },
      { x: 3700, energy: 'nova' },
      { x: 4400, energy: 'cyber' },
      { x: 5050, energy: 'plasma' },
    ],
    portals: [
      { x: 2050, y: 630, r: 58, energy: 'cyber', to: { x: 2400, y: 640 } },
      { x: 5450, y: 620, r: 60, energy: 'nova', to: { x: 5970, y: 640 } },
    ],
    checkpoints: [
      { x: 200, y: 640 }, { x: 800, y: 640 }, { x: 1450, y: 640 },
      { x: 2170, y: 640 }, { x: 2900, y: 640 }, { x: 3480, y: 640 },
      { x: 4250, y: 640 }, { x: 4930, y: 640 }, { x: 5570, y: 640 },
    ],
    coins: coinList(
      coinRow(280, 495, 3), coinRow(520, 405, 3),
      coinArc(560, 750, 620, 4),
      coinRow(850, 490, 3), coinRow(1100, 400, 3),
      coinArc(1220, 1400, 620, 4),
      coinRow(1490, 495, 3), coinRow(1740, 405, 3),
      coinArc(1960, 2150, 620, 4),
      coinRow(2220, 490, 3), coinRow(2470, 400, 3),
      coinArc(2640, 2860, 640, 5),
      coinRow(2940, 485, 3), coinRow(3170, 395, 3),
      coinArc(3280, 3460, 620, 4),
      coinRow(3540, 495, 3), coinRow(3790, 405, 3),
      coinArc(4020, 4210, 620, 4),
      coinRow(4280, 490, 3), coinRow(4540, 400, 3),
      coinArc(4710, 4900, 620, 4),
      coinRow(4980, 490, 3), coinRow(5220, 400, 3),
      coinArc(5360, 5550, 620, 4),
      coinRow(5620, 490, 3), coinRow(5870, 410, 3),
      coinRow(6050, 640, 2), coinRow(1000, 640, 2)
    ),
    goal: { x: 6000, y: DESIGN.groundY - 220, w: 130, h: 220, energy: 'nova' },
  },

  /* ---------------- LIVELLO 4 — NEON HIGHWAY ---------------- */
  {
    name: 'NEON HIGHWAY',
    theme: 'highway',
    width: 5800,
    spawn: { x: 90, y: 600 },
    platforms: [
      g(0, 640), g(810, 560), g(1530, 620), g(2320, 560),
      g(3050, 640), g(3860, 540), g(4570, 600), g(5340, 460),
      pf(240, 560, 150), pf(470, 470, 140),
      pf(870, 555, 150), pf(1120, 465, 140),
      pf(1580, 560, 150), pf(1830, 470, 150), pf(2050, 560, 120),
      pf(2380, 555, 150), pf(2620, 465, 140),
      pf(3100, 560, 150), pf(3350, 470, 150), pf(3580, 560, 120),
      pf(3920, 555, 150), pf(4160, 465, 140),
      pf(4630, 560, 150), pf(4870, 470, 150), pf(5100, 560, 130),
      pf(5400, 555, 150), pf(5480, 470, 140),
    ],
    moving: [
      { x: 640, y: 580, w: 130, axis: 'y', range: 70, speed: 1.4 },
      { x: 2260, y: 575, w: 140, axis: 'x', range: 60, speed: 1.2 },
      { x: 3740, y: 570, w: 140, axis: 'y', range: 80, speed: 1.5 },
      { x: 5250, y: 580, w: 130, axis: 'y', range: 70, speed: 1.4 },
    ],
    temp: [
      { x: 1400, y: 590, w: 120, cycle: 4.4, duty: 0.6, offset: 0 },
      { x: 2920, y: 588, w: 120, cycle: 4.0, duty: 0.62, offset: 1.2 },
      { x: 4440, y: 588, w: 120, cycle: 4.6, duty: 0.58, offset: 2.0 },
    ],
    spikes: [
      { x: 950, y: 680, w: 110 }, { x: 1900, y: 680, w: 100 },
      { x: 2450, y: 680, w: 110 }, { x: 3450, y: 680, w: 120 },
      { x: 4050, y: 680, w: 110 }, { x: 4950, y: 680, w: 120 },
      { x: 5500, y: 680, w: 100 },
    ],
    orbs: [
      { x: 1620, y: 640, energy: 'plasma' },
      { x: 2420, y: 640, energy: 'nova' },
      { x: 3150, y: 640, energy: 'cyber' },
      { x: 4680, y: 640, energy: 'plasma' },
      { x: 5440, y: 640, energy: 'nova' },
    ],
    barriers: [
      { x: 1750, energy: 'plasma' },
      { x: 3300, energy: 'cyber' },
      { x: 4800, energy: 'plasma' },
    ],
    portals: [
      { x: 2670, y: 640, r: 60, energy: 'nova', to: { x: 3120, y: 640 } },
    ],
    checkpoints: [
      { x: 300, y: 640 }, { x: 1560, y: 640 }, { x: 2350, y: 640 },
      { x: 3080, y: 640 }, { x: 3890, y: 640 }, { x: 4600, y: 640 },
    ],
    coins: coinList(
      coinRow(260, 500, 3), coinRow(490, 410, 3),
      coinArc(640, 810, 620, 4),
      coinRow(890, 495, 3), coinRow(1140, 405, 3),
      coinArc(1370, 1530, 620, 4),
      coinRow(1600, 500, 3), coinRow(1850, 410, 3), coinRow(2070, 500, 3),
      coinArc(2150, 2320, 620, 4),
      coinRow(2400, 495, 3), coinRow(2640, 405, 3),
      coinArc(2880, 3050, 620, 4),
      coinRow(3120, 500, 3), coinRow(3370, 410, 3), coinRow(3600, 500, 3),
      coinArc(3690, 3860, 620, 4),
      coinRow(3940, 495, 3), coinRow(4180, 405, 3),
      coinArc(4400, 4570, 620, 4),
      coinRow(4650, 500, 3), coinRow(4890, 410, 3), coinRow(5120, 500, 3),
      coinArc(5170, 5340, 620, 4),
      coinRow(5420, 495, 3),
      coinRow(150, 640, 2), coinRow(3760, 640, 2)
    ),
    goal: { x: 5670, y: DESIGN.groundY - 200, w: 110, h: 200, energy: 'nova' },
  },

  /* ---------------- LIVELLO 5 — QUANTUM VAULT ---------------- */
  {
    name: 'QUANTUM VAULT',
    theme: 'vault',
    width: 6100,
    spawn: { x: 90, y: 600 },
    platforms: [
      g(0, 600), g(770, 540), g(1480, 560), g(2210, 540),
      g(2920, 560), g(3650, 540), g(4360, 560), g(5090, 540), g(5800, 300),
      pf(230, 555, 150), pf(460, 465, 140),
      pf(830, 550, 150), pf(1070, 460, 140),
      pf(1540, 555, 150), pf(1780, 465, 150),
      pf(2270, 550, 150), pf(2510, 460, 140),
      pf(2980, 555, 150), pf(3220, 465, 150),
      pf(3710, 550, 150), pf(3950, 460, 140),
      pf(4420, 555, 150), pf(4660, 465, 150),
      pf(5150, 550, 150), pf(5390, 460, 140),
      pf(5840, 550, 100),
    ],
    moving: [
      { x: 640, y: 580, w: 130, axis: 'x', range: 70, speed: 1.4 },
      { x: 2090, y: 575, w: 130, axis: 'y', range: 75, speed: 1.5 },
      { x: 3540, y: 570, w: 140, axis: 'x', range: 90, speed: 1.3 },
      { x: 4970, y: 575, w: 130, axis: 'y', range: 80, speed: 1.6 },
    ],
    temp: [
      { x: 1360, y: 590, w: 110, cycle: 4.0, duty: 0.6, offset: 0.6 },
      { x: 2810, y: 588, w: 110, cycle: 4.4, duty: 0.58, offset: 2.2 },
      { x: 4240, y: 588, w: 110, cycle: 4.2, duty: 0.6, offset: 1.4 },
      { x: 5650, y: 588, w: 110, cycle: 4.8, duty: 0.55, offset: 3.0 },
    ],
    spikes: [
      { x: 900, y: 680, w: 100 }, { x: 1850, y: 680, w: 110 },
      { x: 2400, y: 680, w: 100 }, { x: 3300, y: 680, w: 120 },
      { x: 3850, y: 680, w: 100 }, { x: 4700, y: 680, w: 110 },
      { x: 5400, y: 680, w: 120 },
    ],
    orbs: [
      { x: 1560, y: 640, energy: 'nova' },
      { x: 2280, y: 640, energy: 'cyber' },
      { x: 3000, y: 640, energy: 'plasma' },
      { x: 3730, y: 640, energy: 'nova' },
      { x: 4440, y: 640, energy: 'cyber' },
      { x: 5170, y: 640, energy: 'plasma' },
      { x: 5880, y: 640, energy: 'nova' },
    ],
    barriers: [
      { x: 1700, energy: 'nova' },
      { x: 3150, energy: 'plasma' },
      { x: 4600, energy: 'cyber' },
      { x: 5300, energy: 'plasma' },
    ],
    portals: [
      { x: 2600, y: 640, r: 60, energy: 'cyber', to: { x: 2980, y: 640 } },
    ],
    checkpoints: [
      { x: 250, y: 640 }, { x: 1500, y: 640 }, { x: 2230, y: 640 },
      { x: 2940, y: 640 }, { x: 3670, y: 640 }, { x: 4380, y: 640 },
      { x: 5110, y: 640 }, { x: 5820, y: 640 },
    ],
    coins: coinList(
      coinRow(250, 495, 3), coinRow(480, 405, 3),
      coinArc(600, 770, 620, 4),
      coinRow(850, 490, 3), coinRow(1090, 400, 3),
      coinArc(1310, 1480, 620, 4),
      coinRow(1560, 495, 3), coinRow(1800, 405, 3),
      coinArc(2040, 2210, 620, 4),
      coinRow(2290, 490, 3), coinRow(2530, 400, 3),
      coinArc(2750, 2920, 620, 4),
      coinRow(3000, 495, 3), coinRow(3240, 405, 3),
      coinArc(3480, 3650, 620, 4),
      coinRow(3730, 490, 3), coinRow(3970, 400, 3),
      coinArc(4190, 4360, 620, 4),
      coinRow(4440, 495, 3), coinRow(4680, 405, 3),
      coinArc(4920, 5090, 620, 4),
      coinRow(5170, 490, 3), coinRow(5410, 400, 3),
      coinArc(5630, 5800, 620, 4),
      coinRow(5860, 490, 3),
      coinRow(150, 640, 2), coinRow(4050, 640, 2)
    ),
    goal: { x: 5950, y: DESIGN.groundY - 220, w: 130, h: 220, energy: 'nova' },
  },

  /* ---------------- LIVELLO 6 — NOVA ZENITH ---------------- */
  {
    name: 'NOVA ZENITH',
    theme: 'zenith',
    width: 6600,
    spawn: { x: 90, y: 600 },
    platforms: [
      g(0, 560), g(730, 520), g(1420, 540), g(2130, 520),
      g(2820, 540), g(3530, 520), g(4220, 540), g(4930, 520),
      g(5620, 540), g(6330, 270),
      pf(220, 555, 150), pf(450, 465, 140),
      pf(790, 550, 150), pf(1030, 460, 140),
      pf(1480, 555, 150), pf(1720, 465, 140),
      pf(2190, 550, 150), pf(2430, 460, 140),
      pf(2880, 555, 150), pf(3120, 465, 150),
      pf(3590, 550, 150), pf(3830, 460, 140),
      pf(4280, 555, 150), pf(4520, 465, 150),
      pf(4990, 550, 150), pf(5230, 460, 140),
      pf(5680, 555, 150), pf(5920, 465, 150),
    ],
    moving: [
      { x: 620, y: 578, w: 130, axis: 'y', range: 72, speed: 1.5 },
      { x: 2010, y: 574, w: 130, axis: 'x', range: 80, speed: 1.3 },
      { x: 3420, y: 572, w: 140, axis: 'y', range: 84, speed: 1.7 },
      { x: 4810, y: 576, w: 130, axis: 'x', range: 90, speed: 1.4 },
      { x: 6220, y: 578, w: 130, axis: 'y', range: 70, speed: 1.6 },
    ],
    temp: [
      { x: 1300, y: 590, w: 110, cycle: 3.8, duty: 0.6, offset: 0 },
      { x: 2710, y: 588, w: 110, cycle: 4.0, duty: 0.58, offset: 1.6 },
      { x: 4110, y: 588, w: 110, cycle: 4.4, duty: 0.58, offset: 2.4 },
      { x: 5510, y: 588, w: 110, cycle: 4.2, duty: 0.56, offset: 3.2 },
    ],
    spikes: [
      { x: 380, y: 680, w: 100 }, { x: 850, y: 680, w: 100 },
      { x: 1780, y: 680, w: 100 }, { x: 2140, y: 680, w: 100 },
      { x: 4500, y: 680, w: 100 }, { x: 4960, y: 680, w: 100 },
      { x: 5900, y: 680, w: 100 },
    ],
    orbs: [
      { x: 1470, y: 640, energy: 'cyber' },
      { x: 2300, y: 640, energy: 'plasma' },
      { x: 2890, y: 640, energy: 'nova' },
      { x: 3650, y: 640, energy: 'cyber' },
      { x: 4270, y: 640, energy: 'plasma' },
      { x: 5080, y: 640, energy: 'nova' },
      { x: 5670, y: 640, energy: 'cyber' },
      { x: 6370, y: 640, energy: 'nova' },
    ],
    barriers: [
      { x: 1650, energy: 'cyber' },
      { x: 2350, energy: 'plasma' },
      { x: 3050, energy: 'nova' },
      { x: 3750, energy: 'cyber' },
      { x: 4440, energy: 'plasma' },
      { x: 5120, energy: 'nova' },
      { x: 5820, energy: 'cyber' },
    ],
    portals: [
      { x: 3300, y: 640, r: 60, energy: 'nova', to: { x: 3580, y: 640 } },
    ],
    checkpoints: [
      { x: 220, y: 640 }, { x: 1450, y: 640 }, { x: 2600, y: 640 },
      { x: 2870, y: 640 }, { x: 3560, y: 640 }, { x: 4250, y: 640 },
      { x: 5420, y: 640 }, { x: 5650, y: 640 }, { x: 6360, y: 640 },
    ],
    coins: coinList(
      coinRow(240, 495, 3), coinRow(470, 405, 3),
      coinArc(560, 730, 620, 4),
      coinRow(810, 490, 3), coinRow(1050, 400, 3),
      coinArc(1250, 1420, 620, 4),
      coinRow(1500, 495, 3), coinRow(1740, 405, 3),
      coinArc(1960, 2130, 620, 4),
      coinRow(2210, 490, 3), coinRow(2450, 400, 3),
      coinArc(2650, 2820, 620, 4),
      coinRow(2900, 495, 3), coinRow(3140, 405, 3),
      coinArc(3360, 3530, 620, 4),
      coinRow(3610, 490, 3), coinRow(3850, 400, 3),
      coinArc(4050, 4220, 620, 4),
      coinRow(4300, 495, 3), coinRow(4540, 405, 3),
      coinArc(4760, 4930, 620, 4),
      coinRow(5010, 490, 3), coinRow(5250, 400, 3),
      coinArc(5450, 5620, 620, 4),
      coinRow(5700, 495, 3), coinRow(5940, 405, 3),
      coinArc(6160, 6330, 620, 4),
      coinRow(6390, 640, 3), coinRow(620, 640, 2)
    ),
    goal: { x: 6470, y: DESIGN.groundY - 200, w: 110, h: 200, energy: 'nova' },
  },
];
