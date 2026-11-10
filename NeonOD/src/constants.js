/* ============================================================
   NEON BLOCKS: NEON SHIFT — costanti e utilità condivise
   Nessuna dipendenza: tutto vive nello scope globale (script classici).
   ============================================================ */

/* ---------- Palette ufficiale ---------- */
const PALETTE = {
  purple: '#8D48FF',
  cyan:   '#35EAFF',
  pink:   '#FF42DC',
  gold:   '#FFD447',
  bg:     '#100A25',
  bgSoft: '#1A1140',
  white:  '#F4F0FF',
  danger: '#FF3B6B',
  wall:   '#191140',
};

/* ---------- Le tre energie della meccanica SHIFT ---------- */
const ENERGIES = ['cyber', 'plasma', 'nova'];

const ENERGY_META = {
  cyber:  { id: 'cyber',  label: 'CYBER',  color: '#35EAFF', dim: '#12707F' },
  plasma: { id: 'plasma', label: 'PLASMA', color: '#FF42DC', dim: '#7C2168' },
  nova:   { id: 'nova',   label: 'NOVA',   color: '#FFD447', dim: '#7A6018' },
};

/* ---------- Tarature del personaggio (unità: secondi / pixel) ---------- */
const TUNING = {
  gravity: 2100,        // gravità
  moveSpeed: 340,       // velocità orizzontale massima
  accel: 2700,          // accelerazione a terra
  airAccel: 1800,       // accelerazione in volo
  friction: 2600,       // attrito a terra
  jumpVelocity: 860,    // impulso di salto (~176 px di altezza)
  jumpCut: 0.5,         // taglio salto se si rilascia il pulsante
  coyoteTime: 0.10,     // tolleranza "esco dal bordo e salto"
  jumpBuffer: 0.12,     // buffer del comando di salto
  maxFall: 1200,        // velocità di caduta massima
  playerW: 42,
  playerH: 46,
};

/* ---------- Geometria di progettazione del mondo ---------- */
const DESIGN = {
  viewHeight: 760,   //altezza visibile minima in unità mondo
  minWidth: 620,     // larghezza visibile minima in unità mondo
  worldHeight: 900,  // altezza totale del mondo
  groundY: 700,      // superficie del terreno
};

/* ---------- Punteggi ---------- */
const SCORE = {
  coin: 10,
  orb: 15,
  barrier: 25,
  portal: 40,
  levelBonus: 100,   // moltiplicato per le vite rimaste
  coinBankBonus: 20, // monete bonus a livello completato
};

/* ---------- Skin cosmetiche (nessun pagamento reale) ---------- */
const SKINS = [
  { id: 'neon',   name: 'Neon Base',   price: 0,   color: '#8D48FF', accent: '#35EAFF' },
  { id: 'cyber',  name: 'Cyber Glow',  price: 60,  color: '#35EAFF', accent: '#FFFFFF' },
  { id: 'plasma', name: 'Plasma Rush', price: 120, color: '#FF42DC', accent: '#FFD447' },
  { id: 'nova',   name: 'Nova Gold',   price: 200, color: '#FFD447', accent: '#FF42DC' },
  { id: 'ghost',  name: 'Fantasma',    price: 350, color: '#EAF6FF', accent: '#8D48FF' },
  { id: 'void',   name: 'Vuoto',       price: 500, color: '#241A45', accent: '#35EAFF' },
];

/* ---------- Utilità numeriche / colori ---------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }
/* Interpolazione esponenziale "frame rate independent" */
function damp(current, target, rate, dt) { return lerp(current, target, 1 - Math.exp(-rate * dt)); }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
/* Miscela due colori esadecimali (t in [0,1]) */
function mixColor(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const r = Math.round(lerp(ca.r, cb.r, t));
  const g = Math.round(lerp(ca.g, cb.g, t));
  const bl = Math.round(lerp(ca.b, cb.b, t));
  return `rgb(${r},${g},${bl})`;
}

/* Path arrotondato compatibile con le versioni vecchie di Canvas */
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* Ritrova la skin attiva (se non sbloccata torna alla base) */
function getActiveSkin() {
  const id = (typeof SaveManager !== 'undefined' && SaveManager.data) ? SaveManager.data.skin : 'neon';
  return SKINS.find(s => s.id === id) || SKINS[0];
}
