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
| 0–0.15 (core) | 19.1% | 24.9% | 24.7% |
| 0.15–0.36 (quiet inner band) | 13.3% | 1.4% | 1.4% |
| 0.36–0.65 (inner data fans) | 20.1% | 1.5% | 12.4% |
| 0.65–0.85 (caption/connection band) | 3.0% | 2.5% | 4.1% |
| 0.85–1.08 (outer icon orbit) | 15.9% | 5.5% | 13.5% |

Current measured run: https://github.com/Aspksa/Yatsumira/actions/runs/43716955143

## Inspect the real screenshots

Open the GitHub Actions run above and download the **yatsumira-nexus-visual-snapshots** artifact, containing:

- `nexus-atlas-desktop.png` — cropped left-hand Canvas
- `yatsumira-desktop.png` — full desktop layout including pure-black chat
- `yatsumira-mobile.png` — narrow-viewport layout

Automated screenshots are transient CI artifacts, not committed binary assets. The original user reference remains outside the repository.

## Still to refine

1. Make the nearest inner band more faithful without causing excessive glow.
2. Review actual screenshot artifacts side by side on the same viewport/crop.
3. Optimize labels on dense live-data clusters and verify no overlap at the widest zoom.
4. Continue tracing actual document and RAG-derived links only after semantic search is implemented.

No real API keys or documents were required for this audit.
