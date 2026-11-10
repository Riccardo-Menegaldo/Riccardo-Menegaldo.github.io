/* ============================================================
   NEON BLOCKS — collisioni AABB
   Tutti gli oggetti del mondo usano rettangoli allineati agli assi
   {x, y, w, h} con y verso il basso.
   ============================================================ */

/* Sovrapposizione tra due rettangoli */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

/* Cerchio contro rettangolo (monete, sfere, portali) */
function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/* Centri */
function rectCenterX(r) { return r.x + r.w * 0.5; }
function rectCenterY(r) { return r.y + r.h * 0.5; }

/* Distanza tra due punti */
function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/* Espande un rettangolo di un margine (hitbox generose per il giocatore) */
function inflateRect(r, m) {
  return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
}
