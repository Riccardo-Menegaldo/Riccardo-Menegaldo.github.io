/* ============================================================
   NEON BLOCKS — sistema di particelle con pool (nessun GC junk)
   Le particelle sono disegnate in modalità "lighter" (additiva)
   per simulare glow/bloom senza costosi shader.
   ============================================================ */

class ParticleSystem {
  constructor(max = 420) {
    this.max = max;
    this.pool = [];     // oggetti riutilizzati
    this.active = [];   // particelle vive
    for (let i = 0; i < max; i++) pool_push(this.pool, this._make());
  }

  _make() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 3, color: '#fff', grav: 0, drag: 0,
      type: 0, rot: 0, vr: 0, r0: 0, r1: 0,
    };
  }

  _get() {
    if (this.active.length >= this.max) return null;
    return this.pool.pop() || this._make();
  }

  _release(p) { this.pool.push(p); }

  clear() {
    while (this.active.length) this._release(this.active.pop());
  }

  /* Spruzzo di particelle (impatto, raccolta, esplosione) */
  burst(x, y, color, count, opts = {}) {
    const speed = opts.speed || 220;
    const life = opts.life || 0.55;
    const size = opts.size || 4;
    const spread = opts.spread == null ? Math.PI * 2 : opts.spread;
    const dir = opts.dir == null ? 0 : opts.dir;
    for (let i = 0; i < count; i++) {
      const p = this._get();
      if (!p) return;
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.85);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = life * (0.6 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.size = size * (0.6 + Math.random() * 0.9);
      p.color = color;
      p.grav = opts.grav == null ? 380 : opts.grav;
      p.drag = opts.drag == null ? 1.6 : opts.drag;
      p.type = 0;
      p.rot = 0; p.vr = 0;
      this.active.push(p);
    }
  }

  /* Scia dietro il personaggio */
  trail(x, y, color, size = 6) {
    const p = this._get();
    if (!p) return;
    p.x = x; p.y = y;
    p.vx = rand(-30, 30);
    p.vy = rand(-20, 35);
    p.life = 0.35; p.maxLife = 0.35;
    p.size = size; p.color = color;
    p.grav = 0; p.drag = 2.4;
    p.type = 0; p.rot = 0; p.vr = 0;
    this.active.push(p);
  }

  /* Onda ad anello (portali, shift, atterraggi) */
  ring(x, y, color, r0 = 8, r1 = 90, life = 0.5) {
    const p = this._get();
    if (!p) return;
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.life = life; p.maxLife = life;
    p.size = 3; p.color = color;
    p.grav = 0; p.drag = 0;
    p.type = 1; p.r0 = r0; p.r1 = r1;
    p.rot = 0; p.vr = 0;
    this.active.push(p);
  }

  /* Scintille quadratine rotanti (barriere superate) */
  sparks(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const p = this._get();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = rand(90, 340);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = rand(0.35, 0.7); p.maxLife = p.life;
      p.size = rand(3, 7);
      p.color = color;
      p.grav = 120; p.drag = 1.8;
      p.type = 2; p.rot = Math.random() * 6.28; p.vr = rand(-9, 9);
      this.active.push(p);
    }
  }

  update(dt) {
    const arr = this.active;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr[i] = arr[arr.length - 1];
        arr.pop();
        this._release(p);
        continue;
      }
      p.vy += p.grav * dt;
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  /* Disegno in coordinate mondo (la camera è già applicata) */
  draw(ctx, reduced) {
    const arr = this.active;
    if (!arr.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const t = p.life / p.maxLife;
      const a = t * t;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.type === 1) {
        // anello in espansione
        const r = lerp(p.r0, p.r1, 1 - t);
        ctx.lineWidth = Math.max(1, 5 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.2832);
        ctx.stroke();
      } else if (p.type === 2) {
        const s = p.size * (0.4 + t * 0.6);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
        ctx.restore();
      } else {
        const s = p.size * (0.35 + t * 0.65);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, 6.2832);
        ctx.fill();
        if (!reduced && s > 3) {
          ctx.globalAlpha = a * 0.35;
          ctx.beginPath();
          ctx.arc(p.x, p.y, s * 2.1, 0, 6.2832);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* piccolo helper per riempire la pool in fase di creazione */
function pool_push(arr, item) { arr.push(item); }
