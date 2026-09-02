# BER eye-scan measurement conventions

## Question

How should a synthetic eye-scan UI represent zero observed bit errors, measurement limits, and eye width or height at a target bit error ratio?

This note assumes each tested bit is an independent Bernoulli trial with a constant error probability at each grid point. That assumption is suitable for deterministic demo data. Real links can have correlated or burst errors, so a production instrument may need a different uncertainty model.

## Findings

The observed bit error ratio is the integer error count divided by the number of tested bits, `k / N`. A zero count therefore has a point estimate of zero, but it does not establish that the true BER is zero. Instrument documentation treats BER as a statistical measurement and ties an error-free claim to both the tested bit count and a confidence level. [Keysight's error-performance analyzer guide](https://www.keysight.com/in/en/assets/9018-40850/installation-guides/9018-40850.pdf#page=48) gives the zero-error confidence relation `C = 1 - exp(-Nb)` and identifies `N` as the number of bits examined without an error.

For a one-sided confidence level `C = 1 - alpha`, the exact binomial upper bound after zero errors is:

```text
p_upper = 1 - alpha^(1/N)
```

For large `N`, this is approximately `-ln(alpha) / N`. At 95% confidence it is about `2.996 / N`, usually rounded to `3 / N`. NIST derives the upper limit by inverting the binomial cumulative distribution and gives the same `3 / N` result for zero errors at 95% confidence. [NIST IR 8429, section 4.2](https://nvlpubs.nist.gov/nistpubs/ir/2022/NIST.IR.8429.ipd.pdf#page=21) also gives `4.6 / N` for 99% and `6.9 / N` for 99.9% confidence.

`1 / N` is not a 95% measurement limit. If the true BER were `1 / N`, the chance of observing zero errors would be `(1 - 1/N)^N`, which approaches `e^-1`, or 36.8%. A zero count supports `BER < 1/N` at only about 63.2% one-sided confidence. Calling `1/N` a "measurement floor" is acceptable only as a rendering convention for a logarithmic color scale. The UI must not present it as a measured BER or a conventional-confidence upper bound.

Eye width and height should name their BER threshold. Equipment documentation defines eye width as the opening at the selected BER, rather than as one threshold-free property of the signal. [Keysight's Eye Width reference](https://helpfiles.keysight.com/csg/d9300a/Help/Infiniium-UG/Content/Topics/Jitter/Jitter_Meas_Eye_Width.htm) and [Tektronix's analysis manual](https://download.tek.com/manual/80SJNB-Jitter-Noise-BER-SDLA-Analysis-Software-Printable-Help-EN-US.pdf#page=59) use this convention.

## Recommended demo convention

Keep the raw count and the statistical claim separate.

- For `k > 0`, show `k errors / N bits` and the point estimate `k/N`.
- For `k = 0`, show `0 errors / N bits`, `No errors observed`, and the one-sided 95% upper bound `BER < 1 - 0.05^(1/N)`.
- Render zero-error cells with a distinct flat color or hatch. If the renderer needs a positive numeric value, it may clamp them to `1/N` internally, but label that value `display floor` and keep it out of readouts and calculations.
- If the app offers a pass or fail statement at target BER `T`, call a point passing only when its one-sided 95% upper bound is at or below `T`. Use an exact one-sided binomial bound for nonzero counts as well. NIST documents exact binomial confidence limits and their numerical computation in its [Proportion Confidence Interval reference](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/propconf.htm).

For a simple eye-opening metric:

1. Build the target contour from the 95% upper-bound field, not from zero-filled point estimates.
2. Define eye width as the continuous horizontal span inside that contour on the stated voltage slice.
3. Define eye height as the continuous vertical span inside that contour on the stated phase slice.
4. Use the nominal sampling slices for the demo, such as `0 mV` and `0 ps`, and report them beside the metrics.
5. Interpolate contour crossings between grid points in `log10(BER)` space.
6. Report width in picoseconds and unit intervals, and height in millivolts.

Labels such as `Eye width at BER 1e-6, 95% confidence` and `Eye height at BER 1e-6, 95% confidence` state what the numbers mean. The nominal-slice rule is a demo convention, not a compliance standard. A later hardware-backed product should use the sampling-point and confidence rules required by its applicable test standard.

## Consequence for the current specification

Replace any rule that equates zero observed errors with `BER < 1/N`. At `N = 1e9`, zero errors gives a one-sided 95% upper bound of about `3.0e-9`, not `1.0e-9`. This still lies well below a `1e-6` target contour, so the correction changes the wording and uncertainty treatment without closing the center of the synthetic eye.
