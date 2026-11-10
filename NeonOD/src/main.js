/* ============================================================
   NEON BLOCKS — avvio applicazione
   Collega canvas, gioco, interfaccia e controlli e fa partire
   il ciclo di rendering con requestAnimationFrame + delta time.
   ============================================================ */

(function () {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game');

    /* istanziazione: Game → UI → Input (la UI ha bisogno del gioco,
       il gioco ha bisogno della UI per gli aggiornamenti HUD) */
    const game = new Game(canvas);
    const ui = new UI(game);
    game.ui = ui;

    /* allineamento array livelli salvati al numero di livelli presenti */
    SaveManager.syncLevels();

    ui.init();
    Input.init(game);

    /* impostazioni audio caricate dai salvataggi */
    AudioFX.setEnabled(!!SaveManager.data.audio);

    /* dimensioni iniziali + listener di ridimensionamento */
    game.resize();
    window.addEventListener('resize', () => game.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 150));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => game.resize());
    }

    /* la schermata splash avanza con un tocco/click ovunque */
    const splash = document.getElementById('screen-splash');
    splash.addEventListener('pointerdown', () => {
      AudioFX.unlock();
      game.toMenu();
    });

    /* animazione del logo (CSS + ritardo per lettera) */
    splash.querySelectorAll('.logo span').forEach((el, i) => {
      el.style.animationDelay = (i * 0.09) + 's';
    });

    /* ---------- ciclo principale ---------- */
    let last = performance.now();
    let errorStreak = 0;
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      /* delta limitato: niente "scatti" dopo una scheda in background */
      if (dt > 0.05) dt = 0.05;
      if (dt < 0) dt = 0;
      try {
        game.frame(dt);
        errorStreak = 0;
      } catch (err) {
        /* un errore non deve mandare in loop nero: lo si logga e
           si ferma il ciclo dopo troppi errori consecutivi */
        errorStreak++;
        console.error('[NEON BLOCKS] errore nel frame (' + errorStreak + '):', err);
        if (errorStreak > 15) {
          console.error('[NEON BLOCKS] troppi errori consecutivi: ciclo arrestato.');
          return;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /* esposto per debug da console */
    window.NEONBLOCKS = { game, ui, SaveManager, AudioFX };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
