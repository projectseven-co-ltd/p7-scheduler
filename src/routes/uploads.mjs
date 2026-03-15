// src/routes/uploads.mjs — capture image upload, saved to disk

import { requireSession } from '../middleware/session.mjs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTURES_DIR = join(__dirname, '../../public/captures');

export default async function uploadsRoutes(fastify) {

  // POST /v1/upload/capture
  // Accepts raw image/jpeg binary, saves to public/captures/, returns { url }
  fastify.post('/upload/capture', {
    preHandler: requireSession,
    schema: {
      tags: ['Signals'],
      summary: 'Upload a capture image (saved to disk, served as static file)',
      consumes: ['image/jpeg', 'image/webp', 'image/png'],
    },
  }, async (req, reply) => {
    const mime = req.headers['content-type'] || 'image/jpeg';
    const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
    const filename = `cap_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
    const filepath = join(CAPTURES_DIR, filename);

    const buf = req.body;
    if (!buf || buf.length === 0) return reply.code(400).send({ error: 'No image data' });

    await writeFile(filepath, buf);

    const url = `/captures/${filename}`;
    return reply.send({ url, filename, size: buf.length });
  });
}
