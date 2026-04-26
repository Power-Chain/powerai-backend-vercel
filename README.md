# PowerApp · PowerAI Backend Proxy v4

Este paquete implementa la corrección final para que PowerApp use análisis real con IA sin enviar `blob:` URL ni exponer API keys en el frontend.

## Qué incluye

```txt
api/powerai/analyze-asset.js
api/powerai/verify-draft.js
api/powerai/health.js
api/powerai/_lib/http.js
api/powerai/_lib/attachments.js
api/powerai/_lib/gemini.js
api/powerai/_lib/prompts.js
api/powerai/_lib/schema.js
src/modules/tokenization/aiBridge.js
vercel.json
powerai.env.example
docs/IMPLEMENTACION_POWERAI_BACKEND.md
tests/phase3/powerai-backend-static.test.mjs
```

## Funcionamiento

1. El usuario sube foto/documento o escribe idea.
2. `aiBridge.js` convierte el archivo real a `data:image/...;base64,...`.
3. El frontend manda ese DataURL al backend PowerAI, no a Gemini directo.
4. El backend extrae base64 puro y arma `inline_data` para Gemini.
5. El backend activa `google_search` si `POWERAI_ENABLE_GROUNDING=1`.
6. Gemini devuelve JSON con `assetMode`, `type`, `draftPatch`, `fieldMeta`, preguntas y warnings.
7. El frontend recibe el JSON y guía al usuario con Progressive Copilot.

## Configuración rápida

En Vercel agrega:

```txt
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
POWERAI_ENABLE_GROUNDING=1
POWERAI_ALLOWED_ORIGINS=*
```

En el navegador:

```js
localStorage.setItem('powerai_mode', 'remote');
localStorage.setItem('powerai_endpoint', 'https://TU-PROYECTO.vercel.app/api/powerai/analyze-asset');
localStorage.setItem('powerai_verify_endpoint', 'https://TU-PROYECTO.vercel.app/api/powerai/verify-draft');
localStorage.removeItem('powerai_api_key');
location.reload();
```

## Validación incluida

```bash
node --check api/powerai/analyze-asset.js
node --check api/powerai/verify-draft.js
node --check api/powerai/health.js
node --check api/powerai/_lib/http.js
node --check api/powerai/_lib/attachments.js
node --check api/powerai/_lib/gemini.js
node --check api/powerai/_lib/prompts.js
node --check api/powerai/_lib/schema.js
node --check src/modules/tokenization/aiBridge.js
node --test tests/phase3/powerai-backend-static.test.mjs
```
