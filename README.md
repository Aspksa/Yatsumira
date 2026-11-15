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
