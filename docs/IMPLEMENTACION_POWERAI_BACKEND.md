# PowerAI Backend Proxy v4 · Fase 3

## Objetivo

Esta implementación mueve el análisis real de imagen/documento/idea a un backend público de prueba. El frontend ya no envía API keys de Gemini y ya no envía `blob:` URLs como imagen.

## Plataforma recomendada para pruebas

Vercel Hobby es la opción más rápida para probar porque despliega funciones Node.js desde la carpeta `/api` y te da un endpoint HTTPS público. No necesitas IP fija en tu computadora.

## Archivos a copiar al repo

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
tests/phase3/powerai-backend-static.test.mjs
```

## Variables de entorno en Vercel

Agrega estas variables en Project Settings → Environment Variables:

```txt
GEMINI_API_KEY=TU_API_KEY_REAL
GEMINI_MODEL=gemini-2.5-flash
GEMINI_ENDPOINT=https://generativelanguage.googleapis.com/v1beta
POWERAI_ENABLE_GROUNDING=1
POWERAI_ALLOWED_ORIGINS=*
POWERAI_MAX_INLINE_BYTES=8388608
POWERAI_MAX_BODY_BYTES=12582912
```

Para producción, cambia `POWERAI_ALLOWED_ORIGINS=*` por los dominios reales, por ejemplo:

```txt
POWERAI_ALLOWED_ORIGINS=https://powerapp.com,https://www.powerapp.com,http://127.0.0.1:5503
```

## Configuración del frontend

En tu Live Server o app local, ejecuta en consola:

```js
localStorage.setItem('powerai_mode', 'remote');
localStorage.setItem('powerai_endpoint', 'https://TU-PROYECTO.vercel.app/api/powerai/analyze-asset');
localStorage.setItem('powerai_verify_endpoint', 'https://TU-PROYECTO.vercel.app/api/powerai/verify-draft');
localStorage.removeItem('powerai_api_key');
location.reload();
```

La API key queda en Vercel, no en el navegador.

## Cómo probar health

Abre:

```txt
https://TU-PROYECTO.vercel.app/api/powerai/health
```

Debe devolver:

```json
{
  "ok": true,
  "service": "PowerAI Backend Proxy",
  "hasGeminiKey": true
}
```

## Contrato de análisis

El frontend envía:

```json
{
  "mode": "powerapp_tokenization_intake_v4",
  "provider": "powerai-backend",
  "input": {
    "ideaText": "Edificio comercial en Maracaibo",
    "notes": "Tiene locales alquilados",
    "attachments": [
      {
        "name": "edificio.jpg",
        "type": "image/jpeg",
        "size": 123456,
        "dataUrl": "data:image/jpeg;base64,..."
      }
    ]
  }
}
```

El backend extrae base64 real y llama a Gemini con `inline_data`. No usa `previewUrl` ni `blob:`.

## Grounding

`POWERAI_ENABLE_GROUNDING=1` activa la herramienta `google_search` para que Gemini pueda usar búsqueda cuando el prompt lo requiera. El backend devuelve `grounding.sources` y `grounding.queries` si Gemini genera metadata.

## Limitaciones honestas

- Si la imagen no tiene texto, ubicación ni contexto, la IA no puede identificar con certeza el edificio exacto.
- El valor financiero devuelto es preliminar y debe marcarse con `fieldMeta` como `ai` o `search`, no como certificado.
- Esta fase no despliega tokens en red. Solo analiza, genera draft, preguntas y verificación final.
