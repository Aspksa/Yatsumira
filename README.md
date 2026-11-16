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

### Reviewed contract facts and conflicts (backend-only)

Automated contradiction checks only create **pending candidates**. They never alter a signed contract or resolve a disagreement independently. To approve a candidate, use `node scripts/memory-v3.mjs review-fact FACT_ID reviewed "Source: signed contract and date"`; to reject, use `review-fact FACT_ID rejected "Reason"`. To dismiss or resolve a reported conflict, use `node scripts/memory-v3.mjs resolve-conflict CONFLICT_ID dismissed "Reason"` or `resolved "Evidence and rationale"`. Decisions require evidence text and create audit events in SQLite. These actions do not edit the source files or overwrite prior memory.

## CORE v4 — Universal Memory Graph Engine (server-only)

YATSUMIRA's memory is domain-neutral: project, person, place, tool, car, document, event, idea, organization or any other type of object can be saved as a graph node. The engine does not limit the graph to contracts. It uses Node.js and the existing local SQLite database on USB. No front-end files or interfaces were modified.

**Ten capabilities:** (1) entity nodes with open type/label pairs, (2) typed and provenance-backed dynamic relations, (3) optional neural embeddings plus local FTS5 and subword similarity, (4) two- and three-hop associative graph search, (5) historical validity intervals and as-of queries, (6) user-dialogue episodic memory plus explicitly dated event timeline, (7) candidate contradiction records for relations explicitly marked single-valued, (8) automatic connected-component communities, (9) bounded checkpointed consolidation and source-preserving summaries, (10) retrieval evaluations and explicit user feedback affecting local ranking.

**Truth and provenance:** Every assertion references an existing, active memory ID. Auto-extracted relations and entities are candidates, not confirmed knowledge. Contradictions are flagged only when a property is explicitly declared exclusive, not when two objects happen to have different values. Graph paths include the contributing memory ID and review state. Human review of high-stakes claims is still required.

**Optional semantic model:** Real embeddings are supported only when a verified endpoint is provided through the existing YATSUMIRA_MEMORY_EMBED_* environment variables. Without one, the engine uses only lexical/subword and graph recall. It does NOT create pseudo-embeddings, autonomously train a language model, or infer facts not in the supplied sources.

**Background processing:** the existing local maintenance timer processes bounded graph batches approximately every ten minutes while the server is running and saves progress in `memory_jobs`. It reads memories already stored on the user's own disk. No cloud transfer is performed by the graph extraction routine. If the project is closed, no processing continues.

### Headless management (no interface changes)

    node scripts/memory-v4.mjs status
    node scripts/memory-v4.mjs index 40
    node scripts/memory-v4.mjs path "Объект А" "Объект Б"
    node scripts/memory-v4.mjs communities
    node scripts/memory-v4.mjs recall "связанные проекты"
    node scripts/memory-v4.mjs neighbors "Проект Альта"
    node scripts/memory-v4.mjs timeline
    node scripts/memory-v4.mjs feedback MEMORY_ID useful
    node scripts/memory-v4.mjs event MEMORY_ID 2026-11-16 milestone "Завершена работа"
    node scripts/memory-v4.mjs relation MEMORY_ID "Система Альта" uses "База Лира"

Event dates are explicit and parsed as ISO UTC. Generic relations extracted automatically use deliberately conservative quotation patterns (e.g. `«Система Альта» использует «База Лира»`). Arbitrary relations and events can be inserted through the local CLI with existing memory provenance. Domain-agnostic does not mean perfect extraction from arbitrary natural language; this is a reliable foundation for later LLM-based extraction and evaluation.

Run `node scripts/test-universal-memory.mjs` to test the graph, multi-hop paths, communities, source-backed claims, temporal filtering, duplicate safety, feedback and offline recall. GitHub Actions executes it on Linux and Windows along with CORE v1–v3 tests.

## CORE v5 — selected universal memory upgrades (backend only)

The CORE v5 SQLite migration keeps existing local memory, knowledge graph, messages, source files and front-end intact. No interface changes or Docker/Ollama dependency. All source-backed claims remain candidates until reviewed.

**Selected numbered roadmap items implemented as infrastructure or conservative heuristics:**

- **1**: Opt-in OpenAI-compatible JSON extraction adapter (`memory-v5-provider.mjs`); never auto-transmits documents; all extracted relations require original memory IDs and remain unverified candidates.
- **2–4**: Intent classification, bounded context interpretation and pronoun/coreference suggestions without silently modifying user text.
- **5**: Source-backed alternate graph names with explicit approval required before alias resolution.
- **6–8**: Explicitly stated causal candidates, uncertainty markers, and a small offline Russian/English lexical alias layer. These are not general causal reasoning or automatic multilingual translation.
- **9–11**: Hybrid text/graph/vector search, source-weighted Personalized PageRank, confidence-weighted links and feedback-aware ranking.
- **12**: Source-attributed hyperedges connecting 2–15 participants to a multi-role event or relationship.
- **13–15**: Typed open-ended hierarchy relations, connected-component topic communities and graph paths that reveal potentially unexpected associations. Connected components are not Louvain clusters.
- **16**: Every graph assertion, temporal event and hyperedge references a source memory; audit source IDs and retrieval evidence.
- **18**: Preserve existing bounded background consolidation, deduplication and source-based summaries; no deletion or silent fact rewriting.
- **22–24**: Decisions with rationale, incomplete-task checkpoints and verified working-memory candidates; archived and retracted records stay out of active recall.
- **25–27**: Evidence overlap diagnostics, explicit unsupported-answer status and provenance-aware conflict candidates; neither lexical overlap nor LLM confidence proves factual truth.
- **29**: Retrieval completeness check detects missing query terms and recommends retrying search instead of fabricating missing information.
- **34**: Source digest checkpoints detect changes for incremental re-indexing, without wiping prior source memories.
- **37**: SQLite integrity, foreign keys, FTS count, source integrity, checkpoint and schema diagnostics. Database corruption must be handled with verified backups.

**Local commands (no new web UI):**

    node scripts/memory-v5.mjs health
    node scripts/memory-v5.mjs rank "Платформа Аврора"
    node scripts/memory-v5.mjs recall "Что связано с проектом?"
    node scripts/memory-v5.mjs topics
    node scripts/memory-v5.mjs graph-quality
    node scripts/memory-v5.mjs interpret "Она использует его?"
    node scripts/memory-v5.mjs tasks
    node scripts/memory-v5.mjs decisions
    node scripts/memory-v5.mjs coverage "Что известно о системе?"
    node scripts/memory-v5.mjs index-check "file:example.txt" "Current text"

**Neural extraction (opt in only):** set `YATSUMIRA_MEMORY_EXTRACT_URL` to a documented compatible HTTPS `/chat/completions` endpoint, `YATSUMIRA_MEMORY_EXTRACT_KEY` to its secret and `YATSUMIRA_MEMORY_EXTRACT_MODEL` to an actual model identifier. On localhost HTTP is allowed; all other URLs must use HTTPS. Default extraction is dry-run:

    node scripts/memory-v5.mjs extract MEMORY_ID

To write extracted, unverified candidate relations to SQLite, explicitly add `--commit`. Nothing is sent to any model in background by this module. Cloud.ru's existing chat API settings are separate; no unsupported endpoint is assumed or secret written to the database. Avoid sending private company documents to a provider unless its data terms permit it.

**Boundaries:** Neural extraction, reliable pronoun resolution, multilingual semantics, causes/effects and hallucination detection cannot be guaranteed without verified models and reliable source evidence. The new routines are auditable conservative steps, not artificial general intelligence or fully autonomous learning.

Tests: `node scripts/test-memory-v5.mjs` on Windows and Linux, plus the existing CORE compatibility, migration and browser checks.

## CORE v6 — selected universal memory reasoning and graph extensions

Version 6 migrates the existing portable SQLite database in place. All changes are backend-only: no CSS, HTML, NEXUS canvas, menus or chat UI controls were added. It is not an independent general intelligence and it does not silently edit or certify source knowledge.

### Selected roadmap items — what the current implementation actually does

- **1, 9, 10, 31–34:** bounded query planning, multi-query lexical/graph/PageRank retrieval, controlled additional search for complex chat prompts, source-aware result fusion and offline fallback. Simple questions retain a cheap retrieval path.
- **2–5, 7–8:** persistent hypotheses with source-linked support/opposition, analogy and counterfactual candidate types, unanswered-question generation and uncertainty indicators. These are structured analysis proposals, not validated explanations or simulated alternative worlds.
- **11–12:** topic/community graph summaries and existing optional provider-generated vector representations. The universal graph remains stored in local SQLite.
- **13–14:** deterministic two-round neighborhood feature propagation (GNN-compatible inputs, **not a trained GNN**) and review-only predictions of missing links plus structural anomaly diagnostics.
- **15–17:** generic relation suggestions from the existing extractor, provisional hierarchical ontology types, isolated-node/self-loop/ambiguous-type checks.
- **18–20:** source-grounded causal candidates, existing temporal event graph and path explanations. Automatic causation inference is deliberately excluded.
- **22–26:** extractive memory representations and reflections, immutable source IDs, logical state snapshots and provenance-preserving summaries. Old text is never automatically overwritten.
- **27–30:** heuristic trust priority, bounded age-based ranking signals, original-data-reconstructable indices from prior versions and logical snapshot checksums. For physical backups and restoration use the separate SQLite VACUUM INTO backup command.
- **35–36:** compatible external reranker support and existing explicit feedback-aware ranking; neither learns neural model weights automatically.
- **37–38:** negative-source candidate search for unresolved contradictory claims, claim-to-source lexical tracing and explicitly unverified answer diagnostics. A source citation does not establish logical entailment.
- **47:** local offline lexical/graph retrieval remains usable when Cloud.ru or an optional embedding/reranker service is unavailable; AI answer generation still requires the configured Cloud.ru service.

### Local-only commands

    node scripts/memory-v6.mjs plan "Как связаны мои проекты?"
    node scripts/memory-v6.mjs research "Как связаны мои проекты?"
    node scripts/memory-v6.mjs multiquery "проекты и автомобили"
    node scripts/memory-v6.mjs anomalies
    node scripts/memory-v6.mjs structural
    node scripts/memory-v6.mjs possible-links
    node scripts/memory-v6.mjs communities
    node scripts/memory-v6.mjs opposing "Проект Заря"
    node scripts/memory-v6.mjs questions "Что неизвестно про проект?"
    node scripts/memory-v6.mjs reflect MEMORY_ID distillation
    node scripts/memory-v6.mjs hypothesis "Предполагаемая связь требует доказательств"
    node scripts/memory-v6.mjs snapshot baseline

**Important limitations:** neuro-symbolic semantic interpretation, reliable causal analysis, validated counterfactual simulation, real GNN training, automatic ontology discovery and hallucination elimination have not been achieved. User-selected roadmap items have conservative implementation foundations or reuse previously implemented components. New hypotheses, reflections and graph link suggestions are never promoted to verified facts without explicit review. No background cloud calls or additional local dependencies were introduced.

CORE v6 tests (`scripts/test-memory-v6.mjs`) run on Windows and Linux CI alongside schema migration and the complete older CORE test suite.

## CORE v7 — selected universal graph and experience memory improvements (backend only)

All changes remain in server modules, SQLite and tests. The existing UI, NEXUS canvas, chat, USB storage, Cloud.ru setup and source memory records are preserved.

### Selected features and realistic scope

- **3 — Thought Graph:** inspectable research-step nodes (question, hypothesis, evidence, inference, conclusion) with explicit source-memory IDs and acyclic relationships. This is an external *reasoning trace*, not a hidden chain of thought or proof of correctness.
- **14 — Hierarchical Graph Clustering:** bounded deterministic weighted label-propagation communities, cross-community bridges and membership lists. It is not Louvain clustering or an LLM-created hierarchy.
- **15–16 — Graph Alignment and Entity Resolution:** heuristic alignment proposals and explicit source-backed candidate alignments. An alias/merge is not automatically trusted; approval must contain evidence, and original nodes remain unchanged.
- **17 — Temporal Graph:** as-of snapshots that respect source validity intervals and retracted memories.
- **18 — Graph Contradiction Analysis:** ambiguous concurrent property values reported as *potential* conflicts; multi-valued properties are not assumed exclusive.
- **19 — Path Importance Ranking:** bounded weighted paths, temporal validity, source-memory references and explicit review status. Candidate relationships never become verified automatically.
- **20 — Graph Integrity Repair:** read-only integrity and provenance inspection, plus a safe repair plan. No destructive auto-repair is performed without a validated backup.
- **21 — Autobiographical Memory:** source-linked history of actual task outcomes and recorded decisions, excluding retracted sources.
- **22 — Procedural Memory v2:** bounded conversion of completed tasks with real recorded outcomes into unverified procedure candidates. Runs in existing periodic local maintenance; idempotent on repeated runs.
- **23 — Semantic Consolidation:** inspectable source-preserving extractive consolidations across 2–12 memories; no invented synthetic facts.
- **27 — Compression v2:** compact extractive representations preserve source IDs and leave original texts untouched. This does not delete or physically shrink the original database.
- **28 — Association Strengthening:** explicitly requested audited link weight adjustments; arbitrary usage does not silently make an unverified connection factual.

### Local-only commands

    node scripts/memory-v7.mjs clusters
    node scripts/memory-v7.mjs temporal 2026-11-16
    node scripts/memory-v7.mjs contradictions
    node scripts/memory-v7.mjs paths "Платформа Звезда" "Лаборатория Север"
    node scripts/memory-v7.mjs repair-check
    node scripts/memory-v7.mjs alignment-candidates
    node scripts/memory-v7.mjs reasoning SESSION_ID
    node scripts/memory-v7.mjs experience
    node scripts/memory-v7.mjs procedures
    node scripts/memory-v7.mjs compress MEMORY_ID_1 MEMORY_ID_2

Source-backed alignments, evidence steps and association changes require manual CLI arguments. The modules do not call Cloud.ru or create AI interpretations automatically. CI validates CORE v7 with `scripts/test-memory-v7.mjs` on Windows/Linux alongside older migration and browser tests.

## CORE v8 — universal memory, graph, experience and safe operations

This backend-only upgrade keeps Node 22+, local SQLite on USB, Cloud.ru chat, and all existing UI unchanged. The v8 schema is additive: existing original memory entries, messages, graph assertions and procedures are retained.

### Implemented mechanisms for selected roadmap items

- **1–10 (source fusion):** source-attributed extractive merging across memory records, probable lexical duplicates and interference, verified-source-aware ranking priorities and diagnostic gaps. Identity resolution remains candidate-based and explicitly review-gated. The confidence and importance functions are heuristic: they do not represent trained probability calibration or neural semantic equivalence.
- **11–20 (graph):** hyperedge relation counts, graph motifs (triangles, wedges), proposed missing links, structural vector similarity, temporal graph changes, path evidence, candidate conflicts and their adjacent-node impact. Structural vectors are not neural graph embeddings; causality is not inferred as fact.
- **21–30 (experience):** existing procedural memories and task results plus recurring outcome patterns, source-linked decision outcomes, patterns of success/failure and questions about missing information. No autonomous skill execution or unsupervised model training is implied.
- **31, 33, 35 (retrieval):** bounded multi-round agentic memory lookup, source-verified-flag aware ordering and explicit opposing-viewpoint review using existing conflict candidates. This is retrieval assistance, not independent verification.
- **41–46 (background):** bounded persistent SQLite job queue, recovery of interrupted tasks, periodic graph and experience audits, health reports and preservation of existing checkpoints. Only local operations run; background jobs stop when the server closes.
- **48–50 (quality):** labeled retrieval comparison with Recall@20 and MRR regression guard, persisted quality experiment records, health and graph integrity metrics. Shadow testing uses side-effect-free retrieval callbacks; a separate physical SQLite copy is required for experiments that write data.

### Local commands (no new interface)

    node scripts/memory-v8.mjs research "Как связаны мои проекты?"
    node scripts/memory-v8.mjs fusion-preview "Сервис Альфа"
    node scripts/memory-v8.mjs interference "Сервис Альфа"
    node scripts/memory-v8.mjs motifs
    node scripts/memory-v8.mjs hypergraph
    node scripts/memory-v8.mjs evolution 2025-01-01 2026-11-16
    node scripts/memory-v8.mjs paths "Робот Сокол" "Центр Омега"
    node scripts/memory-v8.mjs patterns
    node scripts/memory-v8.mjs gaps "Незнакомый проект"
    node scripts/memory-v8.mjs jobs
    node scripts/memory-v8.mjs quality
    node scripts/memory-v8.mjs offline

Write operations (e.g. `fuse`, `outcome`, `graph-snapshot`) are explicit CLI commands, with source IDs and non-destructive behavior. The existing background service schedules at-most-one graph audit and experience-pattern analysis per UTC day (date-keyed idempotency), and processes one queued job per maintenance tick. It never contacts a language model for these jobs.

Limitations: semantic deduplication, graph causal discovery, neural graph alignment, reliable identity decisions, learned memory confidence, actual cross-domain transfer and calibrated factuality require additional model-backed implementation and evidence. The system intentionally keeps unreviewed patterns as candidates. `memory-v8-operations.mjs` has **no destructive database migration or automatic data repair**. A passing CI suite shows tested behavior, not an independent guarantee that complex conclusions are true.

CI now runs `scripts/test-memory-v8.mjs` on Linux and Windows in addition to all earlier versions and the browser regression suite.

## CORE v10 — selected universal graph upgrades (no UI changes)

CORE v10 upgrades SQLite additively from v8, preserving original node IDs, claims, documents, conversations and memory sources. No Docker, Ollama, new page elements or automatic Cloud.ru calls.

Selected items:

- **2 — Dynamic Graph Schema:** propose new ontology types with a real source-memory ID. Only explicitly reviewed type proposals update the ontology; automatic classification is heuristic and not trusted by default.
- **3 — Entity Identity Memory:** reviewable, source-backed mapping of distinct node IDs to canonical entities. Resolving an identity is a separate operation from storing original nodes.
- **4 — Graph Merge Engine:** reviewed merge marks an identity mapping as active; it never deletes original nodes or overwrites source assertions.
- **5 — Graph Split Engine:** split revokes a merged identity mapping and restores independent resolution, preserving source evidence and audit history.
- **9 — Provenance Tracking:** each original graph claim links to source memory, validity interval, review state and original source kind/id.
- **10 — Graph Consistency Rules:** checks impossible validity ranges, missing sources and suspicious self-links. Semantic truth still requires independent review.
- **24 — Hidden Link Discovery:** bounded two-hop candidate discovery (with provenance from the intermediate path); no direct assertion is automatically created.
- **30 — Knowledge Bridge Detection:** identify nodes with neighbors from different known types, with original supporting memory IDs; structural bridges are not validated cross-domain causal knowledge.
- **31 — Temporal Knowledge Graph:** existing time-valid graph claims plus explicitly dated events and source-linked event-to-node roles.
- **32 — Event Causality Graph:** proposed causal links between source-backed events, checked for chronological order and stored as unverified candidates.
- **33 — Experience Graph:** explicit task-to-event relationships retain original task and event IDs.
- **41 — Background Link Discovery:** daily, bounded, idempotent work in the existing SQLite queue, only when the local server runs; results remain unverified candidate links.
- **44 — Graph Anomaly Monitor:** daily diagnostics of self-links, stale assertions and isolated nodes; does not automatically delete or repair data.

Local commands:

    node scripts/memory-v10.mjs stats
    node scripts/memory-v10.mjs discover
    node scripts/memory-v10.mjs bridges
    node scripts/memory-v10.mjs anomalies
    node scripts/memory-v10.mjs rules
    node scripts/memory-v10.mjs events
    node scripts/memory-v10.mjs identity-candidates
    node scripts/memory-v10.mjs identity-resolve NODE_ID
    node scripts/memory-v10.mjs provenance ASSERTION_ID

Explicit review operations (`types-review`, `identity-merge`, `identity-split`) require evidence. No node is merged or split by the background scheduler. All automatic discoveries, cause proposals and anomalies remain review-only data. CI runs `scripts/test-memory-v10.mjs` on Linux and Windows alongside existing CORE and browser tests.

## CORE v11 — long-term memory foundation (items 1–30)

This is an additive, backend-only SQLite migration from CORE v10 to v11. No UI, CSS, NEXUS graph display, extra service or Docker/Ollama changes. The database still resides locally under `.yatsumira` in the project; source texts, IDs and citations remain intact.

### Capabilities and exact limits

- **1–6 — persistent/episodic/semantic/procedural/autobiographical/identity memory:** existing versioned `memory_entries`, conversation and message store, task outcomes and saved procedures remain active; v11 adds stable contextual and revision records. Memory is durable between restarts but depends on physical USB availability and backup integrity.
- **7–10 — hierarchy, associations, provenance, revisions:** `memory_v11_hierarchy` stores cycle-protected parent relationships; `memory_v11_associations` stores candidate causal/duplicate/temporal links; original provenance stays in `memory_entries`; new `memory_v11_history` provides append-only source-cited revisions without rewriting originals.
- **11–12 — context and conversation consolidation:** `memory_v11_context` preserves who/why/when/topic and source links, while the existing extractive conversation summaries plus the v11 episodic consolidation wrapper preserve their original memory IDs. Automatic long conversations are summarized only with source excerpts, not full neural understanding.
- **13–16 — deduplication, entity resolution, temporal and causal binding:** existing duplicate and graph identity review machinery plus v11 candidate associations. Identity merging is reversible, timestamps must be explicit, causal candidates are never proof of causation.
- **17–19 — cross-conversation, cross-document and multi-source fusion:** source-linked retrieval across locally indexed `memory_entries`, with existing v8 fusion and v11 semantic/episode consolidation. Nonindexed documents cannot be recalled; only ingested content is searchable.
- **20 — understanding verification:** conservative source coverage / missing-term diagnostics. This is **not** a guarantee of correct understanding.
- **21–24 — experience, success/failure, decisions:** v11 experience candidates are distilled from actual completed/cancelled recorded tasks. Existing decision history and v8 source-backed decision outcomes remain available. There is no unsupervised skill training.
- **25–26 — goals and preferences:** source-cited long-term goals with outcomes; explicit, reviewable time-bounded preferences. Relevant active goals and **reviewed** preferences can be recalled in the existing chat context without any new UI. No automatic guessing about user preferences.
- **27–29 — skills, reflection and generalization:** existing source-based procedures plus v11 candidate patterns (`success`, `failure`, `reflection`, `generalization`) with immutable source links; explicit approval needed before claims become reviewed. Existing maintenance produces bounded, idempotent candidate patterns, not autonomous factual learning.
- **30 — knowledge gaps:** source-based question generation and candidate gap diagnostics using existing `memoryGaps`, not proof of absence.

### Headless local commands

    node scripts/memory-v11.mjs status
    node scripts/memory-v11.mjs memory MEMORY_ID
    node scripts/memory-v11.mjs goals
    node scripts/memory-v11.mjs goal-add MEMORY_ID "Закончить проект"
    node scripts/memory-v11.mjs preferences
    node scripts/memory-v11.mjs preference-add MEMORY_ID "Тема интерфейса" "Тёмная"
    node scripts/memory-v11.mjs preference-review PREFERENCE_ID approve "Проверено по исходному сообщению"
    node scripts/memory-v11.mjs cross-source "Проект Заря"
    node scripts/memory-v11.mjs experience-preview success
    node scripts/memory-v11.mjs experience-consolidate
    node scripts/memory-v11.mjs experience-patterns
    node scripts/memory-v11.mjs verify-understanding "неизвестная тема"

**Implementation limits:** neural semantic equivalence, guaranteed factuality, automatic preference recognition, robust entity disambiguation and reliable causality reasoning are **not** automatically achieved. The new long-term system deliberately separates recorded facts from candidate insights. CORE v11 tests run in `scripts/test-memory-v11.mjs` on Linux and Windows alongside previous suites; browser UI is unchanged.

## CORE v12 — supervised cognitive memory foundations (43 selected directions)

This update is **backend-only** and migrates existing SQLite to schema 12 without dropping existing original memories, graph edges, conversations or source IDs. It does not alter the visual interface, use Docker/Ollama or train model weights. All inferred patterns are candidate records, not confirmed knowledge.

Selected roadmap numbers: **1–5, 7–8, 11–15, 18, 21–50**.

### Actual implementations and reused foundations

- **1–5**: new `memory_v12_lessons` and evidence linking, bounded idempotent experience consolidation from completed/cancelled tasks, reflection/strategy/analogy candidates, plus existing source-linked CORE v11 consolidation. Outcomes from a single source do not count as multiple independent sources.
- **7–8, 11–15, 18**: existing gap diagnostic and question planning; hypotheses and alternatives stay candidates; the v12 graph module produces structural analogy proposals. Recursive reasoning, calibrated uncertainty and causal simulations are **not** autonomous or trained — v6 hypothesis trace and v7 reasoning steps provide basic bounded groundwork.
- **21–30**: existing CORE v10 two-hop link discovery and ontology proposals, v7 communities/temporal relationships, v8 motifs and bridges, v12 aggregated review diagnostics, source-linked relation confidence and anomaly tracing. Structural similarity is not neural graph learning; causes are never inferred as verified solely from chronology.
- **31–40**: completed/cancelled task episodes and CORE v11 procedures, decisions, goals and source-linked preference memory; new v12 lessons hold reviewable success/failure/strategy/correction proposals. Predictions are ranking heuristics, not calibrated success probabilities or autonomous transferable skills.
- **41–47**: `adaptiveRecall` performs bounded lexical search and optional graph fusion, with explicit feedback-based reranking; retrieval profile experiments require labeled QA examples before approval. Provider-backed semantic reranking remains optional in the existing `memory-provider.mjs`.
- **48–50**: existing CORE v8 Recall@20/MRR regression comparison and new auditable retrieval-profile approvals, local status and daily metrics. Profile approval does **not** silently change production weights; deployment still requires explicit integration and further validation.

### Background safety and operation

While the local server is running, the existing SQLite job scheduler queues one daily `v12-experience`, `v12-graph-research` and `v12-learning-report` task for each date, in addition to earlier maintenance. The queue persists after shutdown and bounded tasks are checkpointed for restart. It does **not** automatically alter code, delete source memories, approve candidate facts, contact Cloud.ru for autonomous learning or fine-tune a neural model.

Useful local commands:

    node scripts/memory-v12.mjs status
    node scripts/memory-v12.mjs learn
    node scripts/memory-v12.mjs lessons
    node scripts/memory-v12.mjs graph
    node scripts/memory-v12.mjs recall "Как связан проект и документ?"
    node scripts/memory-v12.mjs gaps "Какие сведения отсутствуют?"
    node scripts/memory-v12.mjs anomalies
    node scripts/memory-v12.mjs priority MEMORY_ID
    node scripts/memory-v12.mjs feedback MEMORY_ID useful "запрос" "Проверено вручную"

To ensure accuracy, verify new lesson candidates against their original sources before approval. Neural semantic equivalence, verified causal conclusions, reliable success prediction, true calibration, learning model weights and full skill transfer require further independent components and evaluation. Windows/Linux CI includes `scripts/test-memory-v12.mjs` alongside all previous versions, server checks and browser regression.

## CHAT CORE v13 — source-bound dialogue intelligence (34 selected improvements)

Selected roadmap numbers: **1–21, 26–29, 31–35, 37–38, 41–42**. This backend-only update keeps the existing chat interface, persona, Cloud.ru provider, portable SQLite on external USB, and existing source documents. It migrates additively to schema **13**, without Docker, Ollama or new frontend buttons.

### What actually works

- **1–10 — understanding and intent:** deterministic Russian/English intent detection, multi-intent classification, reference-word detection (including inflected Russian pronouns), possible continuation detection, topic overlap with recent conversation, estimated request complexity, uncertainty and clarification guidance. These are **heuristics**, not complete semantic understanding or reliable resolution of ambiguous references.
- **11–20 — long-term dialogue context:** existing atomic SQLite exchanges and source-linked memory + v13 per-session history, bounded contextual excerpts, continuity hints, source-aware recall of existing goals and reviewed preferences, and topic analysis. Previous user messages remain untrusted data, not higher-priority instructions.
- **21, 26–29 — interaction:** preserve Yatsumira's existing persona and response preferences; bounded strategy selection; resumable session context; user correction records; source-overlap diagnostics. Proactive hints are generated by existing Cloud.ru prompt behavior, not unprompted autonomous messages. Adaptation relies on existing reviewed preferences, not emotional inference.
- **31–35 — RAG:** bounded multi-step retrieval planning, lexical+graph memory retrieval and existing vector-enabled Cloud.ru provider when configured. Document recall applies only to content actually indexed into existing storage; no claim of comprehensive document parsing.
- **37–38 — tools:** server-side read-only tool router proposes local memory search, session history and document RAG; the live Cloud.ru chat records a successful local retrieval operation. Arbitrary multi-tool autonomy and filesystem writes require separate explicit integration and authorization; choosing a tool is not executing it.
- **41–42 — background reflection and error memory:** daily idempotent per-session topic/intent reflections while the server runs, persistent error/correction feedback, tool audits and an intent benchmark. Reflections never promote AI guesses to verified facts.

### Command line tools

    node scripts/chat-v13.mjs status
    node scripts/chat-v13.mjs analyze "Найди документ и проверь ошибки"
    node scripts/chat-v13.mjs plan "Продолжай работу с проектом"
    node scripts/chat-v13.mjs session default
    node scripts/chat-v13.mjs research "Где сведения об оплате договора?"
    node scripts/chat-v13.mjs reflect default
    node scripts/chat-v13.mjs feedback SESSION_ID EXCHANGE_ID correction "Указан неверный документ"

New modules: `server/chat-v13-intelligence.mjs`, `server/chat-v13-research.mjs`, `server/chat-v13-reflection.mjs`, and `scripts/test-chat-v13.mjs`. Existing chat API remains unchanged in its request and response format. The new diagnostics are best-effort and must not block a successful Cloud.ru response.

**Limitations:** heuristic intent labels and keyword overlaps cannot establish factual correctness, infer hidden intent with certainty, solve ambiguous pronouns reliably, or verify answers semantically. Tool selection does not grant autonomous execution rights; background analysis is local and only runs while the server is running. No model fine-tuning, self-rewriting or unsupervised factual promotion is performed. CI runs the new chat test on Linux and Windows along with existing memory tests and browser checks.


## Opt-in low-load semantic indexing (background)

When all three `YATSUMIRA_MEMORY_EMBED_URL`, `YATSUMIRA_MEMORY_EMBED_KEY`, and `YATSUMIRA_MEMORY_EMBED_MODEL` environment variables are configured, the running local server attempts a **separate batch of at most four embeddings** on each maintenance interval (normally ten minutes). This is sequential, never runs overlapping batches, and does not block the normal chat or SQLite consolidation timer. Only active memories lacking a vector for the configured model are selected; existing vectors are reused. If the provider fails, the batch stops and subsequent ticks retry. Stopping the server stops new batches.

**Privacy and availability:** Configuring these variables explicitly permits sending eligible memory excerpts to the configured provider. Do not configure a third-party endpoint for confidential company contracts without authorization. Records matching the local credential filter are skipped, but this filter cannot detect every sensitive item. Cloud.ru chat credentials do not automatically configure an embedding endpoint; a verified embeddings API is required. Without one, lexical FTS5/graph retrieval continues offline, and no automatic embedding requests are made. This feature does not index arbitrary files or add agents.


### Short-lived query embedding cache

Repeated identical semantic search questions reuse their provider-produced query vector for up to five minutes while the local Node process remains open. The in-memory cache holds at most 64 entries, uses hashed keys scoped to provider URL/model/credentials, and is never saved to SQLite or disk. Document vectors still use persistent SQLite indexing. If the provider is not configured, local lexical recall remains available. No additional software or agents are required.

## Offline comparison of contract revisions (text exports)

Compare two UTF-8 contract text exports locally, without Cloud.ru or any external requests:

```sh
node scripts/compare-contracts.mjs "old-contract.txt" "new-contract.txt" "comparison.json"
node --test scripts/test-contract-diff.mjs
```

Supported inputs are `.txt` and `.md` (maximum 2 MiB each). Omit the third argument to print JSON to the console. Existing report files are never overwritten. The report includes added, removed and changed extracted clauses with source excerpts, and every change requires human review. The extraction is heuristic and currently examines only the first 4000 characters of each text; absence of a clause in the report does not prove that the contract lacks it. DOCX/PDF and scanned images are **not** parsed by this command; export their text first. Do not treat the report as a legal opinion.

## Automatic offline contract comparison

Place matching UTF-8 text exports in `Aspksa/Документы/Договоры` under the project folder, for example `Поставка.old.txt` and `Поставка.new.txt`. Then run:

```sh
npm run contracts:auto
npm run test:contracts
```

The first command discovers all `*.old.txt` / `*.new.txt` (also `.md`) pairs and creates separate JSON reports in `Aspksa/Документы/Договоры/reports`. It never overwrites an existing report, skips incomplete pairs, and reports failures. For a custom folder: `node scripts/auto-compare-contracts.mjs "D:\\Contracts" "D:\\Reports"`. This is a one-shot automatic batch command, **not** continuous background monitoring. It does not yet read PDF/DOCX, run OCR, or integrate with the web UI. Files stay local. Review results against the original documents; extraction currently examines only the first 4000 characters of each text.
