// src/routes/calendar.mjs — Google Calendar OAuth + connection management

import { db } from '../lib/noco.mjs';
import { tables } from '../lib/tables.mjs';
import { requireSession } from '../middleware/session.mjs';
import { getAuthUrl, exchangeCode } from '../lib/googleCalendar.mjs';
import { nanoid } from 'nanoid';

export default async function calendarRoutes(fastify) {

  // GET /v1/auth/google/connect — redirect to Google OAuth
  fastify.get('/auth/google/connect', { preHandler: requireSession }, async (req, reply) => {
    const statePayload = Buffer.from(JSON.stringify({ userId: req.user.Id, nonce: nanoid(16) })).toString('base64url');
    return reply.redirect(getAuthUrl(statePayload));
  });

  // POST /v1/auth/google/exchange — called by google-callback.html with the code+state
  fastify.post('/auth/google/exchange', {
    preHandler: requireSession,
    schema: { body: { type: 'object', required: ['code', 'state'], properties: { code: { type: 'string' }, state: { type: 'string' } } } },
  }, async (req, reply) => {
    const { code, state } = req.body;
    let userId;
    try {
      const payload = JSON.parse(Buffer.from(state, 'base64url').toString());
      userId = payload.userId;
    } catch { return reply.code(400).send({ error: 'invalid_state' }); }

    if (String(userId) !== String(req.user.Id)) {
      return reply.code(403).send({ error: 'state_mismatch' });
    }

    try {
      const tokens = await exchangeCode(code);
      let calendarEmail = '';
      try {
        const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (ui.ok) calendarEmail = (await ui.json()).email || '';
      } catch(e) { console.error('userinfo:', e.message); }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      const existing = await db.find(tables.calendar_connections, `(user_id,eq,${userId})~and(provider,eq,google)`);
      if (existing.list?.length) await db.delete(tables.calendar_connections, existing.list[0].Id);
      await db.create(tables.calendar_connections, {
        user_id: String(userId), provider: 'google',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || existing.list?.[0]?.refresh_token || '',
        expires_at: expiresAt, calendar_email: calendarEmail,
      });
      return { ok: true, calendar_email: calendarEmail };
    } catch(e) {
      console.error('Google exchange error:', e.message);
      return reply.code(500).send({ error: 'token_exchange' });
    }
  });

  // GET /v1/calendar/status
  fastify.get('/calendar/status', { preHandler: requireSession }, async (req) => {
    const result = await db.find(tables.calendar_connections, `(user_id,eq,${req.user.Id})~and(provider,eq,google)`);
    const conn = result.list?.[0];
    if (!conn) return { connected: false };
    return { connected: true, provider: 'google', calendar_email: conn.calendar_email };
  });

  // DELETE /v1/calendar/disconnect
  fastify.delete('/calendar/disconnect', { preHandler: requireSession }, async (req) => {
    const result = await db.find(tables.calendar_connections, `(user_id,eq,${req.user.Id})~and(provider,eq,google)`);
    if (result.list?.length) await db.delete(tables.calendar_connections, result.list[0].Id);
    return { ok: true };
  });
}
