# Eye Scan Results

Eye Scan Results is a desktop-first React demo for browsing and comparing synthetic bit-error-rate (BER) eye scans. It is a static interface demonstration: the fixture data is bundled with the production build and no instrument or customer data is connected.

## Setup

Requires Node.js 20 or newer.

```sh
npm ci
npm run dev
```

Open the local Vite URL shown in the terminal. The other useful checks are:

```sh
npm run typecheck
npm test
npm run build
```

`npm run generate:fixtures` regenerates `src/data/runs.json` from the deterministic model when the fixture source needs to change.

## Demo routes

- `/` — sortable run history with twelve stored scans
- `/runs/<run-id>` — one scan, its eye plot, metadata, and raw measurement evidence
- `/comparison` — the fixed baseline lane 3 versus later-unit lane 3 comparison

The routes are ordinary shareable URLs. Vercel rewrites the run and comparison paths to the static entry point so direct refreshes resolve to the app.

## Synthetic physical model

Each run is a four-lane scan over phase and threshold-voltage coordinates. The model combines voltage noise, timing jitter, phase-dependent eye closure, and a seeded pseudo-random number generator. At each point it estimates a true BER and samples an integer error count from a Poisson distribution.

The fixture narrative contains three groups:

- a healthy four-lane baseline;
- a later unit with only lane 3 degraded; and
- a 70 °C thermal group with all lanes degraded.

Every run stores its own sweep geometry and tested-bit count. Rendering and eye metrics read those values from the run rather than relying on global defaults. The target contour and eye width or height use a fixed BER of `1e-6` and a one-sided 95% confidence qualification.

## Measurement censoring

The fixture stores raw integer errors and tested bits. A nonzero count displays the observed BER, `errors / bits tested`. A zero count is not treated as a measured BER of zero. It is shown as “No errors observed” and receives the one-sided 95% upper bound:

```text
p_upper = 1 - 0.05 ** (1 / bits_tested)
```

With `1e9` tested bits, zero observed errors give an upper bound of about `3.0e-9`. The UI uses a separate neutral treatment for censored cells and keeps exact, below-resolution, and confidence-bounded comparison changes distinct.

## Hardware boundary

This repository does not communicate with an instrument. It has no backend, database, live scan process, browser-to-instrument connection, or protocol implementation. A future host-side acquisition adapter could map hardware results into the existing `ScanRun` shape, but that boundary is intentionally outside this demo. The hosted site should be read as a synthetic results layer, not as evidence of direct hardware connectivity.

## Deployment

The production build is Vercel-compatible:

```sh
npm run build
```

Vercel uses `dist` as the output directory, installs with `npm ci`, and applies the route rewrites in `vercel.json`. The site and its HTTP response headers identify the demo as unlisted synthetic content and request search engines not to index it.
