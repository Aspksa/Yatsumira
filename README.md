# YATSUMIRA

Intentionally empty black (#000000) TypeScript + HTML5 Canvas + CSS + Vite website.

## Windows launch

Double click `YATSUMIRA.bat` (requires Windows PowerShell 5.1 or later). The script checks filesystem and UTF-8 handling, diagnoses Node/npm, downloads a checksum-verified portable Node.js LTS if necessary, installs missing packages, validates configuration, selects an available local port, and starts Vite with the browser opening automatically. Internet is required on the first installation. Python is not used.

Diagnostics are stored locally in `.yatsumira/report.json` (ignored by Git). Reports include classified error codes (10 system, 20 network, 30 filesystem, 40 configuration, 50 runtime), check results, snapshot, changes since last successful launch, and grouped recurring issues. `YATSUMIRA_PORT` sets a preferred starting port.

Warnings about OneDrive or long paths are non-fatal. Hard failures stop startup, without blindly modifying the project.

## Tests

```sh
npm install
npm run test:static
npm run build
npx playwright install chromium
npm run test:browser
```

On Windows, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-preflight.ps1` to test filesystem, PowerShell, UTF-8 Cyrillic, disk space, permissions, temp folders, special characters, and config checks.

GitHub Actions runs a clean npm install in a Windows directory containing spaces, &, %, !, ^ and parentheses, plus static and production-build checks. The Linux job runs headless Chromium to check HTTP, Canvas, pure-black styles, and browser errors.

The project has no AI functions or graphical UI yet. Keep the page empty.
