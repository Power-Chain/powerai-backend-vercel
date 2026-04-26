'use strict';

const DEFAULT_SUGGESTION = Object.freeze({
  type: 'utility',
  chain: 'powerchain',
  standard: 'managed',
  confidence: 0.35,
  assetMode: 'ambiguous',
  name: 'Power Token Draft',
  symbol: 'PWRD',
  description: '',
  rationale: '',
  missingFields: [],
  warnings: [],
  questions: [],
  assumptions: [],
  analysis: {
    assetClass: 'other',
    visualSummary: '',
    locationConfidence: 0,
    approxValueUsd: 0,
    approxValueLowUsd: 0,
    approxValueHighUsd: 0,
    monthlyIncome: 0,
    yieldPct: 0,
    occupancyPct: 0,
    supplyRecommended: 1000,
    decimals: 6,
    currency: 'USD',
    riskNotes: '',
    liquidityNotes: ''
  },
  draftPatch: {
    type: 'utility',
    chain: 'powerchain',
    standard: 'managed',
    metadata: { name: '', symbol: '', description: '' },
    economics: { supply: 1000, decimals: 6, supplyMode: 'fixed' },
    financial: { currency: 'USD', initialPrice: 0, economicsModel: '', payoutFrequency: 'none', paymentMethod: 'stablecoin' },
    marketContext: { country: '', region: '', city: '', zoneType: '', demographicNotes: '', estimatedTraffic: '', incomeLevel: '', demandDrivers: [] },
    assetMetrics: { areaSqm: 0, energyConsumptionKwhMonth: 0, usageType: '', condition: '', estimatedAge: '', visibleRisks: [] },
    compliance: { issuerName: '', jurisdiction: '', assetReference: '', ownershipSupport: '', restrictions: '', regulatoryRisk: '' },
    technical: { contractMode: 'managed', editableContract: false, constructorArgs: '', customContractSource: '' },
    rights: { transferable: true, mintable: false, burnable: false, royaltyBps: 0 }
  },
  fieldMeta: {}
});

function clampNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeType(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (['rwa', 'nft', 'utility', 'security', 'stream'].includes(raw)) return raw;
  if (raw.includes('real') || raw.includes('inmueble') || raw.includes('asset')) return 'rwa';
  if (raw.includes('collect') || raw.includes('art') || raw.includes('image')) return 'nft';
  return DEFAULT_SUGGESTION.type;
}

function normalizeAssetMode(value, type) {
  const raw = String(value || '').toLowerCase().trim();
  if (['real_world_asset', 'digital_collectible', 'documentary_asset', 'idea_only', 'ambiguous'].includes(raw)) return raw;
  if (type === 'rwa' || type === 'security') return 'real_world_asset';
  if (type === 'nft') return 'digital_collectible';
  return 'ambiguous';
}

function normalizeSuggestion(input = {}) {
  const src = input?.suggestion || input || {};
  const draftPatch = src.draftPatch || src.autofill || {};
  const analysis = { ...DEFAULT_SUGGESTION.analysis, ...(src.analysis || {}) };
  const type = normalizeType(src.type || src.tokenType || src.classification?.tokenType || draftPatch.type);
  const assetMode = normalizeAssetMode(src.assetMode || src.classification?.assetMode || analysis.assetMode, type);
  const chain = String(src.chain || draftPatch.chain || DEFAULT_SUGGESTION.chain).toLowerCase().trim() || DEFAULT_SUGGESTION.chain;
  const standard = String(src.standard || draftPatch.standard || (type === 'nft' ? 'erc721' : type === 'rwa' ? 'erc3643' : 'erc20')).toLowerCase();
  const name = String(src.name || draftPatch.metadata?.name || DEFAULT_SUGGESTION.name).slice(0, 80);
  const symbol = String(src.symbol || draftPatch.metadata?.symbol || DEFAULT_SUGGESTION.symbol).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || DEFAULT_SUGGESTION.symbol;
  const description = String(src.description || draftPatch.metadata?.description || analysis.description || '').slice(0, 1800);
  const supply = clampNumber(draftPatch.economics?.supply ?? analysis.supplyRecommended ?? src.supplyRecommended, type === 'nft' ? 1 : 1000, 1, 1_000_000_000_000);
  const decimals = clampNumber(draftPatch.economics?.decimals ?? analysis.decimals, type === 'nft' ? 0 : 6, 0, 18);

  return {
    ...DEFAULT_SUGGESTION,
    ...src,
    type,
    chain,
    standard,
    assetMode,
    confidence: clampNumber(src.confidence || src.classification?.confidence, DEFAULT_SUGGESTION.confidence, 0, 1),
    name,
    symbol,
    description,
    rationale: String(src.rationale || src.reason || src.classification?.reason || '').slice(0, 1200),
    missingFields: asArray(src.missingFields),
    warnings: asArray(src.warnings),
    questions: asArray(src.questions),
    assumptions: asArray(src.assumptions),
    analysis: {
      ...analysis,
      assetMode,
      approxValueUsd: clampNumber(analysis.approxValueUsd, 0, 0),
      approxValueLowUsd: clampNumber(analysis.approxValueLowUsd, 0, 0),
      approxValueHighUsd: clampNumber(analysis.approxValueHighUsd, 0, 0),
      monthlyIncome: clampNumber(analysis.monthlyIncome, 0, 0),
      yieldPct: clampNumber(analysis.yieldPct, 0, 0, 100),
      occupancyPct: clampNumber(analysis.occupancyPct, 0, 0, 100),
      supplyRecommended: supply,
      decimals
    },
    draftPatch: {
      ...DEFAULT_SUGGESTION.draftPatch,
      ...draftPatch,
      type,
      chain,
      standard,
      metadata: {
        ...DEFAULT_SUGGESTION.draftPatch.metadata,
        ...(draftPatch.metadata || {}),
        name,
        symbol,
        description
      },
      economics: {
        ...DEFAULT_SUGGESTION.draftPatch.economics,
        ...(draftPatch.economics || {}),
        supply,
        decimals
      },
      financial: {
        ...DEFAULT_SUGGESTION.draftPatch.financial,
        ...(draftPatch.financial || {}),
        currency: String(draftPatch.financial?.currency || analysis.currency || 'USD').toUpperCase()
      },
      marketContext: { ...DEFAULT_SUGGESTION.draftPatch.marketContext, ...(draftPatch.marketContext || {}) },
      assetMetrics: { ...DEFAULT_SUGGESTION.draftPatch.assetMetrics, ...(draftPatch.assetMetrics || {}) },
      compliance: { ...DEFAULT_SUGGESTION.draftPatch.compliance, ...(draftPatch.compliance || {}) },
      technical: { ...DEFAULT_SUGGESTION.draftPatch.technical, ...(draftPatch.technical || {}) },
      rights: { ...DEFAULT_SUGGESTION.draftPatch.rights, ...(draftPatch.rights || {}) }
    },
    fieldMeta: src.fieldMeta && typeof src.fieldMeta === 'object' ? src.fieldMeta : {}
  };
}

module.exports = {
  DEFAULT_SUGGESTION,
  normalizeSuggestion
};
