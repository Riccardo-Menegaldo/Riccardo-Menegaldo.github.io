/* ════════════════════════════════════════════════════════════════════
   PLUTONX v5 — "DEEP SPACE" ENGINE
   Core: costellazione canvas · split text · tilt 3D
   spotlight magnetico · cursore custom · accordion
   ════════════════════════════════════════════════════════════════════ */

'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ── THEME ────────────────────────────────────────────────────────── */
const theme = {
  init() {
    this.btns = $$('#theme-toggle, #theme-toggle-mobile');
    const saved = localStorage.getItem('px_theme');
    const initial = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    this.apply(initial, false);

    this.btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        this.apply(next);
      });
    });
  },

  apply(mode, persist = true) {
    document.documentElement.setAttribute('data-theme', mode);
    if (persist) localStorage.setItem('px_theme', mode);
    const icon = mode === 'light'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M21 13.2A8.6 8.6 0 1 1 10.8 3a6.9 6.9 0 0 0 10.2 10.2z"/></svg>';
    this.btns.forEach((btn) => {
      btn.innerHTML = icon;
      btn.setAttribute('aria-pressed', String(mode === 'light'));
    });
    document.dispatchEvent(new CustomEvent('px:theme', { detail: mode }));
  }
};

/* ── NAVIGATION ───────────────────────────────────────────────────── */
const navigation = {
  init() {
    this.nav = $('#nav');
    this.links = $('#nav-links');
    this.indicator = $('#nav-indicator');
    this.menuBtn = $('#menu-toggle');
    this.mobileNav = $('#mobile-nav');
    this.backdrop = $('#nav-backdrop');
    this.isOpen = false;

    this.markActive();
    this.menu();
    this.scrollState();
    this.indicatorMove();
    window.addEventListener('resize', () => {
      this.indicatorMove();
      this.closeOnDesktop();
    }, { passive: true });
  },

  markActive() {
    const path = (window.location.pathname.split('/').pop() || 'index.html').replace(/\/$/, '');
    $$('#nav-links a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const active = href === path || (href === 'index.html' && (path === '' || path === 'index.html'));
      a.classList.toggle('is-active', active);
    });
    $$('#mobile-nav a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      a.classList.toggle('is-active', href === path);
    });
    requestAnimationFrame(() => this.indicatorMove());
  },

  menu() {
    if (!this.menuBtn) return;

    this.setMenu = (open) => {
      this.isOpen = open;
      this.mobileNav?.classList.toggle('is-open', open);
      this.backdrop?.classList.toggle('is-open', open);
      this.menuBtn.classList.toggle('is-active', open);
      this.menuBtn.setAttribute('aria-expanded', String(open));
      this.menuBtn.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
      this.mobileNav?.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
    };

    this.menuBtn.addEventListener('click', () => this.setMenu(!this.isOpen));
    this.backdrop?.addEventListener('click', () => this.setMenu(false));
    this.mobileNav?.addEventListener('click', (e) => {
      if (e.target.closest('a')) this.setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.setMenu(false);
    });
  },

  closeOnDesktop() {
    if (window.innerWidth > 1024 && this.isOpen) this.setMenu(false);
  },

  scrollState() {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        this.nav?.classList.toggle('is-scrolled', window.scrollY > 40);
        this.indicatorMove();
        ticking = false;
      });
    }, { passive: true });
  },

  indicatorMove() {
    if (!this.links || !this.indicator) return;
    const active = this.links.querySelector('a.is-active');
    if (!active || !active.getClientRects().length) {
      this.indicator.classList.remove('is-active');
      return;
    }
    const lr = this.links.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    this.indicator.style.setProperty('--ind-w', ar.width + 'px');
    this.indicator.style.setProperty('--ind-x', (ar.left - lr.left) + 'px');
    this.indicator.classList.add('is-active');
  }
};

/* ── REVEAL + SPLIT TEXT ──────────────────────────────────────────── */
const reveal = {
  init() {
    this.splitAll();

    const targets = $$('.reveal, .reveal-left, .reveal-right, .reveal-scale, .split');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          this.observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    targets.forEach((el) => this.observer.observe(el));
  },

  splitAll() {
    $$('[data-split]').forEach((el) => {
      const frag = document.createDocumentFragment();
      let i = 0;

      const walk = (nodes, target) => {
        nodes.forEach((node) => {
          // testo → parole
          if (node.nodeType === Node.TEXT_NODE) {
            node.textContent.split(/(\s+)/).forEach((part) => {
              if (!part.trim()) {
                target.appendChild(document.createTextNode(part));
                return;
              }
              target.appendChild(this.word(part, i++));
            });
            return;
          }

          if (node.nodeType !== Node.ELEMENT_NODE) return;

          // <br> va mantenuto: non deve diventare una "parola" vuota
          if (node.tagName === 'BR') {
            target.appendChild(node.cloneNode(false));
            return;
          }

          // elementi inline (em, span.accent, strong…): restano un blocco unico
          // così il gradient/tecnica originale non viene spezzato
          const clone = node.cloneNode(false);
          if (node.querySelector('br')) {
            clone.appendChild(node.cloneNode(true));
          } else {
            clone.textContent = node.textContent;
          }

          const outer = document.createElement('span');
          outer.className = 'word';
          outer.style.setProperty('--i', i++);
          const inner = document.createElement('span');
          inner.className = 'word-inner';
          inner.appendChild(clone);
          outer.appendChild(inner);
          target.appendChild(outer);
        });
      };

      walk([...el.childNodes], frag);

      el.textContent = '';
      el.appendChild(frag);
      el.classList.add('split');
    });
  },

  word(text, index) {
    const outer = document.createElement('span');
    outer.className = 'word';
    outer.style.setProperty('--i', index);
    const inner = document.createElement('span');
    inner.className = 'word-inner';
    inner.textContent = text;
    outer.appendChild(inner);
    return outer;
  }
};

/* ── CUSTOM CURSOR ────────────────────────────────────────────────── */
const cursor = {
  init() {
    if (!finePointer || prefersReduced) return;
    this.dot = document.createElement('div');
    this.dot.className = 'cursor-dot';
    this.ring = document.createElement('div');
    this.ring.className = 'cursor-ring';
    document.body.append(this.dot, this.ring);

    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.rx = this.x;
    this.ry = this.y;

    document.addEventListener('mousemove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
      this.dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, { passive: true });

    const loop = () => {
      this.rx += (this.x - this.rx) * 0.16;
      this.ry += (this.y - this.ry) * 0.16;
      this.ring.style.transform = `translate(${this.rx}px, ${this.ry}px)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const hoverables = 'a, button, input, textarea, .glass-card, .btn, .marquee-item';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverables)) this.ring.classList.add('is-hover');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverables)) this.ring.classList.remove('is-hover');
    });
    document.addEventListener('mouseleave', () => this.ring.classList.add('is-hidden'));
    document.addEventListener('mouseenter', () => this.ring.classList.remove('is-hidden'));
  }
};

/* ── MAGNETIC BUTTONS ─────────────────────────────────────────────── */
const magnetic = {
  init() {
    if (!finePointer || prefersReduced) return;
    $$('.btn, .brand').forEach((el) => {
      const strength = el.classList.contains('brand') ? 0.15 : 0.28;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * strength}px, ${dy * strength * 0.7}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }
};

/* ── 3D TILT + SPOTLIGHT ──────────────────────────────────────────── */
const tilt = {
  init() {
    if (!finePointer || prefersReduced) return;
    $$('.glass-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', px * 100 + '%');
        card.style.setProperty('--my', py * 100 + '%');
        card.style.setProperty('--ry', (px - 0.5) * 7 + 'deg');
        card.style.setProperty('--rx', (0.5 - py) * 7 + 'deg');
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '50%');
      });
    });
  }
};

/* ── COUNT UP ─────────────────────────────────────────────────────── */
const countUp = {
  init() {
    const nums = $$('.stat-number');
    if (!nums.length) return;

    nums.forEach((el) => {
      const raw = el.textContent.trim();
      const target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      const suffix = raw.replace(/[0-9]/g, '');
      if (isNaN(target)) return;
      el.dataset.target = target;
      el.dataset.suffix = suffix;
      el.textContent = '0' + suffix;
    });

    if (!('IntersectionObserver' in window)) {
      nums.forEach((el) => (el.textContent = el.dataset.target + el.dataset.suffix));
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.animate(entry.target);
          this.observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    nums.forEach((el) => this.observer.observe(el));
  },

  animate(el) {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      const value = Math.round(eased * target);
      el.textContent = value.toLocaleString('it-IT') + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
};

/* ── FAQ ACCORDION ────────────────────────────────────────────────── */
const faq = {
  init() {
    $$('.faq-item').forEach((item) => {
      const btn = $('.faq-question', item);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const open = item.classList.contains('is-open');
        $$('.faq-item.is-open').forEach((other) => {
          other.classList.remove('is-open');
          $('.faq-question', other)?.setAttribute('aria-expanded', 'false');
        });
        if (!open) {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }
};

/* ── PROCESS LINE (scroll driven) ─────────────────────────────────── */
const processLine = {
  init() {
    this.sections = $$('.process');
    if (!this.sections.length) return;
    let ticking = false;
    const update = () => {
      this.sections.forEach((section) => {
        const track = $('.process-track span', section);
        if (!track) return;
        const r = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const total = r.height + vh * 0.4;
        const passed = vh * 0.6 - r.top;
        const pct = Math.max(0, Math.min(1, passed / total));
        track.parentElement.style.setProperty('--progress', (pct * 100).toFixed(2) + '%');
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }
};

/* ── CANVAS CONSTELLATION ─────────────────────────────────────────── */
const cosmos = {
  init() {
    this.canvas = $('#bg-canvas');
    if (!this.canvas || prefersReduced) return;
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.shooting = [];
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.scroll = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.light = document.documentElement.getAttribute('data-theme') === 'light';

    this.resize();
    this.seed();

    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.addEventListener('mousemove', (e) => {
      this.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
    window.addEventListener('scroll', () => {
      this.scroll = window.scrollY;
    }, { passive: true });
    document.addEventListener('px:theme', (e) => {
      this.light = e.detail === 'light';
    });

    this.loop();
  },

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seed();
  },

  seed() {
    const density = this.w < 700 ? 0.00009 : 0.00016;
    const count = Math.min(150, Math.round(this.w * this.h * density));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      z: Math.random() * 0.9 + 0.1,
      r: Math.random() * 1.3 + 0.35,
      tw: Math.random() * Math.PI * 2,
      hue: Math.random()
    }));
  },

  loop() {
    const ctx = this.ctx;
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.05;

    ctx.clearRect(0, 0, this.w, this.h);

    const ox = this.mouse.x * 26;
    const oy = this.mouse.y * 26 + this.scroll * 0.12;

    const palette = this.light
      ? ['rgba(8,145,178,.55)', 'rgba(109,40,217,.45)', 'rgba(219,39,119,.35)']
      : ['rgba(103,232,249,.75)', 'rgba(167,139,250,.65)', 'rgba(255,95,162,.45)'];

    this.stars.forEach((s) => {
      const px = s.x - ox * s.z;
      const py = s.y - oy * s.z - (this.scroll * 0.06 * s.z);
      const wrapX = ((px % this.w) + this.w) % this.w;
      const wrapY = ((py % this.h) + this.h) % this.h;

      s.tw += 0.02;
      const alpha = (0.35 + Math.sin(s.tw) * 0.35) * (0.4 + s.z * 0.6);

      ctx.beginPath();
      ctx.fillStyle = s.hue > 0.72 ? palette[2] : s.hue > 0.38 ? palette[1] : palette[0];
      ctx.globalAlpha = alpha * (this.light ? 0.6 : 1);
      ctx.arc(wrapX, wrapY, s.r * s.z * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // constellation links
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.6;
    const maxDist = this.w < 700 ? 90 : 132;
    for (let i = 0; i < this.stars.length; i++) {
      const a = this.stars[i];
      const ax = ((a.x - ox * a.z) % this.w + this.w) % this.w;
      const ay = ((a.y - oy * a.z) % this.h + this.h) % this.h;
      for (let j = i + 1; j < this.stars.length; j++) {
        const b = this.stars[j];
        const bx = ((b.x - ox * b.z) % this.w + this.w) % this.w;
        const by = ((b.y - oy * b.z) % this.h + this.h) % this.h;
        const dx = ax - bx;
        const dy = ay - by;
        const d = Math.hypot(dx, dy);
        if (d < maxDist) {
          ctx.strokeStyle = this.light ? 'rgba(109,40,217,.14)' : 'rgba(103,232,249,.13)';
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
    }

    // shooting stars
    if (Math.random() > 0.994 && this.shooting.length < 2) {
      this.shooting.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h * 0.6,
        vx: 4 + Math.random() * 4,
        vy: 1.6 + Math.random() * 2,
        life: 0,
        max: 70 + Math.random() * 50
      });
    }
    this.shooting = this.shooting.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      s.life++;
      const t = 1 - s.life / s.max;
      if (t <= 0) return false;
      const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
      grad.addColorStop(0, `rgba(255,255,255,${t * 0.9})`);
      grad.addColorStop(1, 'rgba(103,232,249,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
      ctx.stroke();
      return true;
    });

    requestAnimationFrame(() => this.loop());
  }
};

/* ── PARALLAX (hero) ──────────────────────────────────────────────── */
const parallax = {
  init() {
    if (!finePointer || prefersReduced) return;
    const planet = $('.planet');
    if (!planet) return;
    let ticking = false;
    window.addEventListener('mousemove', (e) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 16;
        const y = (e.clientY / window.innerHeight - 0.5) * 16;
        planet.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${-y}deg)`;
        ticking = false;
      });
    }, { passive: true });
  }
};

/* ── COOKIES ──────────────────────────────────────────────────────── */
const cookies = {
  init() {
    if (localStorage.getItem('px_cookies')) return;
    const el = document.createElement('div');
    el.className = 'cookie-banner';
    el.innerHTML = `
      <p>Usiamo i cookie per offrirti un'esperienza migliore e analizzare il traffico. Continuando a navigare accetti la nostra <a href="privacy.html" style="color:var(--aurora-1)">privacy policy</a>.</p>
      <button class="btn btn-primary btn-block" id="px-cookie-accept">Ho capito</button>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('is-visible'), 1600);
    $('#px-cookie-accept')?.addEventListener('click', () => {
      localStorage.setItem('px_cookies', '1');
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 600);
    });
  }
};

/* ── BOOT ─────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  theme.init();
  navigation.init();
  reveal.init();
  tilt.init();
  magnetic.init();
  countUp.init();
  faq.init();
  processLine.init();
  cosmos.init();
  parallax.init();
  cursor.init();
  cookies.init();
});
