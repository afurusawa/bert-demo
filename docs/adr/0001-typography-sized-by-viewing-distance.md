# Typography is sized by viewing distance, not by a design system's type scale

Every mainstream design system's type floor (Carbon 12px, Material 12px, Apple's
macOS caption styles at ~10pt) is a house density decision, not a legibility
finding, and WCAG specifies no minimum font size at all. We therefore size text
with the angular method in ISO 9241-303 — 16 arcminutes minimum, 20–22
arcminutes preferred — resolved against an assumed 600mm desk viewing distance,
which puts body text at ~19px and sets a hard floor of 15px.

## The authority stack

No single source covers usability, so four are layered, each answering what the
others cannot:

1. **Interaction correctness** — Nielsen's 10 heuristics and the ISO 9241-110
   dialogue principles.
2. **Legibility and sizing** — the ISO 9241-303 angular method above. This layer
   overrules any component library's type scale.
3. **Accessibility floor** — WCAG 2.2 AA. A floor to clear, not a target.
4. **Data display** — Cleveland & McGill's graphical perception work and Tufte,
   because the plots carry the actual meaning in a measurement UI.

Component and spacing vocabularies sit downstream of all four and carry no
authority over legibility.

## Considered options

- **Adopt a house system's scale wholesale** (Carbon was the closest fit: this
  repo already uses IBM Plex Sans, square corners, hairline borders and dense
  bordered tables). Rejected because its 12px floor sits below the ISO minimum
  at a normal desk distance — conforming would have ratified the legibility
  problem we set out to fix.
- **Scale a house system's ramp by a fixed multiplier.** Rejected because it
  preserves step ratios tuned to another product's density problem.
- **Apple HIG as the primary authority** (the original request). Demoted: the
  macOS scale's 13pt body is what this app already had, and HIG's 44pt touch
  target is WCAG 2.2 AAA (2.5.5), not the AA floor (2.5.8, 24x24 CSS px).

## Consequences

**Type.** A 1.2 modular ramp anchored at 19px — 16, 19, 23, 27, 33, 39 — with
15px as an absolute floor. The six-step ramp remains the primary scale; compact
metadata has one named 15px floor token so uppercase context can stay visually
subordinate without returning to illegible 9px text. This collapses the main
type hierarchy from 13 distinct sizes to 6: the previous near-identical steps
were why hierarchy leaned on faded text instead of on size. Sizes are expressed
in `rem` so the reader's own browser font-size setting is honoured rather than
discarded. Line height 1.5 body, 1.3 headings, 1.4 table cells.

**Colour.** 7:1 for body text, 4.5:1 at 24px and above, 3:1 non-text; the
conformance *claim* remains AA. Calibration is age-inclusive, at the 20–22
arcminute end of the ISO band, because contrast sensitivity declines with age
alongside acuity. `--faint` is retired as a text colour and survives only for
borders and swatches.

**Labels.** The single `.eyebrow` class was doing two jobs. Field labels (naming
a value that would otherwise be an unlabelled number) are kept and made legible
at the compact 15px metadata floor, with tracking reduced 0.14em → 0.06em and
weight 500. Section kickers that merely paraphrase the heading beneath them are
deleted. Uppercase is retained deliberately — it is the instrument-software
register — but it is no longer asked to create hierarchy at 9px or compete with
the 19px body step.

**Density.** Where larger type collides with information density, density is
preserved by showing fewer things, not by shrinking text. The run table drops
from 9 columns to 6: `dataRateGbps` and `pattern` each hold exactly one distinct
value across all 12 fixture runs and move to the dataset strip as constants of
the fixture set, and the `Open` column duplicated a link the row already had.

**Plots.** SVG overlays use `viewBox="0 0 1000 520"` with `width: 100%`, so CSS
font sizes there are drawing units scaled by (rendered width / 1000) — the same
rule rendered ~12px on the run detail page and ~7px on the two-up comparison
page, with the contour annotation at ~5px. The comparison panels are therefore
stacked vertically rather than placed side by side, bringing both surfaces to
~1.1x so one set of drawing-unit sizes clears the floor everywhere. This costs
nothing structurally: the two panels are "Target contours" and "Log-BER change",
two different views, not a baseline/later pair — the baseline/later comparison
already happens within the contours panel via overlaid paths. The contour
annotation box grows from 163x27 to roughly 240x40 drawing units to suit.

**Targets.** Sized by Fitts's Law rather than by one imported constant: 44x44
for standalone actions, 24x24 (the WCAG 2.2 AA minimum) for in-context controls
such as sort headers, whose pointer travel is already short.

**Spacing.** Regularised to a 4px grid, replacing the previous arbitrary values
(11, 15, 19, 21, 29, 37, 43px). 4px rather than 8px because the table's internal
padding needs the finer step.

**Caveat.** CSS px to physical millimetres is approximate and drifts with
display density and OS scaling; treat the derived sizes as +/-15%, not exact.

## Deliberately out of scope

- **Dark mode.** Doubles the colour work and requires rethinking the viridis
  heatmap ramp and contour halos against a dark ground.
- **How censoring is encoded.** A zero-error cell shows a 95% upper bound, not a
  measured rate, and confusing the two is the most consequential misreading
  available in this UI. The sizing work here makes that disclosure legible; the
  separate question of whether a bound should look *categorically* different
  from a measurement is a design problem, not a typography one.
