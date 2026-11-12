/** Page behaviour: reveals, the header, the motion switch, the strength control. */

const root = document.documentElement;

// --- Ready: fonts are in, the hero may start its entrance. -----------------
function ready(): void {
  if (root.classList.contains('is-ready')) return;
  root.classList.add('is-ready');
  document.dispatchEvent(new CustomEvent('site:ready'));
}
const fontsReady = document.fonts?.ready ?? Promise.resolve();
void Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 1500))]).then(ready);

// --- Reveal on entering the viewport. ---------------------------------------
const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  // The first screen arrives as a whole; everything below waits to be scrolled to.
  targets.forEach((target) => {
    if (target.closest('[data-hero]')) target.classList.add('is-in');
    else observer.observe(target);
  });
} else {
  targets.forEach((target) => target.classList.add('is-in'));
}
(window as unknown as { __revealReady?: boolean }).__revealReady = true;

// --- Header: part of the poster at the top, a floating bar on the way back up.
const header = document.querySelector<HTMLElement>('[data-header]');
const hero = document.querySelector<HTMLElement>('[data-hero]');
if (header) {
  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const threshold = (hero?.offsetHeight ?? 600) * 0.9;
    const fadeEnd = window.innerHeight * 0.3;
    const pinned = header.classList.contains('is-pinned');
    if (y < fadeEnd) {
      // With the poster: visible, fading as the page starts to move.
      header.classList.remove('is-pinned', 'is-shown');
      header.style.setProperty('--header-fade', String(Math.max(0, 1 - y / fadeEnd)));
      header.style.pointerEvents = '';
    } else if (y > threshold) {
      if (!pinned) {
        header.classList.add('is-pinned');
        void header.offsetHeight; // start hidden, then slide
      }
      header.style.pointerEvents = '';
      if (y < lastY - 2) header.classList.add('is-shown');
      else if (y > lastY + 2) header.classList.remove('is-shown');
    } else {
      header.classList.remove('is-shown');
      if (!pinned) {
        header.style.setProperty('--header-fade', '0');
        header.style.pointerEvents = 'none';
      }
    }
    lastY = y;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  header.addEventListener('focusin', () => {
    if (header.classList.contains('is-pinned')) header.classList.add('is-shown');
    else header.style.setProperty('--header-fade', '1');
  });
  update();
}

// --- Figures count up once the poster has arrived. ----------------------------
if (root.dataset.motion === 'full') {
  const figures = document.querySelectorAll<HTMLElement>('[data-count]');
  const run = () =>
    figures.forEach((figure, index) => {
      const target = Number(figure.dataset.count);
      if (!Number.isFinite(target)) return;
      const startAt = performance.now() + 820 + index * 90;
      const duration = 1100;
      figure.textContent = '0';
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - startAt) / duration));
        figure.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  if (root.classList.contains('is-ready')) run();
  else document.addEventListener('site:ready', run, { once: true });
}

// --- Motion switch. -----------------------------------------------------------
const switches = document.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]');
const paint = () => {
  const reduced = root.dataset.motion !== 'full';
  switches.forEach((button) => {
    button.setAttribute('aria-pressed', String(reduced));
    const label = button.querySelector('[data-motion-label]');
    if (label) label.textContent = reduced ? 'Bewegung einschalten' : 'Bewegung reduzieren';
  });
};
switches.forEach((button) =>
  button.addEventListener('click', () => {
    const next = root.dataset.motion === 'full' ? 'reduced' : 'full';
    root.dataset.motion = next;
    try {
      localStorage.setItem('motion', next);
    } catch {
      /* private mode */
    }
    paint();
    document.dispatchEvent(new CustomEvent('motionchange'));
  }),
);
paint();

// --- The poster's photograph leans towards the pointer. ------------------------
if (hero) {
  hero.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch' || root.dataset.motion !== 'full') return;
      const bounds = hero.getBoundingClientRect();
      hero.style.setProperty('--px', ((event.clientX - bounds.left) / bounds.width - 0.5).toFixed(3));
      hero.style.setProperty('--py', ((event.clientY - bounds.top) / bounds.height - 0.5).toFixed(3));
    },
    { passive: true },
  );
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--px', '0');
    hero.style.setProperty('--py', '0');
  });
}
