/* ============ KREO — Theme + Motion (GSAP, Apple-like) ============ */
(function () {
  'use strict';

  /* ---------- Theme (light / dark) ---------- */
  const root = document.documentElement;
  const themeMeta = document.getElementById('themeColor');
  const syncMeta = (t) => {
    if (themeMeta) themeMeta.setAttribute('content', t === 'dark' ? '#000000' : '#ffffff');
  };
  syncMeta(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      syncMeta(next);
      try { localStorage.setItem('kreo-theme', next); } catch (e) {}
    });
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header ---------- */
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobileMenu');
  if (burger && menu) {
    burger.addEventListener('click', () => menu.classList.toggle('open'));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
  }

  if (reduce || typeof gsap === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Hero load: slow cinematic fade-up ---------- */
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.hero-eyebrow', { y: 22, opacity: 0, duration: 1 }, 0.15)
    .from('.hero-title .word i', { yPercent: 112, duration: 1.25, stagger: 0.085 }, 0.25)
    .from('.hero .lead', { y: 26, opacity: 0, duration: 1.05 }, 0.75)
    .from('.hero-cta > *', { y: 20, opacity: 0, duration: 0.9, stagger: 0.12 }, 0.95)
    .from('.hero-proof', { y: 14, opacity: 0, duration: 0.8 }, 1.15)
    .from('#mockup', { y: 80, opacity: 0, scale: 0.965, duration: 1.6, ease: 'power2.out' }, 0.85);

  /* ---------- Hero mockup: scroll-zoom settle ---------- */
  gsap.fromTo('.hero-visual', { scale: 1.045 }, {
    scale: 0.98, yPercent: -3, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.8 }
  });

  /* ---------- Scroll progress bar ---------- */
  gsap.to('.progress-bar', {
    scaleX: 1, ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 }
  });

  /* ---------- Statement: words lit by scroll ---------- */
  gsap.fromTo('.s-word', { opacity: 0.12 }, {
    opacity: 1, stagger: 0.12, ease: 'none',
    scrollTrigger: { trigger: '.statement', start: 'top 78%', end: 'bottom 55%', scrub: 0.5 }
  });

  /* ---------- Scroll reveals: gentle, slow ---------- */
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      opacity: 0, y: 34, duration: 1.15, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });
  gsap.utils.toArray('[data-reveal-group]').forEach((group) => {
    const items = group.querySelectorAll('[data-reveal-item]');
    if (!items.length) return;
    gsap.from(items, {
      opacity: 0, y: 38, duration: 1.05, stagger: 0.1, ease: 'power2.out',
      scrollTrigger: { trigger: group, start: 'top 85%' }
    });
  });

  /* ---------- Number counters ---------- */
  gsap.utils.toArray('.count').forEach((el) => {
    const end = parseFloat(el.dataset.count);
    if (Number.isNaN(end)) return;
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => {
        gsap.to(obj, {
          v: end, duration: 1.6, ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Number.isInteger(end) ? String(Math.round(obj.v)) : obj.v.toFixed(1).replace('.', ',');
          }
        });
      }
    });
  });

  /* ---------- Showcase tiles: image parallax ---------- */
  gsap.utils.toArray('.tile-imgwrap img').forEach((img) => {
    gsap.fromTo(img, { yPercent: -6 }, {
      yPercent: 6, ease: 'none',
      scrollTrigger: { trigger: img.closest('.tile'), start: 'top bottom', end: 'bottom top', scrub: 0.6 }
    });
  });

  /* ---------- Nav: highlight current section ---------- */
  document.querySelectorAll('section[id]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 45%', end: 'bottom 45%',
      onToggle: (self) => {
        const link = document.querySelector('.nav-links a[href="#' + sec.id + '"]');
        if (link) link.classList.toggle('active', self.isActive);
      }
    });
  });

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    if (!q || !a) return;
    gsap.set(a, { height: 0, opacity: 0 });

    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach((other) => {
        if (other === item) return;
        other.classList.remove('open');
        gsap.to(other.querySelector('.faq-a'), { height: 0, opacity: 0, duration: 0.4, ease: 'power2.inOut' });
      });

      if (isOpen) {
        item.classList.remove('open');
        gsap.to(a, { height: 0, opacity: 0, duration: 0.4, ease: 'power2.inOut' });
      } else {
        item.classList.add('open');
        gsap.to(a, { height: 'auto', opacity: 1, duration: 0.55, ease: 'power2.out' });
      }
    });
  });

  /* ---------- Scene life inside mockup (subtle) ---------- */
  gsap.to('.coin', { y: -6, duration: 1.3, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.25 });
  gsap.to('.hero-sprite', { y: -5, duration: 1.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
})();
