// Inhalte (Termine, Neuigkeiten, Galerie) aus content/*.json laden und anzeigen.
// Alle Texte aus den Dateien werden über textContent eingefügt – nie als HTML.
(function () {
  'use strict';

  const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
                  'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul',
                        'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const DEFAULT_DURATION_H = 4; // Termin mit Beginn, aber ohne Ende
  const SITE_URL = 'https://halleinertv1866.at/';

  // ── Hilfsfunktionen ──

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function str(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  // "2026-11-17" → { y, m, d } oder null
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  // "15:00" → { h, min } oder null
  function parseTime(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(str(s));
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return { h: +m[1], min: +m[2] };
  }

  function formatDate(d) {
    return d.d + '. ' + MONTHS[d.m - 1] + ' ' + d.y;
  }

  function toLocal(d, t) {
    return new Date(d.y, d.m - 1, d.d, t ? t.h : 0, t ? t.min : 0);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  async function loadJSON(path, key) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ': ' + res.status);
    const data = await res.json();
    const list = data && data[key];
    return Array.isArray(list) ? list.filter(x => x && typeof x === 'object') : [];
  }

  function showMessage(container, text) {
    container.replaceChildren(el('p', 'feed-message', text));
  }

  // ── Einfache Formatierung für Textfelder ──
  // Leerzeile = neuer Absatz, **fett**, *kursiv*, [Text](https://…)

  function safeUrl(url) {
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
  }

  function appendInline(parent, text) {
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] != null) {
        parent.appendChild(el('strong', null, m[1]));
      } else if (m[2] != null) {
        parent.appendChild(el('em', null, m[2]));
      } else {
        const href = safeUrl(m[4]);
        if (href) {
          const a = el('a', null, m[3]);
          a.href = href;
          if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          parent.appendChild(a);
        } else {
          parent.appendChild(document.createTextNode(m[0]));
        }
      }
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderBody(text, className) {
    const frag = document.createDocumentFragment();
    str(text).split(/\n\s*\n/).forEach(par => {
      const p = el('p', className);
      par.split('\n').forEach((line, i) => {
        if (i) p.appendChild(document.createElement('br'));
        appendInline(p, line);
      });
      if (p.childNodes.length) frag.appendChild(p);
    });
    return frag;
  }

  // ── Kalenderdatei (.ics) ──

  const VTIMEZONE = [
    'BEGIN:VTIMEZONE', 'TZID:Europe/Vienna',
    'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'END:DAYLIGHT',
    'END:VTIMEZONE'
  ];

  // Formatierung für die Kalenderbeschreibung entfernen: **fett** → fett, [Text](url) → Text (url)
  function plainText(s) {
    return s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => safeUrl(u) ? t + ' (' + u + ')' : m)
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1');
  }

  function icsText(s) {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // Zeilen nach 75 Bytes umbrechen (RFC 5545), ohne UTF-8-Zeichen zu zerteilen
  function foldLine(line) {
    const enc = new TextEncoder();
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function icsDate(d) { return d.y + pad(d.m) + pad(d.d); }
  function icsLocal(date) {
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
           'T' + pad(date.getHours()) + pad(date.getMinutes()) + '00';
  }

  function slug(s) {
    return str(s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'termin';
  }

  function buildIcs(ev) {
    const now = new Date();
    const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
                  pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Halleiner Turnverein 1866//Website//DE',
                   'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (ev.start) lines.push(...VTIMEZONE);
    lines.push('BEGIN:VEVENT',
               'UID:' + slug(ev.title) + '-' + icsDate(ev.date) + '@halleinertv1866.at',
               'DTSTAMP:' + stamp);
    if (ev.start) {
      lines.push('DTSTART;TZID=Europe/Vienna:' + icsLocal(ev.start),
                 'DTEND;TZID=Europe/Vienna:' + icsLocal(ev.end));
    } else {
      const next = new Date(ev.date.y, ev.date.m - 1, ev.date.d + 1);
      lines.push('DTSTART;VALUE=DATE:' + icsDate(ev.date),
                 'DTEND;VALUE=DATE:' + icsDate({ y: next.getFullYear(), m: next.getMonth() + 1, d: next.getDate() }));
    }
    lines.push('SUMMARY:' + icsText(ev.title));
    if (ev.location) lines.push('LOCATION:' + icsText(ev.location));
    lines.push('DESCRIPTION:' + icsText((ev.description ? plainText(ev.description) + '\n\n' : '') + SITE_URL + '#events'),
               'URL:' + SITE_URL + '#events',
               'END:VEVENT', 'END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  function downloadIcs(ev) {
    const blob = new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slug(ev.title) + '-' + icsDate(ev.date) + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Termine ──

  function normalizeEvent(raw) {
    const title = str(raw.title);
    const date = parseDate(raw.date);
    if (!title || !date) return null;
    const startT = parseTime(raw.start_time);
    const endT = parseTime(raw.end_time);
    const start = startT ? toLocal(date, startT) : null;
    let end = null;
    if (start) {
      end = endT ? toLocal(date, endT) : null;
      if (!end || end <= start) end = new Date(start.getTime() + DEFAULT_DURATION_H * 3600e3);
    }
    // Ausblenden: nach der Endzeit, sonst am Ende des Tages
    const hideAfter = endT && start && toLocal(date, endT) > start
      ? toLocal(date, endT)
      : new Date(date.y, date.m - 1, date.d + 1);
    return {
      title, date, start, end, hideAfter,
      startT, endT: endT && start && toLocal(date, endT) > start ? endT : null,
      location: str(raw.location),
      category: str(raw.category),
      description: str(raw.description)
    };
  }

  function eventRow(ev) {
    const row = el('article', 'event-row');

    const dateBox = el('div', 'event-date');
    dateBox.append(el('div', 'dd', String(ev.date.d)), el('div', 'mm', MONTHS_SHORT[ev.date.m - 1]));
    row.appendChild(dateBox);

    const body = el('div', 'event-body');
    body.appendChild(el('h4', 'event-name', ev.title));
    let when = formatDate(ev.date);
    if (ev.startT) {
      when += ', ' + ev.startT.h + ':' + pad(ev.startT.min);
      when += ev.endT ? '–' + ev.endT.h + ':' + pad(ev.endT.min) + ' Uhr' : ' Uhr';
    }
    body.appendChild(el('div', 'event-time', when));
    if (ev.location) body.appendChild(el('div', 'event-place', ev.location));
    if (ev.description) body.appendChild(renderBody(ev.description, 'event-desc'));

    const btn = el('button', 'ics-link');
    btn.type = 'button';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/></svg>';
    btn.appendChild(document.createTextNode('Zum Kalender hinzufügen'));
    btn.addEventListener('click', () => downloadIcs(ev));
    body.appendChild(btn);
    row.appendChild(body);

    if (ev.category) row.appendChild(el('span', 'event-tag', ev.category));
    return row;
  }

  async function renderEvents() {
    const box = document.getElementById('eventList');
    if (!box) return;
    try {
      const now = new Date();
      const events = (await loadJSON('content/events.json', 'events'))
        .map(normalizeEvent)
        .filter(ev => ev && ev.hideAfter > now)
        .sort((a, b) => (a.start || toLocal(a.date)) - (b.start || toLocal(b.date)));
      if (!events.length) return showMessage(box, 'Derzeit sind keine Termine geplant.');
      box.replaceChildren(...events.map(eventRow));
    } catch (e) {
      showMessage(box, 'Die Termine konnten gerade nicht geladen werden. Bitte versuche es später noch einmal.');
    }
  }

  // ── Neuigkeiten ──

  function newsPost(post) {
    const art = el('article', 'news-post');
    const meta = el('div', 'news-post-meta');
    meta.append(el('span', 'news-tag post', 'Vereinsnews'), el('span', 'news-date', formatDate(post.date)));
    art.append(meta, el('h3', 'news-post-title', post.title));
    if (post.image) {
      const img = el('img', 'news-post-image');
      img.src = post.image;
      img.alt = '';
      img.loading = 'lazy';
      art.appendChild(img);
    }
    art.appendChild(renderBody(post.body, 'news-post-body'));
    return art;
  }

  async function renderNews() {
    const box = document.getElementById('newsList');
    if (!box) return;
    try {
      const posts = (await loadJSON('content/news.json', 'news'))
        .map(p => ({ title: str(p.title), date: parseDate(p.date), body: str(p.body), image: str(p.image) }))
        .filter(p => p.title && p.date)
        .sort((a, b) => toLocal(b.date) - toLocal(a.date));
      if (!posts.length) return showMessage(box, 'Derzeit gibt es keine Neuigkeiten.');
      box.replaceChildren(...posts.map(newsPost));
    } catch (e) {
      showMessage(box, 'Die Neuigkeiten konnten gerade nicht geladen werden. Bitte versuche es später noch einmal.');
    }
  }

  // ── Galerie / Carousel ──

  async function renderGallery() {
    const track = document.getElementById('carouselTrack');
    const message = document.getElementById('galleryMessage');
    const wrap = document.querySelector('.carousel-wrap');
    if (!track) return;

    function fail(text) {
      if (wrap) wrap.hidden = true;
      if (message) { message.textContent = text; message.hidden = false; }
    }

    let items;
    try {
      items = (await loadJSON('content/gallery.json', 'gallery'))
        .map(g => ({ image: str(g.image), caption: str(g.caption), alt: str(g.alt) }))
        .filter(g => g.image);
    } catch (e) {
      return fail('Die Bilder konnten gerade nicht geladen werden. Bitte versuche es später noch einmal.');
    }
    if (!items.length) return fail('Hier werden bald Bilder aus dem Vereinsleben zu sehen sein.');

    items.forEach((g, i) => {
      const slide = el('div', 'carousel-slide');
      slide.dataset.caption = g.caption;
      const img = el('img');
      img.src = g.image;
      img.alt = g.alt || g.caption;
      if (i) img.loading = 'lazy';
      // Hochformat-Bilder ungeschnitten zeigen
      const markPortrait = () => slide.classList.toggle('portrait', img.naturalHeight > img.naturalWidth);
      if (img.complete && img.naturalWidth) markPortrait(); else img.addEventListener('load', markPortrait);
      slide.appendChild(img);
      track.appendChild(slide);
    });

    initCarousel();
  }

  function initCarousel() {
    const track    = document.getElementById('carouselTrack');
    const slides   = track ? Array.from(track.children) : [];
    const dotsEl   = document.getElementById('carouselDots');
    const thumbsEl = document.getElementById('carouselThumbs');
    const caption  = document.getElementById('carouselCaption');
    if (!track || !slides.length) return;

    let current = 0;
    let autoTimer;

    slides.forEach((slide, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Bild ' + (i + 1));
      dot.addEventListener('click', () => goTo(i, true));
      dotsEl.appendChild(dot);

      const thumb = document.createElement('div');
      thumb.className = 'carousel-thumb' + (i === 0 ? ' active' : '');
      const img = slide.querySelector('img');
      if (img) {
        const t = document.createElement('img');
        t.src = img.src; t.alt = img.alt;
        t.loading = 'lazy';
        thumb.appendChild(t);
      } else {
        thumb.textContent = i + 1;
      }
      thumb.addEventListener('click', () => goTo(i, true));
      thumbsEl.appendChild(thumb);
    });

    // Nur bei Nutzer-Interaktion die Vorschauleiste scrollen – sonst springt die Seite
    function updateUI(scrollThumbs) {
      track.style.transform = 'translateX(-' + current * 100 + '%)';
      const cap = slides[current].dataset.caption || '';
      if (caption) caption.textContent = cap;
      dotsEl.querySelectorAll('.carousel-dot').forEach((d, i) =>
        d.classList.toggle('active', i === current));
      thumbsEl.querySelectorAll('.carousel-thumb').forEach((t, i) =>
        t.classList.toggle('active', i === current));
      const activeThumb = thumbsEl.children[current];
      if (activeThumb && scrollThumbs) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function goTo(n, userInitiated) {
      current = (n + slides.length) % slides.length;
      updateUI(userInitiated);
      resetAuto();
    }

    document.getElementById('carouselPrev').addEventListener('click', () => goTo(current - 1, true));
    document.getElementById('carouselNext').addEventListener('click', () => goTo(current + 1, true));

    let startX = 0;
    const carousel = document.getElementById('carousel');
    carousel.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    carousel.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1), true);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') goTo(current - 1, true);
      if (e.key === 'ArrowRight') goTo(current + 1, true);
    });

    function resetAuto() {
      clearInterval(autoTimer);
      autoTimer = setInterval(() => goTo(current + 1), 5000);
    }

    updateUI(false);
    resetAuto();
  }

  function init() {
    renderEvents();
    renderNews();
    renderGallery();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
