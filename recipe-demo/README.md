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
npm run test:smoke
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

With `npm run dev` running, open the local Vite URL in a desktop browser. Confirm that the acceptance summary says 53 of 79 known heads accepted (67.1%), and that the two separate metric groups show numerical L2 and BER labels with a common bar scale inside each group. Confirm the fixed mixed-workload copy-last baseline explanation. A held-out row selection changes the tag and measurements, initializes the claimed type from the actual type, and shows both types together. The page should show twelve aligned learned and hidden mask cells, the threshold paragraph, and four recipe rows. The random-head button selects another rendered row and resets the claimed type to that row's actual type. Change the claimed type and verify that the tag and four first-read measurements stay fixed, while a disagreement shows a refusal with the full-suite instruction and no learned move/skip instructions. After a refusal, the mapped row is unavailable and copy last is labeled as the fallback starting point; an unsupported claim has no invented same-type mean. Confirm that the separate unknown-family panel lists refusal checks for its unsupported label and every known label, with the reason text visible. Confirm correct-cell, missed-moving, and false-positive counts for every known type and both metric groups. Use Tab to reach the controls, then repeat the check at a narrow viewport and at 125% browser zoom; text must remain readable and the aggregate summary must not change. The one-test automated version of this short interaction check is `npm run test:smoke`; it uses the installed Edge channel and is not a large browser suite.

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

The page reports Euclidean (L2) distance from each start to the hidden true recipe. Each displayed L2 aggregate is the arithmetic mean of 79 per-head distances over the same known held-out rows. One monotone synthetic BER function is used for both completed logs and starts:

```text
BER = 1e-6 + 0.000999 * (1 - exp(-L2 / 35))
```

All reported values are finite and remain between `1e-6` and `1e-3`. The aggregate BER is the arithmetic mean of per-head BER values; it is not BER evaluated at a mean distance. The unknown row is shown separately and is excluded from all three known-head aggregates.

The first-read classifier uses the four measurements after subtracting pooled training means and dividing by pooled training standard deviations. It compares the normalized measurement to each known type's training centroid. The fitter records a per-type unusual-distance threshold from that type's training distances (the 98th percentile plus a small margin, with a minimum floor); no held-out truth is used. Prediction refuses an unsupported label, refuses when another known centroid is closer than the claimed type, and refuses when the claimed centroid is unusually far away. Every refusal states the reason and says to run the full approximate suite. The unknown example is deliberately unusual and is refused under its unsupported label and when inspected under each known label. An unknown family with familiar electrical measurements can escape detection, which is why refusal is a boundary rather than an identity guarantee.

## Recorded seed-0 results

The deterministic seed-0 run records 53 accepted and 26 refused known heads: 53/79, or 67.1%. The unknown family is excluded from every aggregate. The three arithmetic-mean starting results are:

- copy last: L2 `75.6487`, synthetic BER `8.23197e-4`
- same-type mean: L2 `12.1100`, synthetic BER `2.82977e-4`
- mapped with fallback: L2 `51.6879`, synthetic BER `7.18910e-4`

Mapped with fallback is 68.3% of copy last's mean L2 distance, which is below the 75% acceptance threshold. Relative to same-type mean, it is 426.8% of the mean L2 distance and 254.1% of the mean BER; that comparison is reported for context, not used as an acceptance requirement. The mapped score includes copy-last starts for all 26 refused known heads.

The fitted mask threshold is `27.693750` register counts. Seed-0 mask results are `laser_up` 9 correct / 3 missed / 0 false positive, `reader_wider` 10 / 2 / 0, `heater_up` 11 / 1 / 0, `zone_od` 9 / 3 / 0, and `zone_id` 10 / 2 / 0. The unknown row refuses under `unknown_family` with `unsupported-label` and refuses under every known claim; the known-label checks return the disagreement or unusual-first-read reasons.

This demo is not real HDD physics.

This demo is not a pass/fail tool.

This demo is not a replacement for the existing calibration suite.
