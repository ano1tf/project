/* ============ KREO — Motion (GSAP) ============ */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header scroll state ---------- */
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
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

  /* ---------- Hero load timeline ---------- */
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.from('.badge', { y: 26, opacity: 0, duration: 0.7 }, 0.15)
    .from('.hero-title .word i', { yPercent: 118, duration: 1.05, stagger: 0.075 }, 0.2)
    .from('.hero-sub', { y: 28, opacity: 0, duration: 0.85 }, 0.55)
    .from('.hero-cta .btn', { y: 24, opacity: 0, duration: 0.75, stagger: 0.12 }, 0.7)
    .from('.hero-proof span', { y: 16, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.95)
    .from('#mockup', { y: 70, opacity: 0, scale: 0.92, duration: 1.25 }, 0.4)
    .from('.float-chip', { opacity: 0, scale: 0.55, duration: 0.65, stagger: 0.14, ease: 'back.out(1.8)' }, 1.15);

  /* ---------- Idle floats ---------- */
  gsap.to('#mockup', { y: -13, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.6 });
  gsap.utils.toArray('.float-chip').forEach((c, i) => {
    gsap.to(c, {
      y: i % 2 ? 15 : -15, x: i % 2 ? -9 : 9,
      duration: 2.7 + i * 0.4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.8
    });
  });
  gsap.utils.toArray('.orb').forEach((o, i) => {
    gsap.to(o, {
      x: (i + 1) * 46, y: i % 2 ? 66 : -54,
      duration: 10 + i * 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut'
    });
  });
  gsap.to('.final-orb', { scale: 1.14, duration: 5, repeat: -1, yoyo: true, ease: 'sine.inOut' });

  /* ---------- Hero mouse parallax ---------- */
  const hero = document.querySelector('.hero');
  const mock = document.getElementById('mockup');
  if (hero && mock) {
    const rxTo = gsap.quickTo(mock, 'rotationY', { duration: 0.7, ease: 'power3.out' });
    const ryTo = gsap.quickTo(mock, 'rotationX', { duration: 0.7, ease: 'power3.out' });
    gsap.set(mock, { transformPerspective: 1400 });
    hero.addEventListener('mousemove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      rxTo(nx * 7);
      ryTo(-ny * 7);
      gsap.to('.float-chip', { x: nx * -30, y: ny * -24, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
      gsap.to('.orb-v, .orb-c', { x: nx * 70, y: ny * 46, duration: 1.4, ease: 'power2.out', overwrite: 'auto' });
    });
    hero.addEventListener('mouseleave', () => {
      rxTo(0); ryTo(0);
      gsap.to('.float-chip', { x: 0, y: 0, duration: 1, ease: 'power2.out' });
    });
  }

  /* ---------- Scroll reveals ---------- */
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      opacity: 0, y: 38, duration: 0.95, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
  });
  gsap.utils.toArray('[data-reveal-group]').forEach((group) => {
    const items = group.querySelectorAll('[data-reveal-item]');
    if (!items.length) return;
    gsap.from(items, {
      opacity: 0, y: 44, duration: 0.85, stagger: 0.11, ease: 'power3.out',
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
          v: end, duration: 1.5, ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Number.isInteger(end) ? String(Math.round(obj.v)) : obj.v.toFixed(1).replace('.', ',');
          }
        });
      }
    });
  });

  /* ---------- Game card tilt ---------- */
  gsap.utils.toArray('.game-card').forEach((card) => {
    gsap.set(card, { transformPerspective: 900 });
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(card, { rotationY: px * 8, rotationX: -py * 8, duration: 0.45, ease: 'power2.out' });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { rotationY: 0, rotationX: 0, duration: 0.7, ease: 'elastic.out(1, 0.55)' });
    });
  });

  /* ---------- Magnetic buttons ---------- */
  gsap.utils.toArray('.magnetic').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      gsap.to(btn, {
        x: (e.clientX - r.left - r.width / 2) * 0.22,
        y: (e.clientY - r.top - r.height / 2) * 0.32,
        duration: 0.35, ease: 'power2.out'
      });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    });
  });

  /* ---------- FAQ accordion (GSAP height) ---------- */
  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    const icon = item.querySelector('.faq-icon');
    if (!q || !a) return;
    gsap.set(a, { height: 0, opacity: 0 }); // JS present → collapsed; without JS answers stay visible

    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach((other) => {
        if (other === item) return;
        other.classList.remove('open');
        const otherIcon = other.querySelector('.faq-icon');
        if (otherIcon) otherIcon.textContent = '+';
        gsap.to(other.querySelector('.faq-a'), { height: 0, opacity: 0, duration: 0.35, ease: 'power2.inOut' });
      });

      if (isOpen) {
        item.classList.remove('open');
        if (icon) icon.textContent = '+';
        gsap.to(a, { height: 0, opacity: 0, duration: 0.35, ease: 'power2.inOut' });
      } else {
        item.classList.add('open');
        if (icon) icon.textContent = '–';
        gsap.to(a, { height: 'auto', opacity: 1, duration: 0.5, ease: 'power2.out' });
      }
    });
  });

  /* ---------- Hero mockup subtle scene life ---------- */
  gsap.to('.coin', { y: -7, duration: 1.15, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.22 });
  gsap.to('.hero-sprite', { y: -6, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
})();
