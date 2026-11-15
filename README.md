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

The local development server listens on `127.0.0.1` only. The Vite development middleware hosts the API endpoints: the static production build alone does **not** provide a backend. Do not expose the development server or its local API endpoints to untrusted users. The browser keeps its active message context in memory; completed Cloud.ru user/assistant exchanges are also saved atomically by YATSUMIRA CORE in local SQLite.

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


### CORE maintenance — no UI changes

Run these commands in the project directory (the same directory as `YATSUMIRA.bat`), with Node.js 22+:

```powershell
node scripts/core-maintenance.mjs status
node scripts/core-maintenance.mjs check
node scripts/core-maintenance.mjs backup
node scripts/core-maintenance.mjs list
```

- `status` returns schema version and counts, without exposing messages or keys.
- `check` runs SQLite `integrity_check`, foreign-key checks and finds incomplete user/assistant exchanges. A failed check exits with code 2.
- `backup` creates a **consistent SQLite snapshot** in `.yatsumira/backups/` using SQLite's `VACUUM INTO`, verifies the resulting file, and reports its SHA-256 hash.
- `list` lists saved backup filenames. Backups are **not automatically deleted** and should be copied off the USB drive if they need to survive drive loss.

The backup covers **the SQLite database only**. It does not contain your Windows-encrypted Cloud.ru API key, Cloud settings, external documents or the old `knowledge.json` migration source. For a full relocation backup, copy the project and its hidden `.yatsumira` folder securely while the server is stopped. Do not publish backups to GitHub: they contain private conversations and notes.

Automated `scripts/test-maintenance.mjs` validates backups, snapshot independence, corruption/foreign-key inspection and detection of interrupted exchanges on both Linux and Windows. No Docker, Python, external SQLite service or new interface controls are used.


## CORE v2 — long-term memory (backend only; no GUI changes)

The project now stores persistent long-term memory in the same portable \`.yatsumira/yatsumira.sqlite\` database. Existing notes, graph links, complete assistant/user exchanges, Windows startup, Cloud.ru settings and web interface are preserved.

**Memory layers:**
- **Knowledge** — deduplicated source-labeled notes imported from the old knowledge store and new data.
- **Episodes** — user's meaningful conversation turns, indexed after an assistant response is successfully saved. Generated assistant messages are **not** treated as user facts.
- **Manual memories** — explicitly entered records with importance and immutable provenance.
- **Associations** — lexical links between related memories; these do not imply truth, causal relationships or legal conclusions.
- **Temporal changes** — records can be superseded or retracted while retaining a historical audit trail. Old or retracted versions are excluded from active retrieval.

**Retrieval** combines SQLite **FTS5**, Russian/English word prefixes, character n-gram similarity, deduplication, importance, verification/confidence, and recency ranking. Only relevant, bounded context is sent to Cloud.ru before a chat response, annotated as *untrusted historical information* (never system instructions). Unverified information remains unverified. Credential-like snippets are filtered from automatic recall, but users should still avoid storing secrets in notes.

**No embedding or rerank model is claimed:** the Foundation Models public OpenAPI currently documents \`/models\` and \`/chat/completions\`, not a confirmed embedding endpoint. The hybrid retrieval works with no extra software, Ollama, Docker or database service, including offline. Cloud.ru is required only to generate AI chat responses.

**Local commands (no new UI):**

\`\`\`powershell
node scripts/memory.mjs status
node scripts/memory.mjs recall "срок оплаты договора"
node scripts/memory.mjs remember "Сохранить важное правило предприятия"
node scripts/memory.mjs replace RECORD_ID "Исправленная версия правила"
node scripts/memory.mjs retract RECORD_ID
\`\`\`

Replacing a record creates a new version, marks the previous version as superseded and preserves its provenance. Retraction disables a record in active recall but **does not securely erase its original text** from the database or backups. For confidential data removal, handle both the source SQLite file and backups separately.

Backend routes (under existing localhost/origin restrictions) are \`GET /api/core/memory/status\` and \`GET /api/core/memory/search?q=...\`. CORE v2 migration runs automatically and transactionally on the first access; backed-up v1 SQLite and the legacy \`knowledge.json\` are not destroyed. Tests cover migration, deduplication, provenance, dialogue continuity, memory recall into Cloud.ru, source safety, temporal revisions, FTS5 integrity, and Windows/Linux portability.

## CORE v3 — all ten back-end memory extensions (no visual changes)

SQLite schema v3 extends the same portable local database. No HTML/CSS/Canvas or chat interface has been modified.

1. **Real embeddings**: memory_vectors stores normalized provider-produced vectors with model names and dimensional validation; no invented vectors. External embeddings must be configured explicitly.
2. **Hybrid ranking**: SQLite FTS5 + subword similarity + cosine search + reciprocal-rank fusion + optional provider reranker. Fallback is local text retrieval.
3. **Extraction**: cautious regex candidates for payment terms, sums and delivery dates, plus contract, organization and employee entities with source IDs; not validated legal conclusions.
4. **Contradictions**: conflicting values for the same identified contract field create pending-review records, never silently overwrite verified conditions.
5. **Logical memory tiers**: working, episodic, semantic, procedural and archive; heuristic classification over one SQLite store.
6. **Knowledge graph**: existing memory links, contract/entity index, graph-neighbor queries and source provenance.
7. **Time and versions**: valid-from / valid-to, past versions, replacement / retraction closing associated fact validity.
8. **Background consolidation**: bounded batches approx. every 10 minutes while local server runs, checkpointed in SQLite; provenance-preserving extractive summaries of user turns only.
9. **Memory auditing**: pending fact/conflict review, SQLite integrity, source labeling and retrieval quality tests.
10. **Quality monitoring**: Recall@20 and MRR over explicitly provided expected memory IDs, stored results; no autonomous model retraining or self-modification.

### Optional neural provider, disabled unless explicitly configured

Use documented compatible endpoints, not guesses about Cloud.ru API:

- YATSUMIRA_MEMORY_EMBED_URL, YATSUMIRA_MEMORY_EMBED_KEY, YATSUMIRA_MEMORY_EMBED_MODEL
- YATSUMIRA_MEMORY_RERANK_URL, YATSUMIRA_MEMORY_RERANK_KEY, YATSUMIRA_MEMORY_RERANK_MODEL

The embedding adapter sends {model,input} to the explicitly configured HTTPS endpoint (localhost HTTP allowed). Reranker sends {model,query,documents}. Provider availability and response format are not guaranteed. Cloud.ru Foundation Models public OpenAPI documents /models and /chat/completions, not a confirmed universal embeddings endpoint. Do not store credentials in git. Configuring a provider may transmit confidential enterprise contract excerpts to that provider; without configuration, no embedding/rerank network calls occur.

### Backend-only maintenance commands

    node scripts/memory-v3.mjs status
    node scripts/memory-v3.mjs consolidate 40
    node scripts/memory-v3.mjs facts
    node scripts/memory-v3.mjs conflicts
    node scripts/memory-v3.mjs summary
    node scripts/memory-v3.mjs recall "условия договора поставки"
    node scripts/memory-v3.mjs embed 12
    node scripts/memory-v3.mjs evaluate MEMORY_ID "срок оплаты"

The embed command requires a real configured provider. Background maintenance never contacts an embedding provider. Full snapshots are still available via scripts/core-maintenance.mjs. New tests (scripts/test-memory-v3.mjs) use actual SQLite data and mocked network contracts on Windows/Linux.

These mechanisms do not imply verified semantic understanding or independent decisions about Russian contract law. They provide traceable candidates and retrieval for later professional review.
