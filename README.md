# YATSUMIRA

TypeScript + HTML5 Canvas + CSS + Vite.

## Main page

The left panel displays an animated eight-sector circular system visualization, inspired by the supplied reference. The right panel is a responsive chat UI. The chat accepts messages locally and clearly indicates that the AI API is not connected; no API keys are used in the browser.

The base theme remains pure black (`#000000`). No images or external fonts are loaded.

## Windows startup

Double-click `YATSUMIRA.bat`. The existing PowerShell launcher performs preflight checks, optional local Node.js installation, npm dependency setup, and starts Vite with a free port. Diagnostics are saved to ignored `.yatsumira/report.json`.

## Tests

```sh
npm install
npm run test:static
node scripts/test-cloud.mjs
npm run build
npx playwright install chromium
npm run test:browser
```

## Cloud.ru Foundation Models

The web chat and its settings use the official OpenAI-compatible Cloud.ru Foundation Models API:

- `GET https://foundation-models.api.cloud.ru/v1/models` - live models available to your key.
- `POST https://foundation-models.api.cloud.ru/v1/chat/completions` - chat with message history.
- Authentication: `Authorization: Bearer <API key>`.

In **Настройки → Подключение Cloud.ru**, paste the API Key Secret and select **Сохранить**. Then click **Загрузить модели** if necessary, and choose a model from the list. The model choice is saved locally. On Windows, the secret is encrypted for the current Windows user using DPAPI and kept in ignored `.yatsumira/cloud-key.dpapi`. The raw key is never saved in web storage or returned to the browser after setup. Changing the API key clears the selected model. On non-Windows hosts, the key is kept in server memory for the running session only (alternatively set `CLOUD_RU_API_KEY` in the server environment).

The local development server listens on `127.0.0.1` only. The Vite development middleware hosts the API endpoints: the static production build alone does **not** provide a backend. Do not expose the development server or its local API endpoints to untrusted users. Conversation context is kept only in the current browser session, not saved to disk.

API access is account-dependent, may incur charges and requires internet. No real Cloud.ru key has been used in the automated tests.

Official docs: https://cloud.ru/docs/foundation-models/ug/topics/api-ref

## NEXUS radial atlas (demonstration)

The left Canvas now renders **eight concentric rings**, weighted sectors and deterministic, non-overlapping demonstration nodes (documents, facts, agents). These are **not** yet actual RAG documents or stored memories. Future integrations should use `NexusView.setCounts(...)` and replace the demo layout with real entity records.

- Mouse wheel zooms at the pointer, from 0.55× to 5×.
- Hold the left mouse button and drag to pan.
- Click a node for its demo information card; Enter with the focused canvas selects a node.
- The card is explicitly marked `ДЕМО`; Close returns focus to Canvas.
- Off-screen nodes are culled before drawing; level-of-detail and measured FPS adjust the amount of work per frame.
- Existing black chat, Cloud.ru settings and local API proxy are unchanged.

Automated browser tests cover layout, node separation, density-weighted sectors, zoom, drag, keyboard selection, the chat and responsive viewport. These tests use mock Cloud.ru responses and no real credentials.

## NEXUS growth and persistence

New information is saved locally in `.yatsumira/knowledge.json`, which is excluded from Git and stays with your project (including on an external USB drive).

- Go to **Настройки → Развитие NEXUS**, choose a category and add a note. The graph updates immediately.
- When a Cloud.ru chat exchange succeeds, the user's message is recorded as a **non-verified conversation note** (not a verified fact); the AI answer is not automatically accepted as truth.
- Repeated identical notes are deduplicated. Connections are created only when records share at least two meaningful words; these are **lexical links**, not semantic or legal conclusions.
- Real records are highlighted within the decorative circular atlas, with the node card showing original text, provenance and unverified status.
- Local knowledge persists after reloads. The remaining background markers are decorative demonstration placeholders, not real information.
- Storage is bounded to 2,500 records. There is no semantic embedding, legal validation, document import or autonomous model training at this stage.

The local endpoints are `GET /api/knowledge/graph` and `POST /api/knowledge/ingest`, protected by the same localhost and origin checks as the Cloud.ru proxy. Do not expose the development server on a network.
