/**
 * src/modules/tokenization/aiBridge.js
 * PowerAI Bridge v4 — Backend proxy + imagen/documento real.
 *
 * Reglas de esta versión:
 * - El frontend NO envía API keys de Gemini.
 * - El frontend NO envía blob: URL como si fuera imagen real.
 * - Los adjuntos se leen como DataURL y el backend extrae base64 real.
 * - Modo recomendado: remote -> POST /api/powerai/analyze-asset.
 * - Mock queda solo para demo/offline.
 */

const DEFAULT_CONFIG = Object.freeze({
  mode: 'remote', // remote | mock
  provider: 'powerai-backend',
  endpoint: '/api/powerai/analyze-asset',
  verifyEndpoint: '/api/powerai/verify-draft',
  timeoutMs: 60000,
  allowMockFallback: false
});

function safeGet(key, fallback = '') {
  try { return globalThis.localStorage?.getItem(key) || fallback; } catch { return fallback; }
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

export function loadPowerAIConfig() {
  const w = globalThis.POWERAI_CONFIG || {};
  const mode = String(pickFirst(w.mode, safeGet('powerai_mode'), DEFAULT_CONFIG.mode)).toLowerCase();
  return {
    mode: ['remote', 'mock'].includes(mode) ? mode : DEFAULT_CONFIG.mode,
    provider: String(pickFirst(w.provider, safeGet('powerai_provider'), DEFAULT_CONFIG.provider)),
    endpoint: String(pickFirst(w.endpoint, safeGet('powerai_endpoint'), DEFAULT_CONFIG.endpoint)),
    verifyEndpoint: String(pickFirst(w.verifyEndpoint, safeGet('powerai_verify_endpoint'), DEFAULT_CONFIG.verifyEndpoint)),
    timeoutMs: Number(pickFirst(w.timeoutMs, safeGet('powerai_timeout_ms'), DEFAULT_CONFIG.timeoutMs)),
    allowMockFallback: String(pickFirst(w.allowMockFallback, safeGet('powerai_allow_mock_fallback'), '0')) === '1'
  };
}

function dataUrlToBase64(dataUrl = '') {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  const idx = raw.indexOf(',');
  const clean = (idx >= 0 ? raw.slice(idx + 1) : raw).replace(/\s+/g, '');
  return /^[A-Za-z0-9+/=]+$/.test(clean) ? clean : '';
}

function inferMimeFromDataUrl(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || '';
}

export async function fileToAttachment(file) {
  if (!file) return null;
  const dataUrl = await new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    } catch {
      resolve('');
    }
  });

  const base64 = dataUrlToBase64(dataUrl);
  if (!base64 || base64.length < 32) {
    return {
      name: file.name || 'attachment',
      type: file.type || inferMimeFromDataUrl(dataUrl) || 'application/octet-stream',
      size: Number(file.size || 0),
      dataUrl: '',
      previewUrl: '',
      invalid: true,
      reason: 'No se pudo leer el archivo como base64 real.'
    };
  }

  let previewUrl = '';
  try {
    if (file.type?.startsWith('image/')) previewUrl = URL.createObjectURL(file);
  } catch {}

  return {
    name: file.name || 'attachment',
    type: file.type || inferMimeFromDataUrl(dataUrl) || 'application/octet-stream',
    size: Number(file.size || 0),
    dataUrl,
    previewUrl,
    invalid: false
  };
}

function sanitizeAttachmentForTransport(att = {}) {
  const dataUrl = String(att.dataUrl || '');
  const base64 = dataUrlToBase64(dataUrl || att.dataBase64 || att.base64 || '');
  const mimeType = String(att.type || att.mimeType || inferMimeFromDataUrl(dataUrl) || 'application/octet-stream');
  if (!base64 || base64.length < 32) return null;
  return {
    name: String(att.name || 'attachment'),
    type: mimeType,
    mimeType,
    size: Number(att.size || 0),
    dataUrl: dataUrl || `data:${mimeType};base64,${base64}`
  };
}

function sanitizeInputForRemote(input = {}) {
  const attachments = Array.isArray(input.attachments)
    ? input.attachments.map(sanitizeAttachmentForTransport).filter(Boolean)
    : [];
  return {
    ...input,
    attachments,
    // Evita enviar AbortSignal u objetos no serializables.
    signal: undefined
  };
}

async function postJsonWithTimeout(url, payload, { signal, timeoutMs = DEFAULT_CONFIG.timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs || DEFAULT_CONFIG.timeoutMs));

  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PowerApp-Client': 'powerapp-web'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      throw new Error(json?.error || json?.message || text || `HTTP ${res.status}`);
    }
    return json || {};
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener?.('abort', abortFromCaller);
  }
}

async function callRemoteAnalyzer(input = {}) {
  const config = loadPowerAIConfig();
  if (!config.endpoint) throw new Error('No hay endpoint PowerAI configurado.');

  const payload = {
    mode: 'powerapp_tokenization_intake_v4',
    provider: config.provider,
    input: sanitizeInputForRemote(input)
  };

  const response = await postJsonWithTimeout(config.endpoint, payload, {
    signal: input.signal,
    timeoutMs: config.timeoutMs
  });

  const suggestion = normalizeRemoteSuggestion(response);
  suggestion.transport = {
    endpoint: config.endpoint,
    provider: response.provider || config.provider,
    model: response.model || '',
    grounding: response.grounding || null,
    attachments: response.attachments || null
  };
  return suggestion;
}

export async function verifyTokenizationDraft({ draft = {}, fieldMeta = {}, attachments = [], userEdits = {}, notes = '' } = {}) {
  const config = loadPowerAIConfig();
  const endpoint = config.verifyEndpoint || String(config.endpoint || '').replace(/\/analyze-asset\/?$/, '/verify-draft');
  if (!endpoint) throw new Error('No hay endpoint de verificación PowerAI configurado.');

  const payload = {
    mode: 'powerapp_tokenization_verify_v4',
    provider: config.provider,
    input: sanitizeInputForRemote({ draft, fieldMeta, attachments, userEdits, notes })
  };

  const response = await postJsonWithTimeout(endpoint, payload, { timeoutMs: config.timeoutMs });
  const verification = response.verification || response;
  return {
    ok: !!(response.ok ?? verification.ok ?? true),
    source: response.source || 'powerai-backend',
    readinessScore: Number(verification.readinessScore || 0),
    warnings: Array.isArray(verification.warnings) ? verification.warnings : [],
    missingFields: Array.isArray(verification.missingFields) ? verification.missingFields : [],
    questions: Array.isArray(verification.questions) ? verification.questions : [],
    verification,
    grounding: response.grounding || null,
    checkedAt: Date.now()
  };
}

export async function analyzeTokenizationInput(input = {}) {
  const config = loadPowerAIConfig();
  if (config.mode === 'remote') {
    try {
      const suggestion = await callRemoteAnalyzer(input);
      globalThis.__POWERAI_LAST_ANALYSIS__ = suggestion;
      return suggestion;
    } catch (error) {
      console.error('[PowerAI] Error remoto:', error?.message || error);
      if (input.signal?.aborted) throw error;
      if (!config.allowMockFallback) throw error;
      console.warn('[PowerAI] Fallback mock habilitado por powerai_allow_mock_fallback=1');
    }
  }

  const mock = buildMockSuggestion(input);
  globalThis.__POWERAI_LAST_ANALYSIS__ = mock;
  return mock;
}

function normalizeRemoteSuggestion(response = {}) {
  const src = response.suggestion || response.result || response;
  return normalizeSuggestion(src);
}

function normalizeSuggestion(src = {}) {
  const type = normalizeType(src.type || src.tokenType || src.classification?.tokenType || src.draftPatch?.type);
  const assetMode = normalizeAssetMode(src.assetMode || src.classification?.assetMode || src.analysis?.assetMode, type);
  const chain = String(src.chain || src.draftPatch?.chain || 'powerchain').toLowerCase();
  const standard = String(src.standard || src.draftPatch?.standard || (type === 'nft' ? 'erc721' : type === 'rwa' ? 'erc3643' : 'erc20')).toLowerCase();
  const analysis = { ...(src.analysis || {}), assetMode };
  const name = String(src.name || src.draftPatch?.metadata?.name || 'Power Token Draft').slice(0, 80);
  const symbol = String(src.symbol || src.draftPatch?.metadata?.symbol || 'PWRD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PWRD';
  const description = String(src.description || src.draftPatch?.metadata?.description || analysis.description || '').slice(0, 1800);
  const supply = Number(src.draftPatch?.economics?.supply || analysis.supplyRecommended || (type === 'nft' ? 1 : 1000));
  const decimals = Number(src.draftPatch?.economics?.decimals ?? analysis.decimals ?? (type === 'nft' ? 0 : 6));

  return {
    ...src,
    source: src.source || 'powerai-backend',
    type,
    assetMode,
    chain,
    standard,
    confidence: Math.max(0, Math.min(1, Number(src.confidence || src.classification?.confidence || 0.35))),
    name,
    symbol,
    description,
    rationale: String(src.rationale || src.reason || src.classification?.reason || ''),
    missingFields: Array.isArray(src.missingFields) ? src.missingFields : [],
    warnings: Array.isArray(src.warnings) ? src.warnings : [],
    questions: Array.isArray(src.questions) ? src.questions : [],
    assumptions: Array.isArray(src.assumptions) ? src.assumptions : [],
    analysis: {
      assetClass: analysis.assetClass || src.classification?.assetClass || 'other',
      visualSummary: analysis.visualSummary || src.visualFindings?.summary || '',
      tokenizationIdea: analysis.tokenizationIdea || '',
      approxValueUsd: Number(analysis.approxValueUsd || 0),
      approxValueLowUsd: Number(analysis.approxValueLowUsd || 0),
      approxValueHighUsd: Number(analysis.approxValueHighUsd || 0),
      monthlyIncome: Number(analysis.monthlyIncome || 0),
      occupancyPct: Number(analysis.occupancyPct || 0),
      yieldPct: Number(analysis.yieldPct || 0),
      supplyRecommended: supply,
      decimals,
      currency: analysis.currency || 'USD',
      riskNotes: analysis.riskNotes || '',
      liquidityNotes: analysis.liquidityNotes || '',
      assetMode
    },
    draftPatch: {
      ...(src.draftPatch || {}),
      type,
      chain,
      standard,
      metadata: {
        ...(src.draftPatch?.metadata || {}),
        name,
        symbol,
        description
      },
      economics: {
        ...(src.draftPatch?.economics || {}),
        supply,
        decimals,
        supplyMode: src.draftPatch?.economics?.supplyMode || 'fixed'
      }
    },
    fieldMeta: src.fieldMeta && typeof src.fieldMeta === 'object' ? src.fieldMeta : {}
  };
}

function normalizeType(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (['rwa', 'nft', 'utility', 'security', 'stream'].includes(raw)) return raw;
  if (raw.includes('real') || raw.includes('asset') || raw.includes('inmueble')) return 'rwa';
  if (raw.includes('art') || raw.includes('collectible')) return 'nft';
  return 'utility';
}

function normalizeAssetMode(value, type) {
  const raw = String(value || '').toLowerCase().trim();
  if (['real_world_asset', 'digital_collectible', 'documentary_asset', 'idea_only', 'ambiguous'].includes(raw)) return raw;
  if (type === 'rwa' || type === 'security') return 'real_world_asset';
  if (type === 'nft') return 'digital_collectible';
  return 'ambiguous';
}

function buildMockSuggestion(input = {}) {
  const text = [input.ideaText, input.notes].filter(Boolean).join(' ').toLowerCase();
  const hasImage = Array.isArray(input.attachments) && input.attachments.some((a) => String(a.type || a.mimeType || '').startsWith('image/'));
  const type = /edificio|casa|terreno|inmueble|joya|lingote|plata|cobre|oro|maquinaria|veh[ií]culo/.test(text) || hasImage ? 'rwa' : /nft|arte|imagen|coleccionable/.test(text) ? 'nft' : 'utility';
  const assetMode = type === 'nft' ? 'digital_collectible' : type === 'rwa' ? 'real_world_asset' : 'ambiguous';
  return normalizeSuggestion({
    source: 'mock',
    type,
    assetMode,
    chain: type === 'nft' ? 'solana' : 'powerchain',
    standard: type === 'nft' ? 'token2022' : type === 'rwa' ? 'erc3643' : 'erc20',
    confidence: 0.62,
    name: type === 'rwa' ? 'Activo Tokenizado' : type === 'nft' ? 'Colección Digital' : 'Utility Token',
    symbol: type === 'rwa' ? 'RWA' : type === 'nft' ? 'NFT' : 'UTIL',
    description: 'Sugerencia local de demostración. Activa el backend PowerAI para análisis real.',
    rationale: 'Mock local usado porque PowerAI remoto no está configurado o falló con fallback permitido.',
    questions: [{ field: 'marketContext.city', question: '¿En qué ciudad o región está ubicado el activo?', priority: 'high' }],
    warnings: ['Resultado mock: no usar como análisis real.'],
    analysis: { assetClass: type === 'rwa' ? 'real_estate' : type === 'nft' ? 'art' : 'service', supplyRecommended: type === 'nft' ? 1 : 1000, decimals: type === 'nft' ? 0 : 6 }
  });
}

export default {
  loadPowerAIConfig,
  fileToAttachment,
  analyzeTokenizationInput,
  verifyTokenizationDraft
};
