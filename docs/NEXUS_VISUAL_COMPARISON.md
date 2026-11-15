# YATSUMIRA NEXUS — visual reference audit

Reference: user-supplied portrait screenshot, 641×698 px, with a dark radial atlas. This is **not** a pixel-perfect match claim. The reference and current responsive Canvas use different viewport sizes and renderers.

## Reference structure observed

- Approximate atlas center: (332,390) in reference pixels; normalized (0.52,0.56).
- Main outer orbit radius: approximately 295 px; two closely spaced bands of outlined glyphs.
- Compact central node, subtle nested circles and large negative-space band.
- Twelve-ish visually distinct inner radial wedges, with different widths and lengths, not dozens of identical clusters.
- Microscopic colored data points, muted turquoise/blue/violet/amber palettes, thin low-opacity spokes.
- A very dark blue-black background; right chat in YATSUMIRA remains pure black.

## What was changed

- Core vertical placement to 55% of Canvas height to better match the reference's slightly low nucleus.
- Twelve asymmetric fan blocks (2/1 groups alternating between eight sectors), capped inner radius to preserve the text band.
- Topic-specific labels next to the blocks and hairline hierarchy connectors.
- Higher-density **decorative** microcells without inflating the actual memory database or fabricating relationships.
- Wider double-contour outer pictograms.
- Zoom, drag, hit testing, data-driven groups, four visualization modes and Cloud.ru chat preserved.

## Automated comparison method

The Playwright test uses a real headless Chromium Canvas and records desktop atlas, full interface and mobile screenshots. It measures colored visible pixels, sampled every fourth pixel, for five radial bands around the center. Pixels qualify when maximum RGB channel exceeds 35 and color spread exceeds 10. This metric is diagnostic, **not** SSIM or visual-equivalence certification.

| Normalized radial band | Reference screenshot (approx.) | Before this refinement | Current run |
|---|---:|---:|---:|
| 0–0.15 (core) | 19.1% | 24.9% | 16.7% |
| 0.15–0.36 (quiet inner band) | 13.3% | 1.4% | 1.3% |
| 0.36–0.65 (inner data fans) | 20.1% | 1.5% | 14.3% |
| 0.65–0.85 (caption/connection band) | 3.0% | 2.5% | 4.2% |
| 0.85–1.08 (outer icon orbit) | 15.9% | 5.5% | 13.5% |

Current measured run: https://github.com/Aspksa/Yatsumira/actions/runs/43717589054

## Inspect the real screenshots

Open the GitHub Actions run above and download the **yatsumira-nexus-visual-snapshots** artifact, containing:

- `nexus-atlas-desktop.png` — cropped left-hand Canvas
- `yatsumira-desktop.png` — full desktop layout including pure-black chat
- `yatsumira-mobile.png` — narrow-viewport layout

Automated screenshots are transient CI artifacts, not committed binary assets. The original user reference remains outside the repository.


## Five selected refinements completed (2026-11-15)

1. **Core and proximal orbits:** compact nucleus with concentric halos, low-glare lines, and inner signal filaments.
2. **Caption/connection placement:** labels at fan-group positions; decorative captions skip overlaps while real labels remain visible.
3. **Adaptive point density:** up to 16 extra procedural microcells per decorative inner marker only when FPS >= 56. Lower performance modes render fewer cells. Actual knowledge is unchanged.
4. **Responsive audit:** Chrome tests at 1280×720, 1440×900, 1920×1080, 768×1024 and 390×844; no horizontal overflow.
5. **Screenshot comparison:** the GitHub Actions artifact contains actual Chromium captures of the desktop atlas, several screen sizes and an approximate radial-density comparison JSON.

Verified run: https://github.com/Aspksa/Yatsumira/actions/runs/43717589054 (Linux and Windows passed).
Reference metrics are estimates, not registered pixel-for-pixel measurements or a proven similarity percentage.

Generated files additionally include yatsumira-compact-desktop.png, yatsumira-wide-desktop.png, yatsumira-tablet.png and reference-comparison.json.

## Still to refine

1. Make the nearest inner band more faithful without causing excessive glow.
2. Review actual screenshot artifacts side by side on the same viewport/crop.
3. Optimize labels on dense live-data clusters and verify no overlap at the widest zoom.
4. Continue tracing actual document and RAG-derived links only after semantic search is implemented.

No real API keys or documents were required for this audit.
