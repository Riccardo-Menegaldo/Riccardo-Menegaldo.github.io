/* ============================================================
   NEON BLOCKS — controlli (tastiera + Pointer Events)
   - Input.left / right / jump è lo stato "tenuto premuto"
   - jumpPressed / shiftPressed sono impulsi di un solo frame
   - i pulsanti touch usano Pointer Events: supportano mouse,
     touchscreen, pen e multi-touch (ogni pulsante cattura il
     proprio puntatore).
   Tastiera e touch hanno stati separati uniti a lettura, così
   non si interferiscono a vicenda.
   ============================================================ */

const Input = {
  /* stati uniti (letti dal gioco) */
  left: false,
  right: false,
  jump: false,
  /* impulsi di un frame */
  jumpPressed: false,
  shiftPressed: false,
  anyKeyPressed: false,

  /* stati grezzi */
  _kb: { left: false, right: false, jump: false },
  _touch: { left: false, right: false, jump: false },

  init(game) {
    this.game = game;
    this._bindKeyboard();
    this._bindTouchButtons();
  },

  /* ---------------- TASTIERA ---------------- */
  _bindKeyboard() {
    const isGameKey = (code) =>
      code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' ||
      code === 'ArrowDown' || code === 'Space' ||
      code === 'KeyA' || code === 'KeyD' || code === 'KeyW' ||
      code === 'KeyE' || code === 'ShiftLeft' || code === 'ShiftRight';

    window.addEventListener('keydown', (e) => {
      if (isGameKey(e.code)) e.preventDefault(); // niente scroll della pagina
      if (e.repeat) return;

      this.anyKeyPressed = true;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this._kb.left = true; this._sync(); break;
        case 'ArrowRight': case 'KeyD': this._kb.right = true; this._sync(); break;
        case 'Space': case 'ArrowUp': case 'KeyW':
          this._kb.jump = true; this._sync();
          this.jumpPressed = true;
          break;
        case 'KeyE': case 'ShiftLeft': case 'ShiftRight':
          this.shiftPressed = true;
          break;
        case 'Escape':
          if (this.game) this.game.togglePause();
          break;
        case 'Enter':
          if (this.game && this.game.onConfirm) this.game.onConfirm();
          break;
      }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this._kb.left = false; this._sync(); break;
        case 'ArrowRight': case 'KeyD': this._kb.right = false; this._sync(); break;
        case 'Space': case 'ArrowUp': case 'KeyW': this._kb.jump = false; this._sync(); break;
      }
    });

    // se la finestra perde il focus i tasti resterebbero premuti
    window.addEventListener('blur', () => this.resetHeld());
  },

  /* ---------------- PULSANTI TOUCH / MOUSE ---------------- */
  _bindTouchButtons() {
    const buttons = document.querySelectorAll('#touch-controls [data-input]');
    buttons.forEach((btn) => {
      const key = btn.dataset.input;

      const press = (e) => {
        e.preventDefault();
        AudioFX.unlock();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* compat */ }
        btn.classList.add('pressed');
        if (key === 'shift') {
          this.shiftPressed = true;
        } else {
          this._touch[key] = true;
          this._sync();
          if (key === 'jump') this.jumpPressed = true;
        }
      };

      const release = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('pressed');
        if (key !== 'shift') {
          this._touch[key] = false;
          this._sync();
        }
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // un tocco ovunque "sblocca" l'audio (regola autoplay dei browser)
    window.addEventListener('pointerdown', () => AudioFX.unlock());
  },

  _sync() {
    this.left = this._kb.left || this._touch.left;
    this.right = this._kb.right || this._touch.right;
    this.jump = this._kb.jump || this._touch.jump;
  },

  resetHeld() {
    this._kb.left = this._kb.right = this._kb.jump = false;
    this._touch.left = this._touch.right = this._touch.jump = false;
    this._sync();
    document.querySelectorAll('#touch-controls .tc-btn.pressed')
      .forEach((b) => b.classList.remove('pressed'));
  },

  /* A fine frame si azzera ciò che dura un solo frame */
  endFrame() {
    this.jumpPressed = false;
    this.shiftPressed = false;
    this.anyKeyPressed = false;
  },
};
