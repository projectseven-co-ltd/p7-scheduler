// src/routes/signals.mjs — Beacon Mode + Signal feed
//
// Signal types:
//   beacon   — periodic GPS ping from an active operator
//   capture  — photo/image attached to a signal
//   note     — text note with optional coords
//   checkin  — manual "I'm here" with location
//   alert    — high-priority signal (triggers incident auto-create)
//
// SSE: /v1/signals/stream  — all signals for authenticated user's org

import { db } from '../lib/noco.mjs';
import { tables } from '../lib/tables.mjs';
import { requireSession } from '../middleware/session.mjs';

// ── In-process SSE clients ────────────────────────────
const signalClients = new Set();

export function broadcastSignal(event) {
  const data = 'data: ' + JSON.stringify(event) + '\n\n';
  for (const reply of signalClients) {
    try { reply.raw.write(data); } catch { signalClients.delete(reply); }
  }
}

// ── Routes ────────────────────────────────────────────
export default async function signalsRoutes(fastify) {

  // POST /v1/signals — create a signal (beacon ping, capture, note, etc.)
  fastify.post('/signals', {
    preHandler: requireSession,
    schema: {
      tags: ['Signals'],
      summary: 'Create a signal',
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type:      { type: 'string', enum: ['beacon','capture','note','checkin','alert'] },
          lat:       { type: 'number' },
          lng:       { type: 'number' },
          accuracy:  { type: 'number' },
          image_url: { type: 'string' },
          note:      { type: 'string' },
          ticket_id: { type: 'number' },
          meta:      { type: 'object' },
        },
      },
      response: {
        201: { type: 'object', additionalProperties: true },
      },
    },
  }, async (req, reply) => {
    const { type, lat, lng, accuracy, image_url, note, ticket_id, meta } = req.body;

    const signal = await db.create(tables.signals, {
      user_id:    req.user.Id,
      type,
      lat:        lat ?? null,
      lng:        lng ?? null,
      accuracy:   accuracy ?? null,
      image_url:  image_url ?? null,
      note:       note ?? null,
      ticket_id:  ticket_id ?? null,
      meta:       meta ? JSON.stringify(meta) : null,
      created_at: new Date().toISOString(),
    });

    const result = {
      ...signal,
      user_name: req.user.name || req.user.email,
    };

    // SSE broadcast
    broadcastSignal({ type: 'signal.' + type, payload: result });

    // If alert type → auto-create incident
    if (type === 'alert') {
      try {
        const { sendPushToUser } = await import('./push.mjs');
        await sendPushToUser(req.user.Id, {
          title: '⚡ ALERT SIGNAL',
          body: note || 'Alert signal received',
          url: '/incidents/war-room',
          tag: 'signal-alert-' + signal.Id,
          requireInteraction: true,
        });
      } catch {}
    }

    return reply.code(201).send(result);
  });

  // GET /v1/signals — list recent signals
  fastify.get('/signals', {
    preHandler: requireSession,
    schema: {
      tags: ['Signals'],
      summary: 'List recent signals',
      querystring: {
        type: 'object',
        properties: {
          type:   { type: 'string' },
          limit:  { type: 'integer', default: 100 },
          since:  { type: 'string', description: 'ISO timestamp — only signals after this' },
        },
      },
      response: {
        200: { type: 'object', additionalProperties: true },
      },
    },
  }, async (req) => {
    const { type, limit = 100, since } = req.query;
    let where = `(user_id,eq,${req.user.Id})`;
    if (type) where += `~and(type,eq,${type})`;
    if (since) where += `~and(created_at,gt,${since})`;

    const result = await db.list(tables.signals, {
      where,
      sort: '-created_at',
      limit,
    });

    return { signals: result.list || [], total: result.pageInfo?.totalRows ?? 0 };
  });

  // DELETE /v1/signals/beacon — stop beacon (mark last beacon stale via meta)
  fastify.delete('/signals/beacon', {
    preHandler: requireSession,
    schema: {
      tags: ['Signals'],
      summary: 'Stop beacon — broadcast beacon.off to stream',
    },
  }, async (req) => {
    broadcastSignal({ type: 'signal.beacon_off', payload: { user_id: req.user.Id } });
    return { ok: true };
  });

  // GET /v1/signals/stream — SSE stream of live signals
  fastify.get('/signals/stream', {
    schema: { tags: ['Signals'], summary: 'SSE stream of live signals', hide: false },
  }, async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('data: {"type":"connected"}\n\n');
    signalClients.add(reply);

    const keepalive = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); } catch { clearInterval(keepalive); }
    }, 25000);

    req.raw.on('close', () => {
      signalClients.delete(reply);
      clearInterval(keepalive);
    });

    await new Promise(() => {}); // hold connection
  });
}
