import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const aiBridge = read('src/modules/tokenization/aiBridge.js');
const analyze = read('api/powerai/analyze-asset.js');
const gemini = read('api/powerai/_lib/gemini.js');
const attachments = read('api/powerai/_lib/attachments.js');
const prompts = read('api/powerai/_lib/prompts.js');

assert.match(aiBridge, /powerapp_tokenization_intake_v4/);
assert.match(aiBridge, /fileToAttachment/);
assert.match(aiBridge, /sanitizeAttachmentForTransport/);
assert.match(aiBridge, /removeItem\('powerai_api_key'\)|powerai_api_key|API keys?/i);
assert.doesNotMatch(aiBridge, /blob:http/);

assert.match(analyze, /normalizeAttachments/);
assert.match(analyze, /geminiGenerate/);
assert.match(gemini, /google_search/);
assert.match(gemini, /responseMimeType/);
assert.match(attachments, /inline_data|dataUrlToBase64|empty_base64/);
assert.match(prompts, /assetMode/);
assert.match(prompts, /real_world_asset/);
assert.match(prompts, /digital_collectible/);

console.log('powerai-backend-static: 12/12 passed');
