import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import staticFiles from '@fastify/static';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { ensureSchema } from './lib/schema.mjs';
import { meta } from './lib/noco.mjs';
import { tables } from './lib/tables.mjs';
import eventTypesRoutes from './routes/eventTypes.mjs';
import availabilityRoutes from './routes/availability.mjs';
import bookingsRoutes from './routes/bookings.mjs';
import usersRoutes from './routes/users.mjs';
import bookingPageRoutes from './routes/bookingPage.mjs';

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });
await fastify.register(formbody);
await fastify.register(staticFiles, { root: join(__dirname, '../public'), prefix: '/' });

// Ensure NocoDB schema exists
await ensureSchema();

// Load table ID map
const tableList = await meta.getTables();
for (const t of tableList.list) {
  tables[t.title] = t.id;
}
console.log('Tables loaded:', Object.keys(tables));

// Routes
await fastify.register(usersRoutes, { prefix: '/v1' });
await fastify.register(eventTypesRoutes, { prefix: '/v1' });
await fastify.register(availabilityRoutes, { prefix: '/v1' });
await fastify.register(bookingsRoutes, { prefix: '/v1' });
await fastify.register(bookingPageRoutes);

// Health
fastify.get('/health', () => ({ status: 'ok', service: 'p7-scheduler' }));

// Request access — email Jason
fastify.post('/v1/request-access', async (req, reply) => {
  const { name, email, company, message } = req.body || {};
  if (!name || !email) return reply.code(400).send({ error: 'Name and email required' });
  try {
    const { sendAccessRequest } = await import('./lib/mailer.mjs');
    await sendAccessRequest({ name, email, company, message });
    return { ok: true };
  } catch(e) {
    fastify.log.error(e);
    return reply.code(500).send({ error: 'Failed to send' });
  }
});

const port = Number(process.env.PORT || 3000);
await fastify.listen({ port, host: '0.0.0.0' });
console.log(`p7-scheduler running on :${port}`);
