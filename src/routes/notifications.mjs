// src/routes/notifications.mjs

import { requireSession } from '../middleware/session.mjs';

export default async function notificationRoutes(fastify) {

  fastify.post('/notifications/test', {
    preHandler: requireSession,
    schema: {
      tags: ['Notifications'],
      summary: 'Send a test notification',
      security: [{ apiKey: [] }],
      description: 'Sends a test push notification to the specified ntfy.sh topic. Use this to verify your ntfy topic is configured correctly.',
      body: {
        type: 'object', required: ['topic'],
        properties: {
          topic: { type: 'string', description: 'ntfy.sh topic name or full URL (e.g. `my-topic` or `https://ntfy.sh/my-topic`)' },
        },
      },
      response: {
        200: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
    },
  }, async (req, reply) => {
    const { topic } = req.body || {};
    if (!topic) return reply.code(400).send({ error: 'topic required' });

    const url = topic.startsWith('http') ? topic : `https://ntfy.sh/${topic}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Title': 'SchedKit Test', 'Tags': 'bell,schedkit', 'Priority': 'default' },
      body: 'Your ntfy notifications are working!',
    });
    if (!res.ok) return reply.code(502).send({ error: 'ntfy_failed', status: res.status });
    return { ok: true };
  });
}
