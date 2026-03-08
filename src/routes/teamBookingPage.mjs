// src/routes/teamBookingPage.mjs — Team booking page + booking creation

import { db } from '../lib/noco.mjs';
import { tables } from '../lib/tables.mjs';
import { nanoid } from 'nanoid';
import { addMinutes, parseISO } from 'date-fns';
import { sendBookingConfirmation } from '../lib/mailer.mjs';

// Check if a user has availability at a given start_time (ISO string)
async function memberHasAvailability(userId, startISO, durationMins) {
  const start = new Date(startISO);
  const end = addMinutes(start, durationMins);

  // Get day of week (0-6) in UTC (simplified; slot generation uses UTC offsets)
  const dayOfWeek = start.getUTCDay();

  const avResult = await db.find(
    tables.availability,
    `(user_id,eq,${userId})~and(day_of_week,eq,${dayOfWeek})`
  );
  const avRows = avResult.list || [];

  for (const av of avRows) {
    const [sh, sm] = av.start_time.split(':').map(Number);
    const [eh, em] = av.end_time.split(':').map(Number);
    // Build window for that day in UTC
    const winStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), sh, sm));
    const winEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), eh, em));
    if (start >= winStart && end <= winEnd) return true;
  }
  return false;
}

export default async function teamBookingPageRoutes(fastify) {

  // Public booking page
  fastify.get('/book/:org_slug/:team_slug/:event_slug', async (req, reply) => {
    const { org_slug, team_slug, event_slug } = req.params;
    return reply.type('text/html').send(buildTeamPage(org_slug, team_slug, event_slug));
  });

  // Create team booking
  fastify.post('/v1/book/:org_slug/:team_slug/:event_slug', async (req, reply) => {
    const { org_slug, team_slug, event_slug } = req.params;
    const { start_time, attendee_name, attendee_email, attendee_timezone = 'UTC', notes } = req.body || {};

    if (!start_time || !attendee_name || !attendee_email) {
      return reply.code(400).send({ error: 'start_time, attendee_name, attendee_email required' });
    }

    // Resolve org → team → event type
    const orgResult = await db.find(tables.organizations, `(slug,eq,${org_slug})`);
    if (!orgResult.list?.length) return reply.code(404).send({ error: 'Org not found' });
    const org = orgResult.list[0];

    const teamResult = await db.find(tables.teams, `(org_id,eq,${org.Id})~and(slug,eq,${team_slug})`);
    if (!teamResult.list?.length) return reply.code(404).send({ error: 'Team not found' });
    const team = teamResult.list[0];

    const etResult = await db.find(tables.team_event_types, `(team_id,eq,${team.Id})~and(slug,eq,${event_slug})`);
    if (!etResult.list?.length) return reply.code(404).send({ error: 'Event type not found' });
    const eventType = etResult.list[0];

    // Get active team members
    const tmResult = await db.find(tables.team_members, `(team_id,eq,${team.Id})~and(active,eq,true)`);
    let members = tmResult.list || [];
    if (!members.length) return reply.code(409).send({ error: 'No team members available at that time' });

    // Routing
    let assignedMember = null;

    if (team.routing === 'round_robin') {
      const lastIdx = parseInt(team.last_assigned_index) || 0;
      // Try members starting from lastIdx+1 (circular)
      for (let i = 0; i < members.length; i++) {
        const idx = (lastIdx + 1 + i) % members.length;
        const m = members[idx];
        if (await memberHasAvailability(m.user_id, start_time, eventType.duration_minutes)) {
          assignedMember = m;
          // Update last_assigned_index
          await db.update(tables.teams, team.Id, { last_assigned_index: idx });
          break;
        }
      }
    } else {
      // random: shuffle then find first available
      const shuffled = [...members].sort(() => Math.random() - 0.5);
      for (const m of shuffled) {
        if (await memberHasAvailability(m.user_id, start_time, eventType.duration_minutes)) {
          assignedMember = m;
          break;
        }
      }
    }

    if (!assignedMember) {
      return reply.code(409).send({ error: 'No team members available at that time' });
    }

    const start = parseISO(start_time);
    const end = addMinutes(start, eventType.duration_minutes);

    // Create booking
    const uid = nanoid(12);
    const cancel_token = nanoid(24);
    const reschedule_token = nanoid(24);

    await db.create(tables.bookings, {
      uid,
      event_type_id: String(eventType.Id),
      user_id: String(assignedMember.user_id),
      attendee_name,
      attendee_email,
      attendee_timezone,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'confirmed',
      notes: notes || '',
      cancel_token,
      reschedule_token,
      created_at: new Date().toISOString(),
    });

    const BASE_DOMAIN = process.env.BASE_DOMAIN || 'schedkit.net';
    const cancelUrl = `https://${BASE_DOMAIN}/v1/cancel/${cancel_token}`;
    const rescheduleUrl = `https://${BASE_DOMAIN}/v1/reschedule/${reschedule_token}`;

    // Get assigned member's user record for email
    const assignedUser = await db.get(tables.users, assignedMember.user_id);

    // Send confirmation to attendee
    await sendBookingConfirmation({
      attendee_name,
      attendee_email,
      host_name: team.name,
      host_email: assignedUser?.email,
      event_title: eventType.title,
      start_time: start.toISOString(),
      timezone: attendee_timezone,
      cancel_url: cancelUrl,
      reschedule_url: rescheduleUrl,
    });

    // Notify assigned team member
    if (assignedUser?.email) {
      try {
        await sendBookingConfirmation({
          attendee_name,
          attendee_email: assignedUser.email,
          host_name: team.name,
          host_email: assignedUser.email,
          event_title: `[Team: ${team.name}] ${eventType.title}`,
          start_time: start.toISOString(),
          timezone: attendee_timezone,
          cancel_url: cancelUrl,
          reschedule_url: rescheduleUrl,
        });
      } catch (e) {
        fastify.log.warn('Team member notification failed:', e.message);
      }
    }

    return reply.code(201).send({
      uid,
      status: 'confirmed',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      assigned_to: assignedUser?.name || assignedUser?.email,
      cancel_url: `/v1/cancel/${cancel_token}`,
      reschedule_url: `/v1/reschedule/${reschedule_token}`,
    });
  });
}

function buildTeamPage(orgSlug, teamSlug, eventSlug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Book a Meeting</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0b;
    --surface: #111114;
    --border: #1e1e24;
    --accent: #DFFF00;
    --accent-dim: rgba(223,255,0,0.12);
    --text: #e8e8ea;
    --muted: #5a5a6e;
    --error: #ff5f5f;
    --success: #00e5a0;
    --font-sans: 'Space Grotesk', system-ui, sans-serif;
    --font-mono: 'Fira Code', monospace;
    --radius: 8px;
  }
  [data-lights="on"] {
    --bg: #f5f4ef; --surface: #edecea; --border: rgba(0,0,0,0.1);
    --accent: #4a5500; --accent-dim: rgba(74,85,0,0.1);
    --text: #141410; --muted: #5a5a4a; --error: #c0392b; --success: #1a7a52;
  }
  .lights-btn { display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:var(--font-mono);font-size:0.6rem;letter-spacing:0.08em;cursor:pointer;transition:all .2s; }
  .lights-btn:hover { border-color:var(--accent);color:var(--accent); }
  #lightsFlicker { position:fixed;inset:0;z-index:9999;pointer-events:none;background:rgba(255,255,230,0); }
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=Fira+Code:wght@400;500&display=swap');
  body { background:var(--bg);color:var(--text);font-family:var(--font-sans);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:40px 16px 80px; }
  .brand { font-family:var(--font-mono);color:var(--accent);font-size:13px;letter-spacing:0.1em;margin-bottom:40px;opacity:0.7; }
  .card { background:var(--surface);border:1px solid var(--border);border-radius:12px;width:100%;max-width:780px;overflow:hidden; }
  .event-header { padding:28px 32px 24px;border-bottom:1px solid var(--border); }
  .event-host { font-size:13px;color:var(--muted);margin-bottom:6px;font-family:var(--font-mono); }
  .event-title { font-size:22px;font-weight:600;color:var(--text); }
  .event-meta { display:flex;gap:20px;margin-top:10px; }
  .event-meta span { font-size:13px;color:var(--muted);display:flex;align-items:center;gap:5px; }
  .event-desc { font-size:13px;color:var(--muted);line-height:1.6;margin-top:12px;border-top:1px solid var(--border);padding-top:12px; }
  .picker { display:flex;border-bottom:1px solid var(--border); }
  .cal-pane { flex:0 0 320px;padding:28px 24px;border-right:1px solid var(--border); }
  .slots-pane { flex:1;padding:28px 24px; }
  @media (max-width:600px) { .picker{flex-direction:column;} .cal-pane{border-right:none;border-bottom:1px solid var(--border);} }
  .cal-nav { display:flex;align-items:center;justify-content:space-between;margin-bottom:16px; }
  .cal-nav button { background:none;border:1px solid var(--border);color:var(--text);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:border-color 0.15s; }
  .cal-nav button:hover { border-color:var(--accent);color:var(--accent); }
  .cal-month { font-weight:600;font-size:15px; }
  .cal-grid { display:grid;grid-template-columns:repeat(7,1fr);gap:2px; }
  .cal-dow { font-size:11px;color:var(--muted);text-align:center;padding:4px 0 8px;font-family:var(--font-mono); }
  .cal-day { aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:13px;border-radius:6px;cursor:pointer;transition:background 0.1s,color 0.1s;border:1px solid transparent; }
  .cal-day:hover:not(.disabled):not(.empty) { background:var(--accent-dim);border-color:var(--accent);color:var(--accent); }
  .cal-day.selected { background:var(--accent);color:#0a0a0b;font-weight:600; }
  .cal-day.today { border-color:var(--muted); }
  .cal-day.disabled { color:var(--muted);opacity:0.35;cursor:default; }
  .cal-day.empty { cursor:default; }
  .cal-day.has-slots { position:relative; }
  .cal-day.has-slots::after { content:'';position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent); }
  .cal-day.selected::after { background:#0a0a0b; }
  .tz-select { margin-top:20px;display:flex;flex-direction:column;gap:6px; }
  .tz-select label { font-size:11px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.05em; }
  .tz-select select { background:var(--bg);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:6px;font-size:13px;width:100%;cursor:pointer; }
  .tz-select select:focus { outline:none;border-color:var(--accent); }
  .slots-heading { font-size:13px;color:var(--muted);margin-bottom:16px;font-family:var(--font-mono); }
  .slots-list { display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto; }
  .slot-btn { background:none;border:1px solid var(--border);color:var(--text);padding:12px 16px;border-radius:var(--radius);cursor:pointer;text-align:left;font-family:var(--font-sans);font-size:14px;font-weight:500;transition:all 0.15s;display:flex;align-items:center;justify-content:space-between; }
  .slot-btn:hover { border-color:var(--accent);color:var(--accent);background:var(--accent-dim); }
  .slots-empty { color:var(--muted);font-size:14px;padding:20px 0; }
  .slots-loading { color:var(--muted);font-size:13px;font-family:var(--font-mono); }
  .form-pane { padding:28px 32px; }
  .form-pane h3 { font-size:16px;font-weight:600;margin-bottom:6px; }
  .form-selected-time { font-size:13px;color:var(--accent);font-family:var(--font-mono);margin-bottom:24px; }
  .field { display:flex;flex-direction:column;gap:6px;margin-bottom:16px; }
  .field label { font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;font-family:var(--font-mono); }
  .field input, .field textarea { background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:var(--radius);font-family:var(--font-sans);font-size:14px; }
  .field input:focus, .field textarea:focus { outline:none;border-color:var(--accent); }
  .field textarea { resize:vertical;min-height:80px; }
  .btn-confirm { background:var(--accent);color:#0a0a0b;border:none;padding:12px 28px;border-radius:var(--radius);font-weight:600;font-size:15px;cursor:pointer;width:100%;margin-top:8px;transition:opacity 0.15s; }
  .btn-confirm:hover { opacity:0.9; }
  .btn-confirm:disabled { opacity:0.4;cursor:default; }
  .btn-back { background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;margin-top:12px;text-decoration:underline; }
  .confirm-pane { padding:48px 32px;text-align:center; }
  .confirm-icon { font-size:48px;margin-bottom:16px; }
  .confirm-pane h2 { font-size:22px;font-weight:600;margin-bottom:8px; }
  .confirm-pane p { color:var(--muted);font-size:14px;margin-bottom:6px; }
  .confirm-time { font-family:var(--font-mono);color:var(--accent);font-size:15px;margin:16px 0; }
  .confirm-uid { font-family:var(--font-mono);font-size:11px;color:var(--muted);margin-top:24px; }
  .error-msg { background:rgba(255,95,95,0.1);border:1px solid var(--error);color:var(--error);padding:10px 14px;border-radius:var(--radius);font-size:13px;margin-bottom:16px; }
  .slots-list::-webkit-scrollbar { width:4px; }
  .slots-list::-webkit-scrollbar-track { background:transparent; }
  .slots-list::-webkit-scrollbar-thumb { background:var(--border);border-radius:2px; }
</style>
</head>
<body>
<div id="lightsFlicker"></div>
<div style="width:100%;display:flex;justify-content:flex-end;padding:12px 16px 0;max-width:780px;margin:0 auto">
  <button class="lights-btn" id="lightsBtn"><span>🔦</span><span id="lightsBtnLabel">LIGHTS ON</span></button>
</div>
<div class="brand">// schedkit</div>
<div class="card" id="app">
  <div class="event-header" id="event-header">
    <div class="event-host" id="event-host">Loading...</div>
    <div class="event-title" id="event-title"></div>
    <div class="event-meta" id="event-meta"></div>
    <div class="event-desc" id="event-desc" style="display:none"></div>
  </div>
  <div id="step-pick">
    <div class="picker">
      <div class="cal-pane">
        <div class="cal-nav">
          <button id="prev-month">&#8249;</button>
          <span class="cal-month" id="cal-month-label"></span>
          <button id="next-month">&#8250;</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="tz-select">
          <label>Timezone</label>
          <select id="tz-select"></select>
        </div>
      </div>
      <div class="slots-pane">
        <div class="slots-heading" id="slots-heading">Select a date</div>
        <div class="slots-list" id="slots-list"></div>
      </div>
    </div>
  </div>
  <div id="step-form" style="display:none">
    <div class="form-pane">
      <h3>Your details</h3>
      <div class="form-selected-time" id="form-selected-time"></div>
      <div id="form-error" style="display:none" class="error-msg"></div>
      <div class="field"><label>Full Name</label><input type="text" id="f-name" autocomplete="name"></div>
      <div class="field"><label>Email</label><input type="email" id="f-email" autocomplete="email"></div>
      <div class="field"><label>Notes (optional)</label><textarea id="f-notes"></textarea></div>
      <button class="btn-confirm" id="btn-confirm">Confirm Booking</button>
      <br><button class="btn-back" id="btn-back">← Back</button>
    </div>
  </div>
  <div id="step-confirmed" style="display:none">
    <div class="confirm-pane">
      <div class="confirm-icon">✅</div>
      <h2>You're booked!</h2>
      <p>A confirmation has been sent to <span id="confirm-email"></span></p>
      <div class="confirm-time" id="confirm-time"></div>
      <div class="confirm-uid" id="confirm-uid"></div>
    </div>
  </div>
</div>
<script>
(async () => {
  const ORG_SLUG = ${JSON.stringify(orgSlug)};
  const TEAM_SLUG = ${JSON.stringify(teamSlug)};
  const EVENT_SLUG = ${JSON.stringify(eventSlug)};

  let eventType = null, selectedDate = null, selectedSlot = null;
  let currentYear, currentMonth;
  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let availableDates = new Set();

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  await loadEventType();
  populateTimezones();
  renderCalendar();
  preloadMonth();

  async function loadEventType() {
    try {
      const today = fmtDate(now);
      const res = await fetch(\`/v1/slots/\${ORG_SLUG}/\${TEAM_SLUG}/\${EVENT_SLUG}?date=\${today}&timezone=\${encodeURIComponent(timezone)}\`);
      const data = await res.json();
      if (data.event_type) {
        eventType = data.event_type;
        document.getElementById('event-host').textContent = TEAM_SLUG;
        document.getElementById('event-title').textContent = eventType.title;
        document.getElementById('event-meta').innerHTML = \`<span>⏱ \${eventType.duration_minutes} min</span>\${eventType.location ? '<span>📍 '+eventType.location+'</span>' : ''}\`;
        document.title = 'Book: ' + eventType.title;
        if (eventType.description) { const d=document.getElementById('event-desc');d.textContent=eventType.description;d.style.display=''; }
      }
    } catch(e) { document.getElementById('event-host').textContent='Could not load'; }
  }

  function populateTimezones() {
    const sel = document.getElementById('tz-select');
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Tokyo','UTC'];
    zones.forEach(z => { const o=document.createElement('option');o.value=z;o.textContent=z;if(z===timezone)o.selected=true;sel.appendChild(o); });
    sel.addEventListener('change', async () => { timezone=sel.value;availableDates.clear();await preloadMonth();renderCalendar();if(selectedDate)loadSlots(selectedDate); });
  }

  function fmtDate(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  async function preloadMonth() {
    const year=currentYear,month=currentMonth;
    const daysInMonth=new Date(year,month+1,0).getDate();
    const todayStr=fmtDate(now);
    const fetches=[];
    for(let d=1;d<=daysInMonth;d++){
      const dateStr=\`\${year}-\${String(month+1).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`;
      if(dateStr<todayStr)continue;
      fetches.push(fetch(\`/v1/slots/\${ORG_SLUG}/\${TEAM_SLUG}/\${EVENT_SLUG}?date=\${dateStr}&timezone=\${encodeURIComponent(timezone)}\`).then(r=>r.json()).then(data=>{if(data.slots?.length)availableDates.add(dateStr);}).catch(()=>{}));
    }
    await Promise.all(fetches);
    renderCalendar();
  }

  function renderCalendar() {
    const label=document.getElementById('cal-month-label'),grid=document.getElementById('cal-grid');
    const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent=\`\${monthNames[currentMonth]} \${currentYear}\`;
    grid.innerHTML='';
    ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>{const el=document.createElement('div');el.className='cal-dow';el.textContent=d;grid.appendChild(el);});
    const firstDay=new Date(currentYear,currentMonth,1).getDay();
    const daysInMonth=new Date(currentYear,currentMonth+1,0).getDate();
    const todayStr=fmtDate(now);
    for(let i=0;i<firstDay;i++){const el=document.createElement('div');el.className='cal-day empty';grid.appendChild(el);}
    for(let d=1;d<=daysInMonth;d++){
      const dateStr=\`\${currentYear}-\${String(currentMonth+1).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`;
      const el=document.createElement('div');el.className='cal-day';el.textContent=d;
      if(dateStr<todayStr){el.classList.add('disabled');}
      else{
        if(dateStr===todayStr)el.classList.add('today');
        if(availableDates.has(dateStr))el.classList.add('has-slots');
        if(dateStr===selectedDate)el.classList.add('selected');
        el.addEventListener('click',()=>selectDate(dateStr));
      }
      grid.appendChild(el);
    }
  }

  document.getElementById('prev-month').addEventListener('click',async()=>{currentMonth--;if(currentMonth<0){currentMonth=11;currentYear--;}availableDates.clear();renderCalendar();await preloadMonth();});
  document.getElementById('next-month').addEventListener('click',async()=>{currentMonth++;if(currentMonth>11){currentMonth=0;currentYear++;}availableDates.clear();renderCalendar();await preloadMonth();});

  async function selectDate(dateStr){selectedDate=dateStr;selectedSlot=null;renderCalendar();loadSlots(dateStr);}

  async function loadSlots(dateStr){
    const heading=document.getElementById('slots-heading'),list=document.getElementById('slots-list');
    const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [y,m,d]=dateStr.split('-').map(Number);
    const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dow=new Date(y,m-1,d).getDay();
    heading.textContent=\`\${dayNames[dow]}, \${monthNames[m-1]} \${d}\`;
    list.innerHTML='<div class="slots-loading">Loading slots...</div>';
    try{
      const res=await fetch(\`/v1/slots/\${ORG_SLUG}/\${TEAM_SLUG}/\${EVENT_SLUG}?date=\${dateStr}&timezone=\${encodeURIComponent(timezone)}\`);
      const data=await res.json();
      list.innerHTML='';
      if(!data.slots?.length){list.innerHTML='<div class="slots-empty">No availability on this day.</div>';return;}
      data.slots.forEach(slot=>{
        const btn=document.createElement('button');btn.className='slot-btn';
        const localTime=new Date(slot.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',timeZone:timezone});
        btn.innerHTML=\`<span>\${localTime}</span><span>Select →</span>\`;
        btn.addEventListener('click',()=>selectSlot(slot,localTime,dateStr));
        list.appendChild(btn);
      });
    }catch(e){list.innerHTML='<div class="slots-empty">Error loading slots.</div>';}
  }

  function selectSlot(slot,localTime,dateStr){
    selectedSlot=slot;
    const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [y,m,d]=dateStr.split('-').map(Number);
    document.getElementById('form-selected-time').textContent=\`\${localTime} · \${monthNames[m-1]} \${d}, \${y} · \${timezone}\`;
    showStep('form');
  }

  document.getElementById('btn-back').addEventListener('click',()=>showStep('pick'));
  document.getElementById('btn-confirm').addEventListener('click',async()=>{
    const name=document.getElementById('f-name').value.trim();
    const email=document.getElementById('f-email').value.trim();
    const notes=document.getElementById('f-notes').value.trim();
    if(!name||!email){showError('Name and email are required.');return;}
    if(!/^[^@]+@[^@]+\.[^@]+$/.test(email)){showError('Please enter a valid email.');return;}
    document.getElementById('form-error').style.display='none';
    const btn=document.getElementById('btn-confirm');btn.disabled=true;btn.textContent='Booking...';
    try{
      const res=await fetch(\`/v1/book/\${ORG_SLUG}/\${TEAM_SLUG}/\${EVENT_SLUG}\`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({start_time:selectedSlot.start,attendee_name:name,attendee_email:email,attendee_timezone:timezone,notes}),
      });
      const data=await res.json();
      if(!res.ok){showError(data.error||'Failed. Please try again.');btn.disabled=false;btn.textContent='Confirm Booking';return;}
      const startLocal=new Date(data.start_time).toLocaleString([],{weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:timezone});
      document.getElementById('confirm-email').textContent=email;
      document.getElementById('confirm-time').textContent=startLocal+' · '+timezone;
      document.getElementById('confirm-uid').textContent='Booking ID: '+data.uid;
      showStep('confirmed');
    }catch(e){showError('Network error. Please try again.');btn.disabled=false;btn.textContent='Confirm Booking';}
  });

  function showError(msg){const el=document.getElementById('form-error');el.textContent=msg;el.style.display='block';}
  function showStep(step){
    document.getElementById('step-pick').style.display=step==='pick'?'':'none';
    document.getElementById('step-form').style.display=step==='form'?'':'none';
    document.getElementById('step-confirmed').style.display=step==='confirmed'?'':'none';
  }

  (function(){
    const btn=document.getElementById('lightsBtn'),label=document.getElementById('lightsBtnLabel'),flicker=document.getElementById('lightsFlicker');
    let lights=localStorage.getItem('p7-lights')==='1'||(localStorage.getItem('p7-lights')===null&&window.matchMedia?.('(prefers-color-scheme: light)').matches);
    function applyTheme(on){document.documentElement.setAttribute('data-lights',on?'on':'off');if(label)label.textContent=on?'LIGHTS OFF':'LIGHTS ON';}
    function flickerOn(cb){let i=0,fl=[80,60,100,50,120,40,200];function s(){flicker.style.background=i%2===0?'rgba(255,255,230,0.18)':'rgba(255,255,230,0)';i++;if(i<fl.length)setTimeout(s,fl[i-1]);else{flicker.style.background='rgba(255,255,230,0)';cb();}}s();}
    applyTheme(lights);
    if(btn)btn.addEventListener('click',function(){if(!lights){flickerOn(()=>{lights=true;localStorage.setItem('p7-lights','1');applyTheme(true);});}else{lights=false;localStorage.setItem('p7-lights','0');applyTheme(false);}});
  })();
})();
</script>
</body>
</html>`;
}
