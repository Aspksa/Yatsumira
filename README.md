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

New information is saved locally in `.yatsumira/yatsumira.sqlite`, which is excluded from Git and stays with your project (including on an external USB drive).

- Go to **Настройки → Развитие NEXUS**, choose a category and add a note. The graph updates immediately.
- When a Cloud.ru chat exchange succeeds, the user's message is recorded as a **non-verified conversation note** (not a verified fact); the AI answer is not automatically accepted as truth.
- Repeated identical notes are deduplicated. Connections are created only when records share at least two meaningful words; these are **lexical links**, not semantic or legal conclusions.
- Real records are highlighted within the decorative circular atlas, with the node card showing original text, provenance and unverified status.
- Local knowledge persists after reloads. The remaining background markers are decorative demonstration placeholders, not real information.
- Storage is bounded to 2,500 records. There is no semantic embedding, legal validation, document import or autonomous model training at this stage.

The local endpoints are `GET /api/knowledge/graph` and `POST /api/knowledge/ingest`, protected by the same localhost and origin checks as the Cloud.ru proxy. Do not expose the development server on a network.

## Layout matched to the supplied radial atlas reference

The NEXUS visual design places a small concentric core in the middle, dense luminous rectangular data points on the inner six rings, a deliberately quiet caption-and-connection band, and outlined circular icons on the outer two orbital rings. Radial filaments, low-opacity sector boundaries and restrained colored labels reproduce the spatial hierarchy of the supplied reference while preserving YATSUMIRA's own categories and live data. No screenshot is used as a static background: the graph remains rendered through TypeScript Canvas, supports pan, zoom, node selection, adaptive LOD and growth when local knowledge is added.

## NEXUS visualization modes and source-aware cards

The Canvas toolbar offers four real interactive layouts:

- **Кольца** — radial atlas with different vector glyphs on the outer orbit, denser inner blocks, fine links, and labels near growing topic groups.
- **Круг** — circular arrangement of sector/topic clusters.
- **Соты** — hexagonal boundaries and a staggered packing of clustered nodes.
- **Силовой** — bounded, deterministic group-level force relaxation. Known lexical links attract related groups; unrelated groups repel.
  
The selected layout is saved in browser local storage. Wheel zoom, panning, focus/Enter selection, culling and adaptive rendering remain enabled. At higher zoom levels, node titles and selected-note excerpts become visible.

A selected real record card shows its original text, topic group, sector, provenance (local note or dialogue), verification status, creation date when available, record ID, and clickable related records. A highlighted line indicates an existing lexical relationship; dashed structural links indicate **group membership**, not verified semantic relationships. Placeholder decorations are labeled **ДЕМО** and never masquerade as files.

New records stored in `.yatsumira/yatsumira.sqlite` get topic group labels derived from the first two significant words. Different topics create separate clusters, including within the main radial view. This classification is intentionally simple; semantic clustering, file upload/extraction, document metadata and RAG are future integrations.

The existing single-screen black chat, Cloud.ru connector, local-only server and Windows BAT remain unchanged.

## Reference-matched NEXUS v2 composition

The default **Кольца** view now uses a deterministic reference-style layout computed in `src/nexus-reference.ts`:

- Four asymmetric, tightly packed radial fan blocks per sector, with varying lengths and widths instead of a uniform ring of dots.
- Two concentric outer orbits with gaps, individually outlined vector pictograms and subtle colored category grouping.
- Quiet negative space between central core, labeled data blocks and outer icon orbit.
- Ultra-fine filaments from the inner clusters to the outer orbit, restrained halos, and separated captions.

This is an original programmatic Canvas rendering inspired by the supplied screenshot, **not** a screenshot background. It maintains hover/click accuracy through shared transformed positions, live local knowledge overlays, growth, pan/zoom, FPS adaptation, and all four modes. No Cloud.ru keys, chatbot configuration, or local knowledge files are modified by the design update.

## YATSUMIRA CORE v1 — local programmatic core and SQLite database

**No additional UI controls are introduced in CORE v1.** The existing NEXUS Canvas, black chat, Cloud.ru settings and four visualization modes remain as before.

The project now requires **Node.js 22 or newer** because it uses the built-in `node:sqlite` module. The Windows BAT/PowerShell launcher checks for a compatible Node installation and can obtain an official portable Node LTS version. No Python, Docker, PostgreSQL, or native SQLite npm addons are needed.

Persistent storage resides alongside the project in `.yatsumira/yatsumira.sqlite` (including when the project is on USB). The database contains:
- `core_meta`: schema version, import state, knowledge revision
- `knowledge`: unique, source-labeled notes and knowledge objects
- `knowledge_links`: lexical relationships and strength
- `conversations`: sessions
- `messages`: user/assistant exchanges saved **atomically** in one transaction
- `core_events`: local event history for tracing core operations

SQLite uses foreign key constraints, full synchronous durability, rollback-journal mode (rather than persistent WAL files), and a five-second busy timeout. A single-user localhost process owns the database. API requests are restricted to the existing loopback/origin protections.

**Existing knowledge migration:** If `.yatsumira/knowledge.json` exists, first database access imports its records, links and revision into SQLite in a transaction. The original JSON file is **never deleted or overwritten**; retain it as a backup. A malformed legacy source blocks the import rather than silently wiping data. Future restarts do not import it again. New data is saved only in SQLite. Make a backup of the `.yatsumira` directory before changing Node versions or relocating the project.

**Cloud.ru integration:** The cloud proxy saves the last user message and the model's answer together only after a successful provider response. The server does not automatically classify model output as a verified fact or silently inject unverified notes into Cloud.ru prompts. Existing chat visuals are unchanged. Earlier messages from previous versions cannot be reconstructed if they were never saved by the old server.

**Backend-only endpoints** (no new UI):
- `GET /api/core/status` — schema version and counts without exposing secrets
- `GET /api/core/history?limit=50` — persisted dialogue turns
- `GET /api/core/search?q=...` — baseline lexical lookup over stored notes
- `GET /api/knowledge/graph`, `POST /api/knowledge/ingest` — existing compatible endpoints, now backed by SQLite

This is infrastructure for later semantic memory, document RAG, legal agents and schedulers; it is **not** autonomous learning or a vector database yet. CORE tests run on Windows and Linux with temporary databases, migration fixtures, deduplication and exchange transaction checks.
