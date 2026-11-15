# YATSUMIRA

An intentionally blank web page built with **TypeScript**, **HTML5 Canvas**, **CSS**, and **Vite**.

## Windows: automatic startup

Double-click `YATSUMIRA.bat`.

- If Node.js 20+ and npm are not installed, the launcher downloads a portable **official Node.js LTS** distribution into `.tools/node` (no administrator rights required), verifying its SHA-256 checksum.
- On the first run, npm installs project dependencies.
- If the default port `5173` is occupied, the launcher selects another available local port.
- Vite opens the browser automatically at the actual URL. Keep the terminal window open while using the website.
- To choose a preferred starting port, set the `YATSUMIRA_PORT` environment variable (e.g. `5180`). If occupied, the next free port is used.

Internet access is required for first-time downloads. Windows PowerShell 5.1+ is required. The Node.js runtime is kept local to the project and is not committed.

## Terminal

```sh
npm install
npm run dev
```

To check the production build:

```sh
npm run build
```

The page is intentionally blank. AI features and UI components will be added later.
