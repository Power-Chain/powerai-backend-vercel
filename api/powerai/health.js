'use strict';

module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    service: 'PowerAI Backend Proxy',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    grounding: String(process.env.POWERAI_ENABLE_GROUNDING || '1') !== '0'
  }));
};
