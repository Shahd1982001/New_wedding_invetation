/* ============================================================
   دعوة زفاف — السكربت
   يقرأ كل شيء من config.js ثم يملأ الصفحة ويشغّل التفاعلات.
   ============================================================ */
(function () {
  'use strict';

  const C = window.WEDDING || (typeof WEDDING !== 'undefined' ? WEDDING : null);
  if (!C) { console.warn('config.js غير محمّل'); return; }

  /* ---------- أدوات ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabicDigits = (v) => String(v).replace(/\d/g, (d) => AR_DIGITS[+d]);
  const pad2 = (n) => String(n).padStart(2, '0');

  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const parseDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  };

  const WED_DATE = parseDate(C.dateISO);

  /* ---------- ١. تعبئة الصفحة من الإعدادات ---------- */
  function applyConfig() {
    document.body.dataset.theme = C.theme || 'emerald';

    const set = (key, value) => {
      $$(`[data-bind="${key}"]`).forEach((el) => { el.textContent = value; });
    };
    const setHref = (key, value) => {
      $$(`[data-bind-href="${key}"]`).forEach((el) => { el.href = value; });
    };

    const d = WED_DATE;
    const dayNum = d ? toArabicDigits(d.getDate()) : '';
    const monthAr = d ? MONTHS_AR[d.getMonth()] : '';
    const yearAr = d ? toArabicDigits(d.getFullYear()) : '';
    const dayName = d ? DAYS_AR[d.getDay()] : '';
    // السطر المختصر بأرقام لاتينية (أوضح بصرياً مع تباعد الحروف)
    const dateShort = d
      ? `${pad2(d.getDate())} · ${pad2(d.getMonth() + 1)} · ${d.getFullYear()}`
      : '';
    const dateLong = d ? `${dayName} ${dayNum} ${monthAr} ${yearAr}م` : C.dateGregorian || '';

    document.title = `دعوة زفاف ${C.bride.ar} و${C.groom.ar}`;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', document.title);

    set('title', document.title);
    set('brideAr', C.bride.ar);
    set('groomAr', C.groom.ar);
    set('brideLatin', C.bride.latin);
    set('groomLatin', C.groom.latin);
    set('brideInitial', C.bride.initial);
    set('groomInitial', C.groom.initial);
    set('quoteText', C.quote.text);
    set('quoteSource', C.quote.source);
    set('timeAr', C.timeAr);
    set('hijriNote', C.hijriNote || '');
    set('rsvpDeadline', C.rsvpDeadline || '');
    set('venueName', C.venue.name);
    set('venueCity', C.venue.city);
    set('venueAddress', C.venue.address);
    set('dayNum', dayNum);
    set('monthAr', monthAr);
    set('dayName', dayName);
    set('yearAr', yearAr);
    set('dateShort', dateShort);
    set('dateLong', dateLong);

    setHref('mapUrl', C.venue.mapUrl || '#');
    setHref('phone', `tel:${C.phone || ''}`);

    // البرنامج الزمني
    const list = $('#timelineList');
    if (list && Array.isArray(C.timeline) && C.timeline.length) {
      list.innerHTML = C.timeline.map((item) => `
        <li class="tl-item">
          <span class="tl-dot"></span>
          <span class="tl-time">${item.time}</span>
          <span class="tl-body"><b>${item.label}</b><em>${item.note || ''}</em></span>
        </li>`).join('');
    }
  }

  /* ---------- ٢. العدّ التنازلي ---------- */
  function startCountdown() {
    const grid = $('#countdownGrid');
    const done = $('#countdownDone');
    if (!grid) return;

    if (!WED_DATE) { grid.hidden = true; return; }

    const cells = {
      d: $('[data-cd="d"]', grid),
      h: $('[data-cd="h"]', grid),
      m: $('[data-cd="m"]', grid),
      s: $('[data-cd="s"]', grid)
    };

    const tick = () => {
      const diff = WED_DATE.getTime() - Date.now();
      if (diff <= 0) {
        grid.hidden = true;
        if (done && C.showBlessingAfterWedding) done.hidden = false;
        clearInterval(timer);
        return;
      }
      const total = Math.floor(diff / 1000);
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const mins = Math.floor((total % 3600) / 60);
      const secs = total % 60;

      // أرقام عربية مع خانتين
      cells.d.textContent = toArabicDigits(String(days).padStart(days > 99 ? 3 : 2, '0'));
      cells.h.textContent = toArabicDigits(pad2(hours));
      cells.m.textContent = toArabicDigits(pad2(mins));
      cells.s.textContent = toArabicDigits(pad2(secs));
    };

    tick();
    const timer = setInterval(tick, 1000);
  }

  /* ---------- ٣. غبار ذهبي في شاشة الافتتاح ---------- */
  function dust() {
    const canvas = $('#dust');
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    let w, h, parts = [];
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    const make = () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.7 + .35,
      vy: -(Math.random() * .28 + .06),
      vx: (Math.random() - .5) * .18,
      a: Math.random() * .5 + .18,
      p: Math.random() * Math.PI * 2
    });

    let raf;
    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      parts.forEach((pt) => {
        pt.y += pt.vy;
        pt.x += pt.vx + Math.sin(pt.p += .01) * .14;
        if (pt.y < -8) { pt.y = h + 8; pt.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(227, 201, 138, ${pt.a})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(loop);
    };

    resize();
    parts = Array.from({ length: Math.round((w * h) / 14000) }, make);
    loop();

    window.addEventListener('resize', () => { resize(); }, { passive: true });

    // أوقف الرسم بعد فتح الدعوة لتوفير البطارية
    window.addEventListener('invite:opened', () => cancelAnimationFrame(raf), { once: true });
  }

  /* ---------- ٤. فتح الدعوة ---------- */
  function openInvite() {
    const intro = $('#intro');
    const main = $('#main');
    const btn = $('#openBtn');

    const reveal = () => {
      intro.classList.add('is-open');
      main.classList.add('is-shown');
      main.setAttribute('aria-hidden', 'false');
      document.body.classList.remove('is-locked');
      window.dispatchEvent(new Event('invite:opened'));
      setTimeout(() => { intro.style.display = 'none'; }, 1000);
    };

    document.body.classList.add('is-locked');
    if (btn) btn.addEventListener('click', reveal);
    // السماح بالدخول عبر لوحة المفاتيح أو الضغط على الختم أيضاً
    $$('.seal, .intro-date').forEach((el) => el.addEventListener('click', reveal));

    // إن كان الرابط يحتوي #hash مباشرة، افتح الدعوة تلقائياً
    if (location.hash && location.hash.length > 1) reveal();
  }

  /* ---------- ٥. ظهور العناصر عند التمرير ---------- */
  function scrollReveals() {
    const targets = $$('.section-wrap > *, .timeline, .date-card, .venue-map, .outro-inner > *');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('reveal', 'in'));
      return;
    }
    targets.forEach((t, i) => {
      t.classList.add('reveal');
      t.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: .16, rootMargin: '0px 0px -8% 0px' });

    targets.forEach((t) => io.observe(t));
  }

  /* ---------- ٦. زر الأعلى ---------- */
  function topButton() {
    const btn = $('#toTop');
    if (!btn) return;
    const onScroll = () => { btn.hidden = window.scrollY < 600; };
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    onScroll();
  }

  /* ---------- ٧. تأكيد الحضور عبر واتساب ---------- */
  function rsvp() {
    const form = $('#rsvpForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ($('#rsvpName').value || '').trim();
      const guests = $('#rsvpGuests').value;
      const attend = (form.querySelector('input[name="attend"]:checked') || {}).value || 'yes';
      const hint = $('#formHint');

      if (!name) {
        $('#rsvpName').focus();
        return;
      }

      const lines = attend === 'yes'
        ? [`السلام عليكم 🤍`, `أؤكد حضوري لحفل زفاف ${C.bride.ar} و${C.groom.ar}.`, `الاسم: ${name}`, `عدد الأشخاص: ${guests}`, `نتطلع للفرح معكم 🌿`]
        : [`السلام عليكم 🤍`, `أعتذر عن الحضور لحفل زفاف ${C.bride.ar} و${C.groom.ar}.`, `الاسم: ${name}`, `أتمنى لكم حياة سعيدة 🌿`];

      const text = encodeURIComponent(lines.join('\n'));
      const url = `https://wa.me/${(C.whatsapp || '').replace(/\D/g, '')}?text=${text}`;

      if (hint) hint.textContent = 'جارٍ فتح واتساب…';
      window.open(url, '_blank', 'noopener');
      setTimeout(() => { if (hint) hint.textContent = 'تم! شكراً لك 🤍'; }, 1200);
    });
  }

  /* ---------- ٨. موسيقى اختيارية ---------- */
  function music() {
    if (!C.music) return;
    const audio = new Audio(C.music);
    audio.loop = true;
    audio.volume = .35;

    const start = () => { audio.play().catch(() => {}); };
    window.addEventListener('invite:opened', start, { once: true });

    // زر كتم صغير
    const btn = document.createElement('button');
    btn.className = 'to-top';
    btn.style.bottom = 'calc(max(18px, env(safe-area-inset-bottom)) + 56px)';
    btn.setAttribute('aria-label', 'تشغيل/إيقاف الموسيقى');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="16.5" cy="16" r="2.5" fill="currentColor"/></svg>';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => { audio.paused ? audio.play().catch(() => {}) : audio.pause(); });
  }

  /* ---------- تشغيل ---------- */
  function init() {
    applyConfig();
    startCountdown();
    dust();
    openInvite();
    scrollReveals();
    topButton();
    rsvp();
    music();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
