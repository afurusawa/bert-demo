# Synthetic head recipe inspection

This is a separate, one-page Vite and TypeScript app alongside the existing Eye Scan Results app. It has no router, backend, instrument connection, or component library. The page fits a small model in the browser from synthetic training logs, then lets you inspect a held-out head without hiding the learned rules or the refusal boundary.

## Run the supplied app

Use Node.js 20 or newer. From this directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The standalone checks are:

```sh
npm run typecheck
npm test
npm run build
```

The existing eye-scan app is a separate project at the repository root. Its setup remains:

```sh
cd ..
npm ci
npm run dev
```

Do not run the root app's commands from `recipe-demo/`, or vice versa: each app owns its package manifest and lockfile.

## Scaffold a fresh copy

The command below creates a new Vite vanilla-TypeScript app. It is a starting point for a new experiment, not a replacement for running the supplied app above.

```sh
npm create vite@latest recipe-demo-scratch -- --template vanilla-ts
cd recipe-demo-scratch
npm install
npm run dev
```

The supplied app already includes its model, tests, styles, and build configuration. A freshly scaffolded copy does not include them.

## Browser smoke check

With `npm run dev` running, open the local Vite URL in a desktop browser. Confirm that a held-out row selection changes the tag and measurements, shows twelve aligned learned and hidden mask cells, and keeps the threshold paragraph, four recipe rows, and unchecked proposal label visible. Confirm that the page shows correct-cell, missed-moving, and false-positive counts for every known type, both metric groups, and the separate unknown-family panel. The random-head button selects another rendered row. Changing the claimed type keeps the measurements fixed and shows a refusal when the first read disagrees. Use Tab to reach the controls, then repeat the check at a narrow viewport. This is a short interaction check for the inspection flow, not a large browser test suite.

## Synthetic world

Seed `0` creates exactly 400 stable logs: 320 known training rows and 80 held-out rows. The held-out set contains 79 known heads and one `unknown_family` head. The five known types are `laser_up`, `reader_wider`, `heater_up`, `zone_od`, and `zone_id`; every known type occurs in both splits. Each recipe has twelve integer registers, `r0` through `r11`, clipped to `0` through `255`.

Each known type has a hidden mask of three to five moving registers. The hidden recipe starts from a shared base and adds type offsets, electrical variation, and modest Gaussian variation. First reads are four finite measurements: `amp`, `snr`, `timing_error`, and `asy`. They overlap across types, while some of their within-type variation predicts moving-register values. `zone_od` always reports OD and `zone_id` always reports ID; other types mix zones as descriptive metadata only.

The final recipe is the hidden true recipe plus small residual suite noise, then rounded and clipped. It is therefore a completed synthetic outcome, not a replay of the hidden truth. The model receives training log fields only. Held-out hidden masks, hidden recipes, and completed outcomes are evaluation evidence and are not fitting inputs.

The public model boundary is `createDemoModel(seed)` in `src/model.ts`. It exposes the generated corpus, a training-only `fit`, recipe proposals and refusal reasons, held-out inspection, a separately seeded random-head selection, and aggregate evaluation. The page creates this model once; selecting a row or changing the claim does not regenerate it.

## Fitting and comparisons

- The shared base is each register's pooled median across training final recipes.
- A type marks a register as moving when its training mean absolute deviation from that pooled base exceeds the displayed mask threshold. The threshold is the median of all type and register deviation scores plus three mean absolute deviations around that median. The calculation uses training scores only and is expressed in register counts.
- A moving register uses a small linear fit from the four first-read measurements. A constant or singular feature case falls back to that type's training mean. A skipped register uses the shared base, not the last head's value.
- An accepted claim only makes an unchecked proposal available for inspection. It does not say that the map is trustworthy or that the viewer should skip the full suite.
- **Copy last** is the final recipe from the last completed training row. It is one fixed recipe for the entire held-out batch, representing a mixed workload.
- **Same-type mean** is the per-register mean of completed training recipes for the claimed type. It is unavailable for `unknown_family`; the UI does not invent a family mean.
- **Mapped with fallback** uses the learned start when the first-read checks accept the claim. A refused known head uses copy last for the aggregate starting score, and remains counted in the same population.

The page reports Euclidean (L2) distance from each start to the hidden true recipe. One monotone synthetic BER function is used for both completed logs and starts:

```text
BER = 1e-6 + 0.000999 * (1 - exp(-L2 / 35))
```

All reported values are finite and remain between `1e-6` and `1e-3`. The aggregate BER is the arithmetic mean of per-head BER values; it is not BER evaluated at a mean distance. The unknown row is shown separately and is excluded from all three known-head aggregates.

The first-read check refuses an unsupported label, a claim whose measurements are closer to another known type, or a measurement unusually far from its claimed training population. The unknown example is deliberately unusual and is refused under its unsupported label and when inspected under each known label. A new family with familiar measurements can escape this check, which is why refusal is a boundary rather than an identity guarantee.

This demo is not real HDD physics.

This demo is not a pass/fail tool.

This demo is not a replacement for the existing calibration suite.
