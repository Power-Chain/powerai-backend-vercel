'use strict';

const DEFAULT_MAX_INLINE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_RE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/plain)$/i;

function byteLengthFromBase64(base64 = '') {
  const clean = String(base64 || '').replace(/\s+/g, '');
  if (!clean) return 0;
  const padding = (clean.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function dataUrlToBase64(input = '') {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const comma = raw.indexOf(',');
  const base64 = comma >= 0 ? raw.slice(comma + 1).trim() : raw;
  const clean = base64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) return '';
  return clean;
}

function inferMimeFromDataUrl(input = '') {
  const raw = String(input || '').trim();
  const match = raw.match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || '';
}

function normalizeAttachment(att = {}, index = 0) {
  const source = String(att.dataBase64 || att.base64 || att.dataUrl || att.sourceRef || '').trim();
  const base64 = dataUrlToBase64(source);
  const mimeType = String(att.mimeType || att.type || inferMimeFromDataUrl(att.dataUrl) || 'application/octet-stream').trim().toLowerCase();
  const name = String(att.name || `attachment-${index + 1}`).trim();
  const size = Number(att.size || byteLengthFromBase64(base64));

  if (!base64 || base64.length < 32) {
    return { ok: false, reason: 'empty_base64', name, mimeType, size };
  }
  if (!ALLOWED_MIME_RE.test(mimeType)) {
    return { ok: false, reason: 'unsupported_mime', name, mimeType, size };
  }

  const maxBytes = Number(process.env.POWERAI_MAX_INLINE_BYTES || DEFAULT_MAX_INLINE_BYTES);
  const estimatedBytes = byteLengthFromBase64(base64);
  if (estimatedBytes > maxBytes) {
    return { ok: false, reason: 'too_large', name, mimeType, size: estimatedBytes, maxBytes };
  }

  return {
    ok: true,
    name,
    mimeType,
    size: estimatedBytes || size,
    base64
  };
}

function normalizeAttachments(input = []) {
  const list = Array.isArray(input) ? input : [];
  const accepted = [];
  const rejected = [];
  list.slice(0, 6).forEach((att, index) => {
    const normalized = normalizeAttachment(att, index);
    if (normalized.ok) accepted.push(normalized);
    else rejected.push(normalized);
  });
  return { accepted, rejected };
}

function attachmentParts(attachments = []) {
  return attachments.map((att) => ({
    inline_data: {
      mime_type: att.mimeType,
      data: att.base64
    }
  }));
}

function publicAttachmentMeta(attachments = []) {
  return attachments.map(({ name, mimeType, size }) => ({ name, mimeType, size }));
}

module.exports = {
  dataUrlToBase64,
  normalizeAttachments,
  attachmentParts,
  publicAttachmentMeta,
  byteLengthFromBase64
};
