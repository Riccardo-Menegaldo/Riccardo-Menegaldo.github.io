/* ============================================================
   NEON BLOCKS — salvataggi locali (localStorage)
   Ogni operazione è protetta: se localStorage non è disponibile
   (modalità privata, WebView restrictive) il gioco continua
   comunque a funzionare senza salvare.
   ============================================================ */

/* Chiave storica (inizializzava il vecchio "PLUTBOX"): mantenuta così
   i salvataggi esistenti (monete, skin, livelli) restano validi. */
const STORAGE_KEY = 'plutbox_save_v1';

const SaveManager = {
  available: true,
  data: null,

  /* Valori predefiniti */
  defaults() {
    return {
      record: 0,                 // record modalità infinita
      levels: [],                // livelli completati (dimensione allineata a LEVELS)
      coins: 0,                  // saldo monete (spendibili nel negozio)
      skins: ['neon'],           // skin sbloccate
      skin: 'neon',              // skin attiva
      audio: true,               // effetti sonori
      shake: true,               // scosse schermo
      reducedFx: false,          // effetti ridotti (accessibilità)
      lastLevel: 0,              // ultimo livello selezionato
    };
  },

  init() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      this.data = Object.assign(this.defaults(), parsed);
      // Sanificazione base
      if (!Array.isArray(this.data.levels)) this.data.levels = [];
      if (!Array.isArray(this.data.skins) || !this.data.skins.length) this.data.skins = ['neon'];
      if (!this.data.skins.includes('neon')) this.data.skins.push('neon');
      if (!SKINS.some(s => s.id === this.data.skin)) this.data.skin = 'neon';
    } catch (e) {
      this.available = false;
      this.data = this.defaults();
    }
    return this.data;
  },

  /* Allinea l'array "livelli completati" al numero corrente di livelli:
     i progressi vecchi restano, i nuovi livelli partono da non completati.
     Va chiamato dopo il caricamento di LEVELS (script caricati in ordine). */
  syncLevels() {
    if (!this.data) return;
    const known = typeof LEVELS !== 'undefined' && Array.isArray(LEVELS);
    const n = known ? LEVELS.length : this.data.levels.length;
    const old = this.data.levels;
    if (old.length === n) return;
    const out = [];
    for (let i = 0; i < n; i++) out.push(!!old[i]);
    this.data.levels = out;
    this.save();
  },

  /* Scrittura sicura: un errore disattiva il salvataggio ma non blocca */
  save() {
    if (!this.available || !this.data) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      this.available = false;
    }
  },

  set(key, value) {
    if (!this.data) return;
    this.data[key] = value;
    this.save();
  },

  /* Somma monete al saldo globale */
  addCoins(n) {
    if (!this.data) return;
    this.data.coins = Math.max(0, (this.data.coins | 0) + n);
    this.save();
  },

  /* Sblocco livello: sblocca anche il successivo */
  completeLevel(index) {
    if (!this.data) return;
    this.data.levels[index] = true;
    this.save();
  },

  isLevelUnlocked(index) {
    if (!this.data) return index === 0;
    if (index === 0) return true;
    return !!this.data.levels[index - 1];
  },

  /* Record della modalità infinita */
  submitRecord(score) {
    if (!this.data) return false;
    if (score > this.data.record) {
      this.data.record = score;
      this.save();
      return true;
    }
    return false;
  },
};

SaveManager.init();
