// Serves the public booking page UI
// GET /book/:username/:event_slug

export default async function bookingPageRoutes(fastify) {
  fastify.get('/book/:username/:event_slug', async (req, reply) => {
    const { username, event_slug } = req.params;
    const { reschedule, name, email, tz } = req.query;
    const html = buildPage(username, event_slug, { reschedule, name, email, tz });
    reply.type('text/html').send(html);
  });
}

function buildPage(username, eventSlug, { reschedule, name, email, tz } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Book a Meeting</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #111112;
  --card: #1a1a1f;
  --surface: #222228;
  --surface2: #2a2a32;
  --border: rgba(255,255,255,0.07);
  --border2: rgba(255,255,255,0.12);
  --accent: #DFFF00;
  --accent-fg: #0d0d0d;
  --accent-dim: rgba(223,255,0,0.10);
  --text: #f0f0f2;
  --text2: #8888a0;
  --muted: #4a4a5e;
  --day-avail: #2a2a32;
  --day-avail-hover: #35353f;
  --error: #ff5f5f;
  --font-sans: 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'Fira Code', monospace;
  --r: 12px;
  --r-day: 10px;
}
[data-lights="on"] {
  --bg: #eeecea;
  --card: #f8f7f4;
  --surface: #eeede9;
  --surface2: #e4e3de;
  --border: rgba(0,0,0,0.07);
  --border2: rgba(0,0,0,0.13);
  --accent: #3a4500;
  --accent-fg: #f8f7f4;
  --accent-dim: rgba(58,69,0,0.09);
  --text: #111110;
  --text2: #55554a;
  --muted: #99997a;
  --day-avail: #e4e3de;
  --day-avail-hover: #d8d7d0;
  --error: #c0392b;
}

html, body {
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
}

/* ── PAGE SHELL ── */
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

/* ── CARD ── */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 18px;
  width: 100%;
  max-width: 920px;
  overflow: hidden;
  box-shadow: 0 8px 48px rgba(0,0,0,0.35);
  display: flex;
  flex-direction: column;
}

/* ── MAIN AREA (info + picker) ── */
.card-body {
  display: flex;
  min-height: 480px;
}

/* ── INFO PANEL ── */
.info-panel {
  width: 240px;
  flex-shrink: 0;
  padding: 32px 28px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0;
}
.info-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: var(--surface2);
  border: 1px solid var(--border2);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.info-name {
  font-size: 13px;
  color: var(--text2);
  margin-bottom: 4px;
  font-weight: 500;
}
.info-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
  margin-bottom: 16px;
}
.info-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--text2);
}
.meta-icon {
  font-size: 14px;
  flex-shrink: 0;
  opacity: 0.7;
}
.info-desc {
  font-size: 12px;
  color: var(--text2);
  line-height: 1.65;
  border-top: 1px solid var(--border);
  padding-top: 14px;
  margin-top: 4px;
}
.reschedule-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-family: var(--font-mono);
  color: var(--accent); background: var(--accent-dim);
  border: 1px solid var(--accent); border-radius: 20px;
  padding: 3px 9px; margin-top: 12px;
}
.info-spacer { flex: 1; }
.info-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.lights-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  border: 1px solid var(--border2); background: transparent;
  color: var(--text2); font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.07em;
  cursor: pointer; transition: all .18s;
}
.lights-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── PICKER AREA ── */
.picker-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ── CALENDAR PANEL ── */
.cal-panel {
  flex: 1;
  padding: 32px 28px;
  min-width: 0;
}
.cal-heading {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--muted); letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 20px;
}
.cal-nav {
  display: flex; align-items: center;
  justify-content: space-between; margin-bottom: 20px;
}
.cal-nav-btn {
  background: none; border: 1px solid var(--border2);
  color: var(--text); width: 34px; height: 34px;
  border-radius: 8px; cursor: pointer; font-size: 17px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.cal-nav-btn:hover { border-color: var(--accent); color: var(--accent); }
.cal-month { font-weight: 700; font-size: 17px; }
.cal-month span { color: var(--text2); font-weight: 400; margin-left: 6px; }
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}
.cal-dow {
  font-size: 11px; color: var(--text2);
  text-align: center; padding: 0 0 8px;
  font-family: var(--font-sans); font-weight: 500;
}
.cal-day {
  aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 500;
  border-radius: var(--r-day);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, transform 0.1s;
  border: none; background: transparent;
  position: relative; color: var(--text2);
  user-select: none;
}
.cal-day.empty { cursor: default; }
.cal-day.disabled { color: var(--muted); opacity: 0.35; cursor: default; }
.cal-day.today { color: var(--text); font-weight: 700; }
.cal-day.today::after {
  content: '';
  position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%);
  width: 3px; height: 3px; border-radius: 50%; background: var(--accent);
}
.cal-day.has-slots {
  background: var(--day-avail);
  color: var(--text);
}
.cal-day.has-slots:hover:not(.selected):not(.disabled) {
  background: var(--day-avail-hover);
  transform: scale(1.08);
}
.cal-day.selected {
  background: var(--accent) !important;
  color: var(--accent-fg) !important;
  font-weight: 700;
  transform: scale(1.08);
}
.cal-day.selected::after { display: none; }

/* ── TZ ROW ── */
.tz-row {
  margin-top: 20px;
  display: flex; align-items: center; gap: 8px;
}
.tz-globe { font-size: 14px; color: var(--text2); flex-shrink: 0; }
.tz-select {
  background: transparent;
  border: none; color: var(--text2);
  font-family: var(--font-sans); font-size: 13px;
  cursor: pointer; padding: 0; flex: 1;
  appearance: none; -webkit-appearance: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 220px;
}
.tz-select:focus { outline: none; }
.tz-chevron { font-size: 10px; color: var(--text2); }

/* ── SLOTS PANEL ── */
.slots-panel {
  width: 0;
  overflow: hidden;
  border-left: 1px solid transparent;
  transition: width 0.32s cubic-bezier(0.4,0,0.2,1),
              border-color 0.32s,
              opacity 0.25s;
  opacity: 0;
  flex-shrink: 0;
  position: relative;
}
.slots-panel.open {
  width: 240px;
  border-left-color: var(--border);
  opacity: 1;
}
.slots-inner {
  width: 240px;
  padding: 32px 20px;
  height: 100%;
  overflow-y: auto;
  display: flex; flex-direction: column;
}
.slots-date-label {
  font-size: 14px; font-weight: 700; margin-bottom: 4px;
}
.slots-count {
  font-size: 11px; color: var(--text2);
  font-family: var(--font-mono); margin-bottom: 18px;
}
.slots-list {
  display: flex; flex-direction: column; gap: 8px;
}
.slot-btn {
  background: var(--surface);
  border: 1px solid var(--border2);
  color: var(--text);
  padding: 12px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 14px; font-weight: 600;
  transition: all 0.15s;
  text-align: center;
  white-space: nowrap;
  animation: slotIn 0.25s ease both;
}
.slot-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
  transform: translateX(3px);
}
@keyframes slotIn {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}
.slots-empty, .slots-loading {
  font-size: 12px; color: var(--text2);
  font-family: var(--font-mono); padding: 8px 0;
}
.slots-inner::-webkit-scrollbar { width: 3px; }
.slots-inner::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 2px; }

/* ── FORM PANE ── */
.form-pane {
  padding: 32px 36px;
  border-top: 1px solid var(--border);
}
.form-back {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; color: var(--text2);
  font-family: var(--font-sans); font-size: 13px;
  cursor: pointer; padding: 0; margin-bottom: 24px;
  transition: color 0.15s;
}
.form-back:hover { color: var(--accent); }
.selected-slot-card {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--r); padding: 14px 18px;
  margin-bottom: 28px;
  display: flex; gap: 14px; align-items: center;
}
.selected-slot-time { font-size: 17px; font-weight: 700; }
.selected-slot-meta { font-size: 12px; color: var(--text2); margin-top: 2px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.field { margin-bottom: 16px; }
.field-lbl {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--text2); text-transform: uppercase;
  letter-spacing: 0.08em; margin-bottom: 6px;
}
.field input, .field textarea, .field select {
  background: var(--surface);
  border: 1px solid var(--border2);
  color: var(--text); padding: 11px 14px;
  border-radius: 10px; font-family: var(--font-sans);
  font-size: 14px; width: 100%;
  transition: border-color 0.15s;
}
.field input:focus, .field textarea:focus, .field select:focus {
  outline: none; border-color: var(--accent);
}
.field textarea { resize: vertical; min-height: 88px; }
.btn-confirm {
  background: var(--accent); color: var(--accent-fg);
  border: none; padding: 14px 28px;
  border-radius: var(--r); font-weight: 700;
  font-size: 15px; cursor: pointer; width: 100%;
  margin-top: 6px; font-family: var(--font-sans);
  transition: opacity 0.15s, transform 0.1s;
  letter-spacing: 0.01em;
}
.btn-confirm:hover:not(:disabled) { opacity: 0.88; }
.btn-confirm:active:not(:disabled) { transform: scale(0.99); }
.btn-confirm:disabled { opacity: 0.35; cursor: default; }
.error-msg {
  background: rgba(255,95,95,0.08); border: 1px solid var(--error);
  color: var(--error); padding: 10px 14px;
  border-radius: 8px; font-size: 13px; margin-bottom: 16px;
}

/* ── CONFIRMATION ── */
.confirm-pane {
  padding: 48px 36px;
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 0;
}
.confirm-check {
  width: 54px; height: 54px; border-radius: 50%;
  background: var(--accent); color: var(--accent-fg);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700; margin-bottom: 18px;
}
.confirm-headline { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
.confirm-sub { font-size: 14px; color: var(--text2); margin-bottom: 24px; }
.confirm-detail {
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: var(--r); overflow: hidden; width: 100%; max-width: 480px;
  margin-bottom: 16px;
}
.confirm-row {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 13px 16px; border-bottom: 1px solid var(--border);
}
.confirm-row:last-child { border-bottom: none; }
.confirm-row-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.confirm-row-lbl { font-size: 10px; color: var(--text2); font-family: var(--font-mono); margin-bottom: 1px; }
.confirm-row-val { font-size: 13px; font-weight: 600; }
.confirm-uid { font-size: 11px; font-family: var(--font-mono); color: var(--muted); margin-top: 4px; }
.btn-cancel-bkg {
  background: none; border: none; color: var(--muted);
  font-size: 12px; font-family: var(--font-sans);
  cursor: pointer; text-decoration: underline; margin-top: 14px;
  transition: color 0.15s;
}
.btn-cancel-bkg:hover { color: var(--error); }

/* ── CARD FOOTER ── */
.card-footer {
  padding: 10px 24px;
  border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.brand-link {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--muted); text-decoration: none;
  display: flex; align-items: center; gap: 6px;
}
.brand-link:hover { color: var(--text2); }

/* ── RESPONSIVE ── */
@media (max-width: 720px) {
  .page { padding: 0; justify-content: flex-start; }
  .card { max-width: 100%; border-radius: 0; border-left: none; border-right: none; box-shadow: none; min-height: 100vh; }
  .card-body { flex-direction: column; }
  .info-panel {
    width: 100%; border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 24px 20px 20px; flex-direction: row; flex-wrap: wrap;
    align-items: flex-start; gap: 0;
  }
  .info-avatar { display: none; }
  .info-name { width: 100%; margin-bottom: 2px; }
  .info-title { width: 100%; font-size: 18px; margin-bottom: 10px; }
  .info-meta { flex-direction: row; flex-wrap: wrap; gap: 10px 16px; }
  .info-desc { width: 100%; }
  .info-spacer { display: none; }
  .info-footer { display: none; }
  .reschedule-badge { width: 100%; }
  .picker-area { flex-direction: column; }
  .cal-panel { padding: 20px 16px; }
  .slots-panel {
    width: 100% !important;
    border-left: none !important;
    border-top: 1px solid var(--border);
    opacity: 1 !important;
    height: auto;
  }
  .slots-panel:not(.open) { display: none; }
  .slots-inner { width: 100%; padding: 16px; }
  .slots-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .slot-btn { animation: none; }
  .form-pane { padding: 20px 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .confirm-pane { padding: 24px 16px; }
  .confirm-detail { max-width: 100%; }
  /* Mobile lights btn — show in footer only */
  .mobile-lights { display: flex; }
}
@media (min-width: 721px) {
  .mobile-lights { display: none; }
}

#lightsFlicker { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
</style>
</head>
<body>
<div id="lightsFlicker" style="background:rgba(255,255,230,0)"></div>
<div class="page">
  <div class="card" id="card">

    <!-- MAIN BODY -->
    <div class="card-body" id="card-body">

      <!-- INFO PANEL -->
      <div class="info-panel">
        <div class="info-avatar" id="info-avatar">📅</div>
        <div class="info-name" id="info-name">Loading...</div>
        <div class="info-title" id="info-title"></div>
        <div class="info-meta" id="info-meta"></div>
        <div class="info-desc" id="info-desc" style="display:none"></div>
        <div id="reschedule-badge" style="display:none"><div class="reschedule-badge">🔄 Rescheduling</div></div>
        <div class="info-spacer"></div>
        <div class="info-footer">
          <button class="lights-btn" id="lightsBtn">
            <span>🔦</span><span id="lightsBtnLabel">LIGHTS ON</span>
          </button>
        </div>
      </div>

      <!-- PICKER: calendar + sliding slots -->
      <div class="picker-area" id="picker-area">

        <!-- CALENDAR -->
        <div class="cal-panel">
          <div class="cal-heading">Select a date</div>
          <div class="cal-nav">
            <button class="cal-nav-btn" id="prev-month">&#8249;</button>
            <div class="cal-month" id="cal-month-label"></div>
            <button class="cal-nav-btn" id="next-month">&#8250;</button>
          </div>
          <div class="cal-grid" id="cal-grid"></div>
          <div class="tz-row">
            <span class="tz-globe">🌍</span>
            <select class="tz-select" id="tz-select"></select>
            <span class="tz-chevron">▾</span>
          </div>
        </div>

        <!-- SLOTS (slides in) -->
        <div class="slots-panel" id="slots-panel">
          <div class="slots-inner">
            <div class="slots-date-label" id="slots-date-label"></div>
            <div class="slots-count" id="slots-count"></div>
            <div class="slots-list" id="slots-list"></div>
          </div>
        </div>

      </div>
    </div>

    <!-- FORM PANE (hidden until slot selected) -->
    <div id="form-pane" class="form-pane" style="display:none">
      <button class="form-back" id="btn-back">← Back</button>
      <div class="selected-slot-card">
        <span style="font-size:22px">🕐</span>
        <div>
          <div class="selected-slot-time" id="selected-slot-time"></div>
          <div class="selected-slot-meta" id="selected-slot-meta"></div>
        </div>
      </div>
      <div id="form-error" class="error-msg" style="display:none"></div>
      <div class="form-grid">
        <div class="field">
          <div class="field-lbl">Full Name *</div>
          <input type="text" id="f-name" placeholder="Jane Smith" autocomplete="name">
        </div>
        <div class="field">
          <div class="field-lbl">Email *</div>
          <input type="email" id="f-email" placeholder="jane@example.com" autocomplete="email">
        </div>
      </div>
      <div id="custom-fields-container"></div>
      <div class="field">
        <div class="field-lbl">Notes (optional)</div>
        <textarea id="f-notes" placeholder="Anything to share beforehand..."></textarea>
      </div>
      <button class="btn-confirm" id="btn-confirm">Confirm Booking</button>
    </div>

    <!-- CONFIRMATION PANE -->
    <div id="confirm-pane" style="display:none" class="confirm-pane">
      <div class="confirm-check">✓</div>
      <div class="confirm-headline">You're booked!</div>
      <div class="confirm-sub">Confirmation sent to <strong id="confirm-email"></strong></div>
      <div class="confirm-detail" id="confirm-detail"></div>
      <div class="confirm-uid" id="confirm-uid"></div>
      <button class="btn-cancel-bkg" id="btn-cancel-bkg">Cancel this booking</button>
    </div>

    <!-- FOOTER -->
    <div class="card-footer">
      <div style="display:flex;align-items:center;gap:16px;">
        <a class="brand-link" href="https://schedkit.net" target="_blank">
          <svg width="14" height="14" viewBox="0 0 512 512"><rect width="512" height="512" rx="80" fill="#DFFF00"/><line x1="128" y1="96" x2="208" y2="416" stroke="#0A0A0B" stroke-width="72" stroke-linecap="round"/><line x1="272" y1="96" x2="352" y2="416" stroke="#0A0A0B" stroke-width="72" stroke-linecap="round"/></svg>
          schedkit.net
        </a>
        <button class="lights-btn mobile-lights" id="lightsBtnMobile">
          <span>🔦</span><span id="lightsBtnLabelMobile">LIGHTS ON</span>
        </button>
      </div>
    </div>

  </div>
</div>

<script>
(async () => {
  const USERNAME = ${JSON.stringify(username)};
  const EVENT_SLUG = ${JSON.stringify(eventSlug)};
  const RESCHEDULE_TOKEN = ${JSON.stringify(reschedule || null)};
  const PREFILL_NAME = ${JSON.stringify(name || '')};
  const PREFILL_EMAIL = ${JSON.stringify(email || '')};

  let eventType = null;
  let selectedDate = null;
  let selectedSlot = null;
  let currentYear, currentMonth;
  let timezone = ${JSON.stringify(tz || '')} || Intl.DateTimeFormat().resolvedOptions().timeZone;
  let availableDates = new Set();
  let cancelUrl = null;

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  await loadEventType();
  populateTimezones();
  renderCalendar();
  preloadMonth();

  if (RESCHEDULE_TOKEN) {
    document.getElementById('reschedule-badge').style.display = '';
    document.getElementById('f-name').value = PREFILL_NAME;
    document.getElementById('f-email').value = PREFILL_EMAIL;
  }

  // ── Load event type ──
  async function loadEventType() {
    try {
      const res = await fetch(\`/v1/slots/\${USERNAME}/\${EVENT_SLUG}?date=\${fmtDate(now)}&timezone=\${encodeURIComponent(timezone)}\`);
      const data = await res.json();
      if (data.event_type) {
        eventType = data.event_type;
        const label = eventType.appointment_label || 'meeting';
        const locIcon = { video:'📹', phone:'📞', in_person:'📍', other:'📌' }[eventType.location_type] || '📅';
        const locLabel = eventType.location || ({ video:'Video call', phone:'Phone call', in_person:'In person' }[eventType.location_type] || 'Meeting');

        document.getElementById('info-avatar').textContent = locIcon;
        document.getElementById('info-name').textContent = USERNAME;
        document.getElementById('info-title').textContent = eventType.title;
        document.getElementById('info-meta').innerHTML = \`
          <div class="meta-row"><span class="meta-icon">⏱</span>\${eventType.duration_minutes} min</div>
          <div class="meta-row"><span class="meta-icon">\${locIcon}</span>\${locLabel}</div>
        \`;
        document.title = RESCHEDULE_TOKEN ? \`Reschedule: \${eventType.title}\` : \`Book \${label}: \${eventType.title}\`;
        document.getElementById('btn-confirm').textContent = RESCHEDULE_TOKEN
          ? 'Confirm Reschedule'
          : \`Confirm \${label.charAt(0).toUpperCase() + label.slice(1)}\`;
        if (eventType.description) {
          const d = document.getElementById('info-desc');
          d.textContent = eventType.description; d.style.display = '';
        }
        // Custom fields
        if (eventType.custom_fields) {
          let fields = [];
          try { fields = JSON.parse(eventType.custom_fields); } catch {}
          const container = document.getElementById('custom-fields-container');
          fields.forEach(f => {
            const div = document.createElement('div'); div.className = 'field';
            const req = f.required ? ' <span style="color:var(--error)">*</span>' : '';
            let inp = '';
            if (f.type === 'textarea') inp = \`<textarea id="cf-\${f.id}" placeholder="\${f.placeholder||''}"></textarea>\`;
            else if (f.type === 'select') { const o=(f.options||[]).map(x=>\`<option value="\${x}">\${x}</option>\`).join(''); inp=\`<select id="cf-\${f.id}"><option value="">Select...</option>\${o}</select>\`; }
            else { const t=f.type==='phone'?'tel':f.type==='number'?'number':'text'; inp=\`<input type="\${t}" id="cf-\${f.id}" placeholder="\${f.placeholder||''}">\`; }
            div.innerHTML = \`<div class="field-lbl">\${f.label}\${req}</div>\${inp}\`;
            container.appendChild(div);
          });
        }
      }
    } catch(e) { document.getElementById('info-name').textContent = 'Could not load event'; }
  }

  // ── Timezone ──
  function populateTimezones() {
    const sel = document.getElementById('tz-select');
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [
      'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
      'America/Phoenix','Europe/London','Europe/Paris','Europe/Berlin',
      'Asia/Tokyo','Asia/Singapore','Australia/Sydney','UTC'
    ];
    zones.forEach(z => {
      const o = document.createElement('option'); o.value = z; o.textContent = z;
      if (z === timezone) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', async () => {
      timezone = sel.value; availableDates.clear();
      await preloadMonth(); renderCalendar();
      if (selectedDate) loadSlots(selectedDate);
    });
  }

  // ── Calendar helpers ──
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  async function preloadMonth() {
    const year = currentYear, month = currentMonth;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const todayStr = fmtDate(now);
    const fetches = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = \`\${year}-\${String(month+1).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`;
      if (ds < todayStr) continue;
      fetches.push(
        fetch(\`/v1/slots/\${USERNAME}/\${EVENT_SLUG}?date=\${ds}&timezone=\${encodeURIComponent(timezone)}\`)
          .then(r => r.json())
          .then(data => { if (data.slots?.length) availableDates.add(ds); })
          .catch(() => {})
      );
    }
    await Promise.all(fetches);
    renderCalendar();
  }

  function renderCalendar() {
    const MONTHS = ['January','February','March','April','May','June',
      'July','August','September','October','November','December'];
    const monthEl = document.getElementById('cal-month-label');
    monthEl.innerHTML = \`<strong>\${MONTHS[currentMonth]}</strong> <span>\${currentYear}</span>\`;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const el = document.createElement('div'); el.className = 'cal-dow'; el.textContent = d; grid.appendChild(el);
    });

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
    const todayStr = fmtDate(now);

    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div'); el.className = 'cal-day empty'; grid.appendChild(el);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = \`\${currentYear}-\${String(currentMonth+1).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`;
      const el = document.createElement('div'); el.className = 'cal-day'; el.textContent = d;
      if (ds < todayStr) el.classList.add('disabled');
      else {
        if (ds === todayStr) el.classList.add('today');
        if (availableDates.has(ds)) el.classList.add('has-slots');
        if (ds === selectedDate) el.classList.add('selected');
        el.addEventListener('click', () => selectDate(ds));
      }
      grid.appendChild(el);
    }
  }

  document.getElementById('prev-month').addEventListener('click', async () => {
    currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    availableDates.clear(); renderCalendar(); await preloadMonth();
  });
  document.getElementById('next-month').addEventListener('click', async () => {
    currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    availableDates.clear(); renderCalendar(); await preloadMonth();
  });

  async function selectDate(ds) {
    selectedDate = ds; selectedSlot = null;
    renderCalendar();
    loadSlots(ds);
  }

  // ── Slots ──
  async function loadSlots(ds) {
    const panel = document.getElementById('slots-panel');
    const list = document.getElementById('slots-list');
    const countEl = document.getElementById('slots-count');
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const [y,m,d] = ds.split('-').map(Number);
    const dow = new Date(y, m-1, d).getDay();
    document.getElementById('slots-date-label').textContent = \`\${DAYS[dow]}, \${MONTHS[m-1]} \${d}\`;
    list.innerHTML = '<div class="slots-loading">Loading...</div>';
    countEl.textContent = '';
    panel.classList.add('open');

    try {
      const res = await fetch(\`/v1/slots/\${USERNAME}/\${EVENT_SLUG}?date=\${ds}&timezone=\${encodeURIComponent(timezone)}\`);
      const data = await res.json();
      list.innerHTML = '';
      if (!data.slots?.length) {
        list.innerHTML = '<div class="slots-empty">No slots available.</div>';
        countEl.textContent = '0 available';
        return;
      }
      countEl.textContent = \`\${data.slots.length} time\${data.slots.length===1?'':'s'} available\`;
      data.slots.forEach((slot, i) => {
        const btn = document.createElement('button'); btn.className = 'slot-btn';
        const t = new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: timezone });
        btn.textContent = t;
        btn.style.animationDelay = \`\${i * 35}ms\`;
        btn.addEventListener('click', () => selectSlot(slot, t, ds));
        list.appendChild(btn);
      });
    } catch(e) {
      list.innerHTML = '<div class="slots-empty">Error loading slots.</div>';
    }
  }

  function selectSlot(slot, timeStr, ds) {
    selectedSlot = slot;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [y,m,d] = ds.split('-').map(Number);
    document.getElementById('selected-slot-time').textContent = timeStr;
    document.getElementById('selected-slot-meta').textContent = \`\${MONTHS[m-1]} \${d}, \${y} · \${timezone}\`;
    document.getElementById('card-body').style.display = 'none';
    document.getElementById('form-pane').style.display = '';
    document.getElementById('confirm-pane').style.display = 'none';
  }

  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('card-body').style.display = '';
    document.getElementById('form-pane').style.display = 'none';
    document.getElementById('confirm-pane').style.display = 'none';
  });

  document.getElementById('btn-confirm').addEventListener('click', async () => {
    const nameVal = document.getElementById('f-name').value.trim();
    const emailVal = document.getElementById('f-email').value.trim();
    const notes = document.getElementById('f-notes').value.trim();
    if (!nameVal || !emailVal) { showError('Name and email are required.'); return; }
    if (!/^[^@]+@[^@]+\\.[^@]+$/.test(emailVal)) { showError('Please enter a valid email.'); return; }

    const custom_responses = {};
    if (eventType?.custom_fields) {
      let fields = [];
      try { fields = JSON.parse(eventType.custom_fields); } catch {}
      for (const f of fields) {
        const el = document.getElementById(\`cf-\${f.id}\`);
        if (!el) continue;
        const val = el.value.trim();
        if (f.required && !val) { showError(\`"\${f.label}" is required.\`); return; }
        custom_responses[f.id] = val;
      }
    }

    document.getElementById('form-error').style.display = 'none';
    const btn = document.getElementById('btn-confirm');
    btn.disabled = true; btn.textContent = RESCHEDULE_TOKEN ? 'Rescheduling...' : 'Booking...';

    try {
      const url = RESCHEDULE_TOKEN ? \`/v1/reschedule/\${RESCHEDULE_TOKEN}\` : \`/v1/book/\${USERNAME}/\${EVENT_SLUG}\`;
      const body = RESCHEDULE_TOKEN
        ? { start_time: selectedSlot.start, attendee_timezone: timezone }
        : { start_time: selectedSlot.start, attendee_name: nameVal, attendee_email: emailVal,
            attendee_timezone: timezone, notes,
            custom_responses: Object.keys(custom_responses).length ? custom_responses : undefined };

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Failed. Please try again.');
        btn.disabled = false;
        const lbl = eventType?.appointment_label || 'meeting';
        btn.textContent = RESCHEDULE_TOKEN ? 'Confirm Reschedule' : \`Confirm \${lbl.charAt(0).toUpperCase()+lbl.slice(1)}\`;
        return;
      }

      const startLocal = new Date(data.start_time).toLocaleString([], {
        weekday: 'long', month: 'long', day: 'numeric',
        year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone,
      });
      document.getElementById('confirm-email').textContent = emailVal;
      document.getElementById('confirm-detail').innerHTML = \`
        <div class="confirm-row"><div class="confirm-row-icon">📅</div><div><div class="confirm-row-lbl">Date & Time</div><div class="confirm-row-val">\${startLocal}</div></div></div>
        <div class="confirm-row"><div class="confirm-row-icon">🌍</div><div><div class="confirm-row-lbl">Timezone</div><div class="confirm-row-val">\${timezone}</div></div></div>
        <div class="confirm-row"><div class="confirm-row-icon">👤</div><div><div class="confirm-row-lbl">With</div><div class="confirm-row-val">\${USERNAME}</div></div></div>
      \`;
      document.getElementById('confirm-uid').textContent = 'Booking ID: ' + data.uid;
      cancelUrl = data.cancel_url;
      document.getElementById('card-body').style.display = 'none';
      document.getElementById('form-pane').style.display = 'none';
      document.getElementById('confirm-pane').style.display = '';
    } catch(e) {
      showError('Network error. Please try again.');
      btn.disabled = false; btn.textContent = 'Confirm Booking';
    }
  });

  document.getElementById('btn-cancel-bkg').addEventListener('click', async () => {
    if (!cancelUrl || !confirm('Cancel this booking?')) return;
    try {
      await fetch(cancelUrl, { method: 'POST' });
      document.getElementById('confirm-pane').innerHTML =
        '<div style="padding:48px 36px;color:var(--text2);font-family:var(--font-mono);font-size:13px">Booking cancelled.</div>';
    } catch(e) {}
  });

  function showError(msg) {
    const el = document.getElementById('form-error'); el.textContent = msg; el.style.display = 'block';
  }

  // ── Lights ──
  function initLights(btnId, labelId) {
    const btn = document.getElementById(btnId);
    const label = document.getElementById(labelId);
    const flicker = document.getElementById('lightsFlicker');
    let lights = localStorage.getItem('p7-lights') === '1' ||
      (localStorage.getItem('p7-lights') === null && window.matchMedia?.('(prefers-color-scheme: light)').matches);
    function apply(on) {
      document.documentElement.setAttribute('data-lights', on ? 'on' : 'off');
      ['lightsBtnLabel','lightsBtnLabelMobile'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = on ? 'LIGHTS OFF' : 'LIGHTS ON';
      });
    }
    function flickerOn(cb) {
      let i = 0, fl = [80,60,100,50,120,40,200];
      function s() { flicker.style.background = i%2===0?'rgba(255,255,230,0.18)':'rgba(255,255,230,0)'; i++; if(i<fl.length)setTimeout(s,fl[i-1]);else{flicker.style.background='rgba(255,255,230,0)';cb();} }
      s();
    }
    apply(lights);
    if (btn) btn.addEventListener('click', () => {
      if (!lights) { flickerOn(() => { lights=true; localStorage.setItem('p7-lights','1'); apply(true); }); }
      else { lights=false; localStorage.setItem('p7-lights','0'); apply(false); }
    });
  }
  initLights('lightsBtn', 'lightsBtnLabel');
  initLights('lightsBtnMobile', 'lightsBtnLabelMobile');
  // Sync both buttons
  ['lightsBtn','lightsBtnMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => {
      ['lightsBtn','lightsBtnMobile'].forEach(oid => {
        if (oid !== id) { /* already handled by apply() */ }
      });
    });
  });
})();
</script>
</body>
</html>`;
}
