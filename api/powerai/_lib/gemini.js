'use strict';

const { attachmentParts } = require('./attachments');
const { normalizeSuggestion } = require('./schema');

function stripJsonFences(text = '') {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJsonLoose(text = '') {
  const clean = stripJsonFences(text);
  try { return JSON.parse(clean); } catch {}
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(clean.slice(first, last + 1)); } catch {}
  }
  return null;
}

function extractText(data = {}) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractGrounding(data = {}) {
  const chunks = [];
  const queries = [];
  for (const candidate of data.candidates || []) {
    const meta = candidate?.groundingMetadata || candidate?.grounding_metadata || {};
    for (const q of meta.webSearchQueries || meta.web_search_queries || []) queries.push(q);
    for (const chunk of meta.groundingChunks || meta.grounding_chunks || []) {
      const web = chunk.web || {};
      if (web.uri || web.title) chunks.push({ title: web.title || '', uri: web.uri || '' });
    }
  }
  return { queries: [...new Set(queries)], sources: chunks.slice(0, 12) };
}

function buildPayload({ prompt, attachments = [], grounding = true, forceJson = true } = {}) {
  const parts = [{ text: prompt }, ...attachmentParts(attachments)];
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9
    }
  };
  if (forceJson) payload.generationConfig.responseMimeType = 'application/json';
  if (grounding) payload.tools = [{ google_search: {} }];
  return payload;
}

async function geminiGenerate({ prompt, attachments = [], verificationMode = false } = {}) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY no está configurada en variables de entorno.');
    err.statusCode = 500;
    throw err;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = (process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const useGrounding = String(process.env.POWERAI_ENABLE_GROUNDING || '1') !== '0' && !verificationMode;
  const url = `${endpoint}/models/${encodeURIComponent(model)}:generateContent`;

  let payload = buildPayload({ prompt, attachments, grounding: useGrounding, forceJson: true });
  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  let raw = await response.text();
  if (!response.ok && useGrounding && /responseMimeType|response_mime_type|JSON|tool/i.test(raw)) {
    payload = buildPayload({ prompt, attachments, grounding: useGrounding, forceJson: false });
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });
    raw = await response.text();
  }

  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const message = data?.error?.message || raw || `Gemini HTTP ${response.status}`;
    const err = new Error(message);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  const text = extractText(data || {});
  if (!text) {
    const err = new Error('Gemini devolvió una respuesta vacía.');
    err.statusCode = 502;
    err.details = data;
    throw err;
  }

  const parsed = parseJsonLoose(text);
  if (!parsed) {
    const err = new Error('Gemini no devolvió JSON válido.');
    err.statusCode = 502;
    err.rawText = text.slice(0, 2000);
    throw err;
  }

  return {
    parsed,
    suggestion: verificationMode ? parsed : normalizeSuggestion(parsed),
    grounding: extractGrounding(data || {}),
    model,
    provider: 'gemini'
  };
}

module.exports = {
  geminiGenerate,
  parseJsonLoose,
  stripJsonFences,
  extractGrounding
};
