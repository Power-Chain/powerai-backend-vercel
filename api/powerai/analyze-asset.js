'use strict';

const { setCors, sendJson, readJsonBody, requirePost, normalizeError } = require('./_lib/http');
const { normalizeAttachments, publicAttachmentMeta } = require('./_lib/attachments');
const { buildAnalysisPrompt } = require('./_lib/prompts');
const { geminiGenerate } = require('./_lib/gemini');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (!requirePost(req, res)) return;

  try {
    const body = await readJsonBody(req, Number(process.env.POWERAI_MAX_BODY_BYTES || 12 * 1024 * 1024));
    const input = body.input || body || {};
    const { accepted, rejected } = normalizeAttachments(input.attachments || []);

    const hasText = String(input.ideaText || input.idea || input.notes || '').trim().length >= 3;
    if (!hasText && accepted.length === 0) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Envía una foto/documento válido o una descripción breve del activo.'
      });
    }

    const prompt = buildAnalysisPrompt({ input, attachments: accepted, rejected });
    const result = await geminiGenerate({ prompt, attachments: accepted, verificationMode: false });

    return sendJson(res, 200, {
      ok: true,
      mode: 'powerapp_tokenization_intake_v4',
      source: 'powerai-backend',
      provider: result.provider,
      model: result.model,
      suggestion: result.suggestion,
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
