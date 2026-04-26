'use strict';

const { setCors, sendJson, readJsonBody, requirePost, normalizeError } = require('./_lib/http');
const { normalizeAttachments, publicAttachmentMeta } = require('./_lib/attachments');
const { buildVerificationPrompt } = require('./_lib/prompts');
const { geminiGenerate } = require('./_lib/gemini');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (!requirePost(req, res)) return;

  try {
    const body = await readJsonBody(req, Number(process.env.POWERAI_MAX_BODY_BYTES || 12 * 1024 * 1024));
    const input = body.input || body || {};
    const { accepted, rejected } = normalizeAttachments(input.attachments || []);
    const prompt = buildVerificationPrompt({ input, attachments: accepted, rejected });
    const result = await geminiGenerate({ prompt, attachments: accepted, verificationMode: true });

    return sendJson(res, 200, {
      ok: true,
      mode: 'powerapp_tokenization_verify_v4',
      source: 'powerai-backend',
      provider: result.provider,
      model: result.model,
      verification: result.parsed,
      grounding: result.grounding,
      attachments: {
        accepted: publicAttachmentMeta(accepted),
        rejected: rejected.map(({ name, mimeType, size, reason, maxBytes }) => ({ name, mimeType, size, reason, maxBytes }))
      }
    });
  } catch (error) {
    const normalized = normalizeError(error);
    return sendJson(res, normalized.statusCode >= 400 ? normalized.statusCode : 500, {
      ok: false,
      error: normalized.message
    });
  }
};
