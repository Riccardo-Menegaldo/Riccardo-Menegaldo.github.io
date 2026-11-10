/* ============================================================
   NEON BLOCKS — interfaccia utente (DOM)
   Tutte le schermate sono elementi HTML sovrapposti al canvas.
   Ogni pulsante ha un'azione reale: nessun bottone decorativo.
   ============================================================ */

class UI {
  constructor(game) {
    this.game = game;
    this.touchWanted = false;
    this._hudCache = {};
    this.toastTimer = 0;
  }

  init() {
    this.$ = (id) => document.getElementById(id);
    this.screens = Array.from(document.querySelectorAll('.screen'));
    this.hud = this.$('hud');
    this.touch = this.$('touch-controls');
    this.toastEl = this.$('toast');

    this._bindButtons();
    this._detectTouch();

    this.buildLevels();
    this.buildShop();
    this.applySettingsToUI();
    this.refreshCoins();
  }

  /* ---------------- utilità ---------------- */
  show(id) {
    this.screens.forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
    this.screen = id;
  }

  hideScreens() {
    this.screens.forEach((s) => s.classList.remove('active'));
    this.screen = null;
  }

  setPlayingUI(on) {
    this.hud.classList.toggle('hidden', !on);
    if (this.touchWanted) this.touch.classList.toggle('hidden', !on);
    this.touch.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (!on) Input.resetHeld();
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1900);
  }

  refreshCoins() {
    const c = SaveManager.data.coins | 0;
    const el = this.$('menu-coins');
    const el2 = this.$('shop-coins');
    if (el) el.textContent = '◆ ' + c;
    if (el2) el2.textContent = '◆ ' + c + ' monete';
  }

  /* ---------------- HUD ---------------- */
  updateHud(s) {
    const cache = this._hudCache;
    if (cache.score !== s.score) {
      cache.score = s.score;
      this.$('hud-score').textContent = s.score;
    }
    if (cache.coins !== s.coins) {
      cache.coins = s.coins;
      this.$('hud-coins').textContent = s.coins;
    }
    if (cache.lives !== s.lives) {
      cache.lives = s.lives;
      let hearts = '';
      for (let i = 0; i < 3; i++) hearts += i < s.lives ? '♥' : '♡';
      this.$('hud-lives').textContent = hearts;
    }
    if (cache.energy !== s.energy) {
      cache.energy = s.energy;
      const meta = ENERGY_META[s.energy];
      const nameEl = this.$('energy-name');
      nameEl.textContent = meta.label;
      nameEl.style.color = meta.color;
      this.$('energy-indicator').style.setProperty('--e', meta.color);
      document.querySelectorAll('#energy-dots i').forEach((d) => {
        d.classList.toggle('active', d.dataset.e === s.energy);
        d.style.background = d.dataset.e === s.energy ? ENERGY_META[d.dataset.e].color : 'rgba(255,255,255,0.16)';
      });
    }
  }

  /* ---------------- costruzione schermate ---------------- */
  buildLevels() {
    const wrap = this.$('level-list');
    wrap.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const done = !!SaveManager.data.levels[i];
      const unlocked = SaveManager.isLevelUnlocked(i);
      const card = document.createElement('button');
      card.className = 'level-card' + (done ? ' done' : '') + (unlocked ? '' : ' locked');
      card.innerHTML = `
        <span class="lv-num">${unlocked ? (i + 1) : '&#128274;'}</span>
        <span class="lv-name">${lv.name}</span>
        <span class="lv-state">${done ? 'COMPLETATO' : (unlocked ? 'GIOCA' : 'BLOCCATO')}</span>
      `;
      card.addEventListener('click', () => {
        AudioFX.unlock();
        if (!unlocked) {
          AudioFX.play('error');
          this.toast('Completa il livello precedente per sbloccarlo');
          return;
        }
        AudioFX.play('click');
        this.game.startLevel(i);
      });
      wrap.appendChild(card);
    });
  }

  buildShop() {
    const wrap = this.$('shop-list');
    wrap.innerHTML = '';
    const owned = SaveManager.data.skins;
    const active = SaveManager.data.skin;

    SKINS.forEach((skin) => {
      const has = owned.includes(skin.id);
      const isActive = active === skin.id;
      const card = document.createElement('div');
      card.className = 'shop-card' + (isActive ? ' active' : '');
      card.innerHTML = `
        <span class="skin-preview" style="--c:${skin.color};--a:${skin.accent}"></span>
        <span class="skin-name">${skin.name}</span>
        <button class="btn btn-small ${isActive ? 'btn-selected' : (has ? '' : 'btn-primary')}">
          ${isActive ? 'ATTIVA' : (has ? 'SCEGLI' : '◆ ' + skin.price)}
        </button>
      `;
      const btn = card.querySelector('button');
      btn.addEventListener('click', () => {
        AudioFX.unlock();
        const data = SaveManager.data;
        if (isActive) return;
        if (has) {
          data.skin = skin.id;
          SaveManager.save();
          AudioFX.play('click');
        } else if (data.coins >= skin.price) {
          data.coins -= skin.price;
          data.skins.push(skin.id);
          data.skin = skin.id;
          SaveManager.save();
          AudioFX.play('buy');
          this.toast('Skin sbloccata: ' + skin.name);
        } else {
          AudioFX.play('error');
          this.toast('Monete insufficienti: servono ' + skin.price);
        }
        this.buildShop();
        this.refreshCoins();
      });
      wrap.appendChild(card);
    });
  }

  applySettingsToUI() {
    const d = SaveManager.data;
    this._setToggle(this.$('set-audio'), d.audio);
    this._setToggle(this.$('set-shake'), d.shake);
    this._setToggle(this.$('set-fx'), d.reducedFx);
  }

  _setToggle(el, on) {
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /* ---------------- binding pulsanti ---------------- */
  _bindButtons() {
    const on = (id, fn) => {
      const el = this.$(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        AudioFX.unlock();
        AudioFX.play('click');
        fn(e);
      });
    };

    /* splash */
    on('btn-start', () => this.game.toMenu());

    /* menu */
    on('btn-play', () => this.game.quickPlay());
    on('btn-levels', () => { this.buildLevels(); this.show('levels'); });
    on('btn-endless', () => this.game.startEndless());
    on('btn-shop', () => { this.buildShop(); this.refreshCoins(); this.show('shop'); });
    on('btn-settings', () => this.show('settings'));

    /* indietro */
    on('btn-levels-back', () => this.show('menu'));
    on('btn-shop-back', () => this.show('menu'));
    on('btn-settings-back', () => this.show('menu'));

    /* gioco */
    on('btn-pause', () => this.game.togglePause());
    on('btn-resume', () => this.game.togglePause());
    on('btn-restart', () => this.game.restartLevel());
    on('btn-pause-menu', () => this.game.toMenu());
    on('btn-next', () => this.game.nextLevel());
    on('btn-replay', () => this.game.restartLevel());
    on('btn-complete-menu', () => this.game.toMenu());
    on('btn-go-restart', () => this.game.restartLevel());
    on('btn-go-menu', () => this.game.toMenu());

    /* indicatore energia = pulsante SHIFT toccabile */
    this.$('energy-indicator').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      AudioFX.unlock();
      this.game.cycleEnergy();
    });

    /* impostazioni */
    on('set-audio', () => {
      const v = !SaveManager.data.audio;
      SaveManager.set('audio', v);
      AudioFX.setEnabled(v);
      this._setToggle(this.$('set-audio'), v);
      if (v) AudioFX.play('coin');
      this.toast(v ? 'Sonoro attivato' : 'Sonoro disattivato');
    });
    on('set-shake', () => {
      const v = !SaveManager.data.shake;
      SaveManager.set('shake', v);
      this._setToggle(this.$('set-shake'), v);
      this.toast(v ? 'Scosse attive' : 'Scosse disattive');
    });
    on('set-fx', () => {
      const v = !SaveManager.data.reducedFx;
      SaveManager.set('reducedFx', v);
      this._setToggle(this.$('set-fx'), v);
      this.toast(v ? 'Effetti ridotti' : 'Effetti completi');
    });
  }

  /* i controlli touch compaiono su dispositivi tattili (o al primo tocco) */
  _detectTouch() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    this.touchWanted = !!(coarse || hasTouch);
    if (this.touchWanted) this.touch.classList.remove('hidden');
    window.addEventListener('touchstart', () => {
      if (!this.touchWanted) {
        this.touchWanted = true;
        this.touch.classList.remove('hidden');
      }
    }, { once: true, passive: true });
  }

  /* ---------------- schermate di esito ---------------- */
  showComplete(data) {
    this.$('complete-title').textContent = data.title || 'LIVELLO COMPLETATO';
    this.$('complete-score').textContent = data.score;
    this.$('complete-coins').textContent = '◆ ' + data.coins;
    this.$('complete-bonus').textContent = '+' + data.bonus;
    this.$('btn-next').style.display = data.hasNext ? '' : 'none';
    this.show('complete');
  }

  showGameOver(data) {
    this.$('gameover-score').textContent = data.score;
    this.$('gameover-best').textContent = '◆ ' + data.best;
    this.$('gameover-coins').textContent = '◆ +' + data.coins;
    this.show('gameover');
  }

  showPause(info) {
    this.$('pause-info').textContent = info;
    this.show('pause');
  }
}
