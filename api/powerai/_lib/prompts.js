'use strict';

function safeString(value, max = 4000) {
  return String(value || '').slice(0, max);
}

function buildAnalysisPrompt({ input = {}, attachments = [], rejected = [] } = {}) {
  const ideaText = safeString(input.ideaText || input.idea || '', 3000);
  const notes = safeString(input.notes || '', 5000);
  const userContext = input.userContext || {};
  const hasAttachments = attachments.length > 0;

  return `
Eres PowerAI, copiloto de tokenización para PowerApp/PowerChain.

OBJETIVO
Analiza la imagen/documento/idea enviada por el usuario y devuelve un JSON válido para crear un borrador de tokenización. Debes distinguir si el usuario quiere tokenizar un activo físico real o una imagen/obra digital.

REGLAS CRÍTICAS
1. Si la imagen muestra un edificio, casa, terreno, maquinaria, lingote, joya, vehículo, inventario físico o infraestructura, clasifica assetMode como "real_world_asset" y sugiere tokenType "rwa" salvo que haya señales fuertes de security.
2. Si la imagen es arte digital, avatar, logo, meme, ilustración o pieza coleccionable sin activo físico, clasifica assetMode como "digital_collectible" y sugiere tokenType "nft".
3. Si la imagen muestra un activo físico con un símbolo digital encima, ejemplo Dogecoin sobre un edificio, separa el activo físico del overlay y advierte que el overlay no prueba titularidad.
4. No declares nada como verified/certified. Todo es preliminar.
5. Si no puedes ubicar el activo, no inventes dirección. Pregunta ciudad/país/dirección.
6. Si usas búsqueda/grounding, distingue claramente dato encontrado vs inferencia.
7. No des consejos legales definitivos. Usa "requiere revisión" cuando aplique.
8. Devuelve SOLO JSON, sin markdown.

CONTEXTO DEL USUARIO
Idea: ${ideaText || '(sin idea escrita)'}
Notas: ${notes || '(sin notas)'}
País indicado por app/usuario: ${safeString(userContext.country || '', 200) || 'no indicado'}
Ciudad indicada por app/usuario: ${safeString(userContext.city || '', 200) || 'no indicada'}
Adjuntos válidos recibidos por backend: ${attachments.length}
Adjuntos rechazados por backend: ${rejected.length}

ESQUEMA JSON OBLIGATORIO
{
  "type": "rwa | nft | utility | security | stream",
  "assetMode": "real_world_asset | digital_collectible | documentary_asset | idea_only | ambiguous",
  "chain": "powerchain | ethereum | bsc | solana | tron | bitcoin",
  "standard": "erc20 | erc721 | erc1155 | erc3643 | spl | token2022 | managed",
  "confidence": 0.0,
  "name": "Nombre comercial sugerido",
  "symbol": "SIMBOLO",
  "description": "Descripción clara y útil para el borrador",
  "rationale": "Explica brevemente por qué clasificaste así",
  "classification": {
    "tokenType": "rwa | nft | utility | security | stream",
    "assetMode": "real_world_asset | digital_collectible | documentary_asset | idea_only | ambiguous",
    "assetClass": "real_estate | vehicle | commodity | jewelry | art | media | document | project | service | stream | other",
    "confidence": 0.0,
    "reason": ""
  },
  "visualFindings": {
    "summary": "Qué se ve en la imagen o documento",
    "objects": [],
    "textDetected": [],
    "appearsPhysical": true,
    "appearsDigitalArt": false,
    "condition": "unknown | poor | fair | good | excellent"
  },
  "locationClues": {
    "hasLocationClues": false,
    "possibleCountry": "",
    "possibleRegion": "",
    "possibleCity": "",
    "addressText": "",
    "locationConfidence": 0.0
  },
  "analysis": {
    "assetClass": "",
    "assetMode": "",
    "visualSummary": "",
    "tokenizationIdea": "",
    "approxValueUsd": 0,
    "approxValueLowUsd": 0,
    "approxValueHighUsd": 0,
    "monthlyIncome": 0,
    "occupancyPct": 0,
    "yieldPct": 0,
    "supplyRecommended": 0,
    "decimals": 0,
    "currency": "USD",
    "riskNotes": "",
    "liquidityNotes": ""
  },
  "draftPatch": {
    "type": "",
    "chain": "",
    "standard": "",
    "metadata": { "name": "", "symbol": "", "description": "" },
    "economics": { "supply": 0, "decimals": 0, "supplyMode": "fixed" },
    "financial": { "currency": "USD", "initialPrice": 0, "economicsModel": "", "payoutFrequency": "none", "paymentMethod": "stablecoin" },
    "marketContext": { "country": "", "region": "", "city": "", "zoneType": "", "demographicNotes": "", "estimatedTraffic": "", "incomeLevel": "", "demandDrivers": [] },
    "assetMetrics": { "areaSqm": 0, "energyConsumptionKwhMonth": 0, "usageType": "", "condition": "", "estimatedAge": "", "visibleRisks": [] },
    "compliance": { "issuerName": "", "jurisdiction": "", "assetReference": "", "ownershipSupport": "", "restrictions": "", "regulatoryRisk": "" },
    "technical": { "contractMode": "managed", "editableContract": false, "constructorArgs": "", "customContractSource": "" },
    "rights": { "transferable": true, "mintable": false, "burnable": false, "royaltyBps": 0 }
  },
  "fieldMeta": {
    "metadata.name": { "source": "ai", "confidence": 0.0, "reason": "", "needsUserConfirmation": false },
    "financial.approxValueUsd": { "source": "ai | search | manual | document", "confidence": 0.0, "reason": "", "needsUserConfirmation": true }
  },
  "questions": [
    { "field": "marketContext.city", "question": "¿En qué ciudad está ubicado el activo?", "priority": "high" }
  ],
  "missingFields": [],
  "warnings": [],
  "assumptions": []
}
`;
}

function buildVerificationPrompt({ input = {}, attachments = [], rejected = [] } = {}) {
  const draft = JSON.stringify(input.draft || {}, null, 2).slice(0, 25000);
  const fieldMeta = JSON.stringify(input.fieldMeta || {}, null, 2).slice(0, 12000);
  const userEdits = JSON.stringify(input.userEdits || {}, null, 2).slice(0, 12000);

  return `
Eres PowerAI en modo VERIFICACIÓN FINAL de un borrador de tokenización.

OBJETIVO
Revisa coherencia del draft completo antes de guardar. No despliegues, no certifiques, no declares cumplimiento final. Devuelve readiness preliminar, riesgos, inconsistencias y preguntas faltantes.

REGLAS
1. Nunca devuelvas verified/certified.
2. Si un valor financiero parece inventado o no confirmado, marca warning y needsUserConfirmation.
3. Si el assetMode es ambiguo, solicita aclaración.
4. Si hay RWA sin ubicación, emisor, jurisdicción o evidencia de propiedad, marca faltante crítico.
5. Devuelve SOLO JSON.

DRAFT
${draft}

FIELD_META
${fieldMeta}

USER_EDITS
${userEdits}

ADJUNTOS VALIDOS: ${attachments.length}
ADJUNTOS RECHAZADOS: ${rejected.length}

ESQUEMA JSON
{
  "ok": true,
  "readinessScore": 0,
  "status": "draft_ready | needs_user_input | high_risk | incomplete",
  "summary": "",
  "criticalIssues": [],
  "warnings": [],
  "missingFields": [],
  "questions": [],
  "fieldMetaPatch": {},
  "recommendations": [],
  "canSaveDraft": true,
  "canPrepareDeployPlan": false
}
`;
}

module.exports = {
  buildAnalysisPrompt,
  buildVerificationPrompt
};
