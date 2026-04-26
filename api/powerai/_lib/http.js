'use strict';

function getAllowedOrigins() {
  const raw = process.env.POWERAI_ALLOWED_ORIGINS || '*';
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function isOriginAllowed(origin) {
  const allowed = getAllowedOrigins();
  if (allowed.includes('*')) return true;
  return !!origin && allowed.includes(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin || '*';
  const allowOrigin = isOriginAllowed(origin) ? origin : getAllowedOrigins()[0] || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin === '*' ? '*' : allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PowerApp-Client, X-PowerApp-Wallet');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

async function readRawBody(req, limitBytes = 12 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limitBytes) {
      const err = new Error('Payload demasiado grande. Reduce el tamaño de los adjuntos.');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req, limitBytes) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = await readRawBody(req, limitBytes);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (error) {
    const err = new Error('JSON inválido en la solicitud.');
    err.statusCode = 400;
    throw err;
  }
}

function requirePost(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Método no permitido. Usa POST.' });
    return false;
  }
  return true;
}

function normalizeError(error) {
  return {
    message: error?.message || String(error || 'Error desconocido'),
    statusCode: Number(error?.statusCode || error?.status || 500)
  };
}

module.exports = {
  setCors,
  sendJson,
  readJsonBody,
  requirePost,
  normalizeError
};
