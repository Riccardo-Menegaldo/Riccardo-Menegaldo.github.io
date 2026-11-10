/* ============================================================
   NEON BLOCKS — protagonista "Pluto"
   Cubo viola luminoso con occhi ciano: fisica, animazioni e
   disegno interamente su Canvas (nessuna immagine esterna).
   ============================================================ */

class Player {
  constructor() {
    this.w = TUNING.playerW;
    this.h = TUNING.playerH;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.groundRef = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false;      // salto tenuto premuto
    this.facing = 1;           // 1 = destra, -1 = sinistra
    this.rot = 0;              // rotazione in volo
    this.squash = 1;           // compressione/espansione
    this.animT = 0;            // animazione corsa
    this.blinkT = rand(1.5, 3);
    this.blink = 0;
    this.trailT = 0;
    this.invuln = 0;           // invulnerabilità dopo un danno
    this.energy = 0;           // indice in ENERGIES (0 = CYBER)
    this.energyPulse = 0;      // flash visivo al cambio energia
    this.autoRun = false;      // modalità infinita
    this.autoSpeed = 0;
    this.alive = true;
  }

  get energyId() { return ENERGIES[this.energy]; }
  get energyMeta() { return ENERGY_META[ENERGIES[this.energy]]; }

  /* Cambio energia (SHIFT) con effetto luminoso */
  cycleEnergy(dir = 1, fx = null) {
    this.energy = (this.energy + dir + ENERGIES.length) % ENERGIES.length;
    this.energyPulse = 1;
    if (fx) {
      const c = this.energyMeta.color;
      fx.ring(this.x + this.w / 2, this.y + this.h / 2, c, 10, 70, 0.42);
      fx.burst(this.x + this.w / 2, this.y + this.h / 2, c, 14, { speed: 260, life: 0.45, size: 4 });
    }
    return this.energyId;
  }

  setEnergy(id, fx = null) {
    const idx = ENERGIES.indexOf(id);
    if (idx < 0 || idx === this.energy) return false;
    this.energy = idx;
    this.energyPulse = 1;
    if (fx) {
      const c = this.energyMeta.color;
      fx.ring(this.x + this.w / 2, this.y + this.h / 2, c, 8, 60, 0.4);
      fx.burst(this.x + this.w / 2, this.y + this.h / 2, c, 12, { speed: 240, life: 0.4, size: 4 });
    }
    return true;
  }

  /* --------------------------------------------------------
     Fisica + collisioni. `level` espone:
       level.solids   → array di rettangoli {x,y,w,h,kind}
       level.width    → larghezza del mondo
     -------------------------------------------------------- */
  update(dt, input, level, fx) {
    const T = TUNING;

    // --- trasporto dalle piattaforme mobili su cui sto poggiando ---
    const ref = this.groundRef;
    if (ref && ref.kind === 'moving') {
      this.x += ref.dx || 0;
      this.y += ref.dy || 0;
    }

    const wasAir = !this.onGround;

    // --- timer coyote / buffer di salto ---
    this.coyote = this.onGround ? T.coyoteTime : Math.max(0, this.coyote - dt);
    if (input.jumpPressed) this.jumpBuffer = T.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // --- movimento orizzontale ---
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (this.autoRun) {
      // nella modalità infinita si corre verso destra; sinistra = freno, destra = sprint
      let target = this.autoSpeed;
      if (input.left) target *= 0.5;
      else if (input.right) target *= 1.25;
      const delta = clamp(target - this.vx, -T.accel * dt * 1.6, T.accel * dt * 1.6);
      this.vx = clamp(this.vx + delta, 0, target * 1.3);
      if (this.vx > 40) this.facing = 1;
    } else if (dir !== 0) {
      const acc = this.onGround ? T.accel : T.airAccel;
      this.vx += dir * acc * dt;
      this.vx = clamp(this.vx, -T.moveSpeed, T.moveSpeed);
      this.facing = dir;
    } else {
      const fr = (this.onGround ? T.friction : T.friction * 0.35) * dt;
      if (Math.abs(this.vx) <= fr) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * fr;
    }

    // --- salto (con buffer e coyote time) ---
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -T.jumpVelocity;
      this.onGround = false;
      this.groundRef = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumping = true;
      this.squash = 1.16;
      AudioFX.play('jump');
      if (fx) fx.burst(this.x + this.w / 2, this.y + this.h, this.energyMeta.color, 8,
        { speed: 150, life: 0.35, size: 3, dir: Math.PI / 2, spread: 2.2, grav: 200 });
    }
    // altezza variabile: rilascio anticipato => salto più basso
    if (this.jumping && !input.jump && this.vy < -T.jumpVelocity * T.jumpCut) {
      this.vy = -T.jumpVelocity * T.jumpCut;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    // --- gravità ---
    this.vy = Math.min(this.vy + T.gravity * dt, T.maxFall);

    // --- integrazione + risoluzione collisioni ---
    this.x += this.vx * dt;
    this._collide(level, 'x');

    this.onGround = false;
    this.groundRef = null;
    this._prevBottom = this.y + this.h;   // fondo del giocatore prima di muoversi
    this.y += this.vy * dt;
    this._collide(level, 'y');

    // parete sinistra del mondo
    if (this.x < 0) { this.x = 0; if (this.vx < 0) this.vx = 0; }

    // --- effetti di atterraggio ---
    if (wasAir && this.onGround) {
      this.squash = 0.74;
      AudioFX.play('land');
      if (fx) fx.burst(this.x + this.w / 2, this.y + this.h, '#9E8CFF', 7,
        { speed: 130, life: 0.3, size: 3, dir: -Math.PI / 2, spread: 2.6, grav: 420 });
    }

    // --- animazioni ---
    if (this.onGround) this.animT += dt * (3 + Math.abs(this.vx) * 0.03);
    this.squash = damp(this.squash, 1, 14, dt);
    const targetRot = this.onGround ? 0 : clamp(this.vx / 1500, -0.42, 0.42);
    this.rot = damp(this.rot, targetRot, 9, dt);
    if (this.energyPulse > 0) this.energyPulse = Math.max(0, this.energyPulse - dt * 2.6);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = rand(2, 4.2); }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt);

    // --- scia luminosa in volo ---
    if (!this.onGround && this.vy > -120) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.05;
        if (fx) fx.trail(this.x + this.w / 2 - this.facing * 6, this.y + this.h - 4,
          this.energyMeta.color, 7);
      }
    }
  }

  _collide(level, axis) {
    const solids = level.solids;
    for (let i = 0; i < solids.length; i++) {
      const p = solids[i];
      if (p.kind === 'temp' && !p.on) continue;      // piattaforma temporanea spenta
      if (p.kind === 'crate' && p.broken) continue;  // scatole rompibili (estensione futura)
      if (!rectsOverlap(this, p)) continue;

      /* piattaforme "passanti dal basso" (flottanti, mobili, temporanee):
         nessun blocco laterale e atterraggio solo cadendo dall'alto.
         Così non intercettano mai l'arco di un salto verso un varco. */
      if (p.oneway) {
        if (axis === 'x') continue;
        if (this.vy > 0 && this._prevBottom <= p.y + 1) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
          this.groundRef = p;
        }
        continue;
      }

      if (axis === 'x') {
        if (this.vx > 0) this.x = p.x - this.w;
        else if (this.vx < 0) this.x = p.x + p.w;
        else this.x = (this.x + this.w * 0.5 < p.x + p.w * 0.5) ? p.x - this.w : p.x + p.w;
        this.vx = 0;
      } else {
        if (this.vy > 0) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
          this.groundRef = p;
        } else if (this.vy < 0) {
          this.y = p.y + p.h;
          this.vy = 0;
        } else {
          // risoluzione minimale (piattaforma mossa dentro il giocatore)
          if (this.y + this.h * 0.5 < p.y + p.h * 0.5) {
            this.y = p.y - this.h;
            this.onGround = true;
            this.groundRef = p;
          } else {
            this.y = p.y + p.h;
          }
        }
      }
    }
  }

  /* --------------------------------------------------------
     Disegno: corpo arrotondato, glow, occhi, piedi, animazioni
     -------------------------------------------------------- */
  draw(ctx, time, reduced) {
    // lampeggio durante l'invulnerabilità
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) return;

    const skin = getActiveSkin();
    const meta = this.energyMeta;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const w = this.w, h = this.h;

    // il corpo si tinge dell'energia attiva
    const bodyColor = mixColor(skin.color, meta.color, 0.42 + 0.3 * this.energyPulse);
    const glowColor = meta.color;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rot);

    // conservazione del volume nello squash & stretch
    const sy = this.squash;
    const sx = 1 / (0.6 + 0.4 * sy);
    ctx.scale(sx, sy);

    // alone luminoso
    if (!reduced) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 20 + 14 * this.energyPulse;
    }

    // corpo
    roundRectPath(ctx, -w / 2, -h / 2, w, h, 11);
    ctx.fillStyle = bodyColor;
    ctx.fill();

    // bordo neon
    ctx.shadowBlur = reduced ? 0 : 10;
    ctx.lineWidth = 3;
    ctx.strokeStyle = glowColor;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // piastra frontale (leggibile anche con skin scura)
    roundRectPath(ctx, -w / 2 + 6, -h / 2 + 7, w - 12, h * 0.5, 7);
    ctx.fillStyle = 'rgba(10,6,26,0.55)';
    ctx.fill();

    // --- occhi ---
    const eyeW = 9, eyeH = 13;
    const blinkScale = this.blink > 0 ? 0.15 : 1;
    const lookX = clamp(this.facing * 2.4 + this.vx * 0.006, -3.5, 3.5);
    const lookY = clamp(this.vy * 0.004, -3, 3);
    ctx.fillStyle = skin.accent;
    for (const side of [-1, 1]) {
      const ex = side * 8 - eyeW / 2 + lookX;
      const ey = -h * 0.06 - eyeH / 2 + lookY;
      roundRectPath(ctx, ex, ey, eyeW, eyeH * blinkScale, 4);
      ctx.fill();
      if (blinkScale > 0.5) {
        ctx.fillStyle = '#0B0620';
        ctx.beginPath();
        ctx.arc(ex + eyeW / 2 + lookX * 0.4, ey + eyeH / 2 + lookY * 0.4, 2.6, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = skin.accent;
      }
    }

    // --- piedi (corsa / volo) ---
    const running = this.onGround && Math.abs(this.vx) > 30;
    const step = running ? Math.sin(this.animT * 4.2) : 0;
    ctx.fillStyle = glowColor;
    const footY = h / 2 - 1;
    if (this.onGround) {
      roundRectPath(ctx, -w / 2 + 7 + step * 5, footY - 5, 11, 7, 3); ctx.fill();
      roundRectPath(ctx, w / 2 - 18 - step * 5, footY - 5, 11, 7, 3); ctx.fill();
    } else {
      roundRectPath(ctx, -w / 2 + 7, footY - 7, 11, 7, 3); ctx.fill();
      roundRectPath(ctx, w / 2 - 18, footY - 7, 11, 7, 3); ctx.fill();
    }

    // --- alone dinamico al cambio energia ---
    if (this.energyPulse > 0.02 && !reduced) {
      ctx.globalAlpha = this.energyPulse * 0.5;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      roundRectPath(ctx, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}
