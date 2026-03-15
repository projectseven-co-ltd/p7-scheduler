// src/routes/uploads.mjs — file upload proxy to NocoDB storage

import { requireSession } from '../middleware/session.mjs';

const NOCO_BASE = process.env.NOCO_URL || 'https://noco.app.p7n.net';
const NOCO_TOKEN = process.env.NOCO_TOKEN;
const UPLOAD_PATH = 'noco/pdrfbzgtno2cf9l/m21ubw2908iz01s/image_url';

export default async function uploadsRoutes(fastify) {

  // POST /v1/upload/capture
  // Accepts raw image binary (Content-Type: image/jpeg or image/webp)
  // Returns { url } — permanent NocoDB storage path (not signed)
  fastify.post('/upload/capture', {
    preHandler: requireSession,
    config: { rawBody: true },
    schema: {
      tags: ['Signals'],
      summary: 'Upload a capture image to NocoDB storage',
      consumes: ['image/jpeg', 'image/webp', 'image/png'],
    },
  }, async (req, reply) => {
    const mime = req.headers['content-type'] || 'image/jpeg';
    const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
    const filename = `capture_${Date.now()}.${ext}`;

    // Get raw body
    const rawBody = req.rawBody || await req.body;
    if (!rawBody || rawBody.length === 0) {
      return reply.code(400).send({ error: 'No image data' });
    }

    // Build multipart form manually (simple boundary approach)
    const boundary = '----NocoBoundary' + Math.random().toString(36).slice(2);
    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ];
    const prefix = Buffer.from(bodyParts[0]);
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const imgBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const multipartBody = Buffer.concat([prefix, imgBuf, suffix]);

    const res = await fetch(
      `${NOCO_BASE}/api/v1/db/storage/upload?path=${UPLOAD_PATH}`,
      {
        method: 'POST',
        headers: {
          'xc-token': NOCO_TOKEN,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      fastify.log.error('NocoDB upload error: ' + txt);
      return reply.code(500).send({ error: 'Upload failed: ' + txt.slice(0, 200) });
    }

    const json = await res.json();
    const file = Array.isArray(json) ? json[0] : json;
    // Return both permanent url and signedUrl (signed expires ~2hrs)
    return reply.send({ url: file.url, signedUrl: file.signedUrl, title: file.title, size: file.size });
  });

  // GET /v1/upload/image?url=...
  // Proxies a NocoDB MinIO signedUrl through our server (bypasses CORS/auth on client)
  // Also accepts permanent url and re-signs by fetching through NocoDB
  fastify.get('/upload/image', {
    preHandler: requireSession,
    schema: {
      tags: ['Signals'],
      summary: 'Proxy a stored capture image',
      querystring: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  }, async (req, reply) => {
    const { url: imgUrl } = req.query;

    // If it's already a minio signedUrl (/nsn/ path), fetch directly
    // If it's a permanent minio URL (/nc/uploads/), we need to re-sign
    let fetchUrl = imgUrl;
    if (imgUrl.includes('/nc/uploads/') && !imgUrl.includes('/nsn/')) {
      // Extract relative path and re-upload a tiny probe to get a signed URL
      // Actually: fetch the file through NocoDB's own signed URL mechanism
      // NocoDB stores signed URLs — we re-sign by querying via storage/upload path
      const relPath = imgUrl.split('/nc/uploads/')[1];
      const signRes = await fetch(
        `${NOCO_BASE}/api/v1/db/storage/upload?path=${UPLOAD_PATH}`,
        {
          method: 'POST',
          headers: { 'xc-token': NOCO_TOKEN, 'Content-Type': `multipart/form-data; boundary=----resign` },
          body: Buffer.from(`------resign\r\nContent-Disposition: form-data; name="filePath"\r\n\r\n${relPath}\r\n------resign--\r\n`),
        }
      ).catch(() => null);
      // If re-sign fails, try fetching directly from minio with path as-is
      if (signRes?.ok) {
        const signData = await signRes.json().catch(() => []);
        fetchUrl = (Array.isArray(signData) ? signData[0] : signData)?.signedUrl || imgUrl;
      }
    }

    try {
      const imgRes = await fetch(fetchUrl);
      if (!imgRes.ok) return reply.code(404).send({ error: 'Image not found' });
      const ct = imgRes.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await imgRes.arrayBuffer());
      return reply.type(ct).header('Cache-Control', 'private, max-age=3600').send(buf);
    } catch (e) {
      return reply.code(502).send({ error: 'Failed to fetch image: ' + e.message });
    }
  });
}
