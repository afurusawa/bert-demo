import { useMemo, useState } from "react";
import {
  DIAGNOSIS_CAUSES,
  DIAGNOSIS_FEATURES,
  causeSpec,
  diagnose,
  featureSpec,
  type DiagnosisCase,
  type CauseId,
  type DiagnosisWorkspace,
  type FeatureEvidence,
} from "./diagnosis-model";
import {
  CalibrationPlot,
  ConfusionMatrixPlot,
  CorpusCompositionPlot,
  LearningCurvePlot,
} from "./diagnosis-plots";
import { FeatureLikelihoodDiagram, PipelineDiagram } from "./diagnosis-diagrams";
import { formatNumber, formatPercent, formatSigned } from "./formatters";

function formatCaseDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

/**
 * The confidence threshold this demo treats as "worth showing an engineer a
 * single answer". Below it the surface asks for the shortlist to be read
 * instead. It is a product decision, not a model output.
 */
const AUTOMATION_THRESHOLD = 0.6;

function ConfidenceCell({ confidence }: { confidence: number }) {
  const isConfident = confidence >= AUTOMATION_THRESHOLD;

  return (
    <div className="confidence-cell">
      <span className="confidence-track" aria-hidden="true">
        <span className="confidence-fill" style={{ width: `${Math.round(confidence * 100)}%` }} />
      </span>
      <span className="confidence-figure">{formatPercent(confidence, 0)}</span>
      <span className={isConfident ? "call-chip call-chip-firm" : "call-chip call-chip-open"}>
        {isConfident ? "single call" : "read shortlist"}
      </span>
    </div>
  );
}

function EvidenceRow({ evidence }: { evidence: FeatureEvidence }) {
  const spec = featureSpec(evidence.feature);

  return (
    <li className="evidence-row">
      <div className="evidence-row-head">
        <span className="evidence-feature">{spec.label}</span>
        <span className="evidence-value">
          {formatNumber(evidence.value, spec.digits)} {spec.unit ? <span className="unit">{spec.unit}</span> : null}
        </span>
      </div>
      <p className="evidence-comparison">
        typical for the leading cause {formatNumber(evidence.leadingMean, spec.digits)}, for the runner-up{" "}
        {formatNumber(evidence.runnerUpMean, spec.digits)} · {formatSigned(evidence.contribution, 2)} log-odds
      </p>
    </li>
  );
}

function ReviewCasePanel({
  workspace,
  reviewCase,
}: {
  workspace: DiagnosisWorkspace;
  reviewCase: DiagnosisCase;
}) {
  const diagnosis = useMemo(
    () => diagnose(workspace.classifier, reviewCase.features),
    [reviewCase, workspace.classifier],
  );
  const shortlist = diagnosis.ranked.slice(0, 3);
  const leading = causeSpec(diagnosis.leading);

  return (
    <section className="detail-panel review-panel" aria-labelledby="review-case-title">
      <div className="section-heading compact-heading">
        <div>
          <p className="field-label">CASE UNDER REVIEW</p>
          <h2 id="review-case-title">
            {reviewCase.dut} <span aria-hidden="true">/</span> Lane {reviewCase.lane}
          </h2>
        </div>
        <span className="mono-value">{reviewCase.id}</span>
      </div>
      <p className="review-context">
        {reviewCase.site} · {reviewCase.cable} · {reviewCase.ambientC} °C ·{" "}
        {formatCaseDate(reviewCase.recordedAt)}
      </p>

      <ol className="shortlist">
        {shortlist.map((entry, index) => {
          const spec = causeSpec(entry.cause);
          return (
            <li key={entry.cause} className={index === 0 ? "shortlist-item leading" : "shortlist-item"}>
              <div className="shortlist-head">
                <span className="shortlist-rank">{index + 1}</span>
                <span className="shortlist-label">{spec.label}</span>
                <span className="shortlist-figure">{formatPercent(entry.probability, 0)}</span>
              </div>
              <span className="confidence-track" aria-hidden="true">
                <span className="confidence-fill" style={{ width: `${Math.round(entry.probability * 100)}%` }} />
              </span>
              <p className="shortlist-signature">{spec.signature}</p>
            </li>
          );
        })}
      </ol>

      <div className="review-action">
        <span className="field-label">SUGGESTED NEXT STEP</span>
        <p>{leading.action}</p>
      </div>

      <div className="review-evidence">
        <span className="field-label">WHY THIS CAUSE AND NOT THE RUNNER-UP</span>
        <ul className="evidence-list-block">
          {diagnosis.evidence.slice(0, 3).map((evidence) => (
            <EvidenceRow key={evidence.feature} evidence={evidence} />
          ))}
        </ul>
      </div>

      <div className="confidence-note">
        <span className="confidence-icon" aria-hidden="true">i</span>
        <p>
          Nothing here is a verdict. The engineer who works this case writes the cause down, and that
          sentence is what the next model is fitted on.
        </p>
      </div>
    </section>
  );
}

function ReviewQueue({
  workspace,
  selectedId,
  onSelect,
}: {
  workspace: DiagnosisWorkspace;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const rows = useMemo(
    () =>
      workspace.splits.pending.map((item) => ({
        item,
        diagnosis: diagnose(workspace.classifier, item.features),
      })),
    [workspace],
  );

  return (
    <section className="table-section" aria-labelledby="queue-title">
      <div className="section-heading">
        <div>
          <h2 id="queue-title">Unresolved failures</h2>
        </div>
        <p className="section-help">Select a row to see the shortlist and the evidence behind it.</p>
      </div>
      <div className="table-frame queue-frame">
        <table className="run-table queue-table">
          <caption className="visually-hidden">Pending failures with the model's ranked cause</caption>
          <thead>
            <tr>
              <th scope="col"><span className="field-label">CASE</span></th>
              <th scope="col"><span className="field-label">SEEN</span></th>
              <th scope="col"><span className="field-label">LINK</span></th>
              <th scope="col"><span className="field-label">LEADING CAUSE</span></th>
              <th scope="col"><span className="field-label">CONFIDENCE</span></th>
              <th scope="col"><span className="field-label">RUNNER-UP</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, diagnosis }) => (
              <tr
                key={item.id}
                className={item.id === selectedId ? "queue-row selected" : "queue-row"}
                aria-selected={item.id === selectedId}
              >
                <td>
                  <button className="queue-select" onClick={() => onSelect(item.id)}>
                    <span className="primary-value mono-value">{item.id}</span>
                    <span className="sub-value">{item.site}</span>
                  </button>
                </td>
                <td>{formatCaseDate(item.recordedAt)}</td>
                <td>
                  <span className="primary-value">{item.dut}</span>
                  <span className="sub-value">Lane {item.lane} · {item.cable}</span>
                </td>
                <td>{causeSpec(diagnosis.leading).label}</td>
                <td><ConfidenceCell confidence={diagnosis.confidence} /></td>
                <td className="runner-up-cell">
                  {diagnosis.runnerUp ? causeSpec(diagnosis.runnerUp).short : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footnote">
        <span>Every row is a failure nobody has resolved yet. The model only orders the guesses.</span>
        <span>Rows {rows.length}</span>
      </div>
    </section>
  );
}

function PerClassTable({ workspace }: { workspace: DiagnosisWorkspace }) {
  const rows = [...workspace.holdout.perClass].sort((first, second) => second.support - first.support);

  return (
    <div className="table-frame">
      <table className="run-table per-class-table">
        <caption className="visually-hidden">Per-cause precision and recall on the holdout split</caption>
        <thead>
          <tr>
            <th scope="col"><span className="field-label">CAUSE</span></th>
            <th className="numeric-cell" scope="col"><span className="field-label">HOLDOUT CASES</span></th>
            <th className="numeric-cell" scope="col"><span className="field-label">RECALL</span></th>
            <th className="numeric-cell" scope="col"><span className="field-label">PRECISION</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const trained = workspace.classifier.classes.find((entry) => entry.cause === row.cause);
            return (
              <tr key={row.cause}>
                <td>
                  <span className="primary-value">{causeSpec(row.cause).label}</span>
                  <span className="sub-value">
                    {trained ? `${trained.count} training examples` : "too few to fit"}
                  </span>
                </td>
                <td className="numeric-cell">{row.support}</td>
                <td className="numeric-cell">{formatPercent(row.recall, 0)}</td>
                <td className="numeric-cell">{formatPercent(row.precision, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DiagnosisDashboard({ workspace }: { workspace: DiagnosisWorkspace }) {
  const [selectedId, setSelectedId] = useState(workspace.splits.pending[0]?.id ?? "");
  const selectedCase =
    workspace.splits.pending.find((item) => item.id === selectedId) ?? workspace.splits.pending[0];
  const rarest = [...workspace.causeCounts].sort((first, second) => first.count - second.count)[0];
  const rarestScore = workspace.holdout.perClass.find((row) => row.cause === rarest?.cause);

  return (
    <main className="page-width page-content diagnosis-page">
      <section className="page-heading">
        <div>
          <h1>Failure diagnosis</h1>
          <p className="lede">
            The instrument says how far the eye closed. This says why — by asking which of{" "}
            {formatNumber(workspace.labelledCount, 0)} failures somebody already resolved the new one
            most resembles.
          </p>
        </div>
        <div className="heading-stat" aria-label={`${workspace.labelledCount} labelled examples`}>
          <span className="heading-stat-value">{formatNumber(workspace.labelledCount, 0)}</span>
          <span className="field-label">LABELLED EXAMPLES</span>
        </div>
      </section>

      <section className="dataset-strip" aria-label="Case and model summary">
        <div className="dataset-item">
          <span className="field-label">CAUSES</span>
          <span className="dataset-value">{DIAGNOSIS_CAUSES.length} actionable labels</span>
        </div>
        <div className="dataset-item">
          <span className="field-label">FEATURES</span>
          <span className="dataset-value">{DIAGNOSIS_FEATURES.length} per case</span>
        </div>
        <div className="dataset-item">
          <span className="field-label">HOLDOUT TOP-1</span>
          <span className="dataset-value">{formatPercent(workspace.holdout.accuracy, 1)} correct</span>
        </div>
        <div className="dataset-item">
          <span className="field-label">HOLDOUT TOP-2</span>
          <span className="dataset-value">{formatPercent(workspace.holdout.topTwoAccuracy, 1)} in the pair</span>
        </div>
        <div className="dataset-item">
          <span className="field-label">AWAITING REVIEW</span>
          <span className="dataset-value">{workspace.splits.pending.length} open failures</span>
        </div>
      </section>

      <section className="comparison-callout diagnosis-callout" aria-labelledby="method-callout-title">
        <div>
          <h2 id="method-callout-title">The model is the easy half</h2>
          <p>
            Fitted here in the browser from the stored examples, on{" "}
            {formatNumber(workspace.classifier.trainingSize, 0)} of them, and scored on{" "}
            {workspace.holdout.evaluated} it never saw.
          </p>
        </div>
        <a className="primary-button" href="/diagnosis/method">
          How this would be built <span aria-hidden="true">→</span>
        </a>
      </section>

      <div className="review-columns">
        {selectedCase ? <ReviewCasePanel workspace={workspace} reviewCase={selectedCase} /> : null}
        <section className="detail-panel diagnosis-note-panel" aria-labelledby="queue-note-title">
          <div className="section-heading compact-heading">
            <div>
              <p className="field-label">WHAT THE QUEUE IS FOR</p>
              <h2 id="queue-note-title">Ranking, not deciding</h2>
            </div>
          </div>
          <p>
            A confidence below {formatPercent(AUTOMATION_THRESHOLD, 0)} is not a failure of the model.
            It is the model reporting that two causes look alike on these ten numbers, which is worth
            more to an engineer than a confident wrong answer.
          </p>
          <p>
            Across the holdout the confirmed cause is the leading call{" "}
            {formatPercent(workspace.holdout.accuracy, 0)} of the time and is in the top two{" "}
            {formatPercent(workspace.holdout.topTwoAccuracy, 0)} of the time. A shortlist of two is
            already most of the value: it halves what has to be checked on the bench.
          </p>
          <div className="confidence-note">
            <span className="confidence-icon" aria-hidden="true">i</span>
            <p>
              Median time from a failure being seen to its cause being written down in this fixture is{" "}
              {formatNumber(workspace.medianDaysToLabel, 0)} working days. That delay, repeated a few
              thousand times, is the thing that cannot be bought.
            </p>
          </div>
        </section>
      </div>

      <ReviewQueue workspace={workspace} selectedId={selectedCase?.id ?? ""} onSelect={setSelectedId} />

      <section className="detail-panel chart-panel" aria-labelledby="curve-title">
        <div className="section-heading compact-heading">
          <div>
            <p className="field-label">THE ARGUMENT, MEASURED</p>
            <h2 id="curve-title">Accuracy against the number of labelled examples</h2>
          </div>
          <p className="plot-summary">every point scored on the same untouched holdout</p>
        </div>
        <LearningCurvePlot curve={workspace.curve} />
        <p className="chart-note">
          A dozen examples buys {formatPercent(workspace.curve[0]?.accuracy ?? 0, 0)}. The curve is still
          climbing at {workspace.classifier.trainingSize}, and it climbs slowest on the causes that are
          rarest, which is the honest reason you need many labelled cases and not merely clean ones.
        </p>
      </section>

      <section className="detail-panel chart-panel" aria-labelledby="composition-title">
        <div className="section-heading compact-heading">
          <div>
            <p className="field-label">CASE COMPOSITION</p>
            <h2 id="composition-title">Confirmed examples per cause</h2>
          </div>
        </div>
        <CorpusCompositionPlot counts={workspace.causeCounts} />
        {rarest && rarestScore ? (
          <p className="chart-note">
            {causeSpec(rarest.cause).label} has {rarest.count} examples across all the labelled cases, and the
            model recovers {formatPercent(rarestScore.recall, 0)} of them. Failures do not arrive in
            equal numbers, so the rare causes stay starved long after the common ones are solved.
          </p>
        ) : null}
      </section>

      <section className="detail-panel chart-panel" aria-labelledby="confusion-title">
        <div className="section-heading compact-heading">
          <div>
            <p className="field-label">WHERE IT IS WRONG</p>
            <h2 id="confusion-title">Confirmed cause against called cause</h2>
          </div>
          <p className="plot-summary">{workspace.holdout.evaluated} holdout cases · shaded by row share</p>
        </div>
        <ConfusionMatrixPlot evaluation={workspace.holdout} />
        <p className="chart-note">
          Rows are what the engineer confirmed; columns are what the model called. The diagonal is the
          agreement. The mass off it is not noise, it is pairs of causes that leave a similar mark on
          these ten measurements.
        </p>
        <PerClassTable workspace={workspace} />
      </section>

      <section className="detail-panel chart-panel" aria-labelledby="calibration-title">
        <div className="section-heading compact-heading">
          <div>
            <p className="field-label">HONEST CONFIDENCE</p>
            <h2 id="calibration-title">What it claims against what it earns</h2>
          </div>
          <p className="plot-summary">temperature {formatNumber(workspace.classifier.temperature, 2)}</p>
        </div>
        <CalibrationPlot
          accuracy={workspace.holdout.accuracy}
          calibratedConfidence={workspace.holdout.meanConfidence}
          uncalibratedConfidence={workspace.uncalibrated.meanConfidence}
        />
        <p className="chart-note">
          Raw, the model states {formatPercent(workspace.uncalibrated.meanConfidence, 0)} confidence while
          being right {formatPercent(workspace.uncalibrated.accuracy, 0)} of the time. One scalar fitted on
          a held-back slice brings the claim down to {formatPercent(workspace.holdout.meanConfidence, 0)}
          {" "}without changing a single prediction. An engineer can act on the second number; the first
          would burn their trust once.
        </p>
      </section>
    </main>
  );
}

export function DiagnosisMethod({ workspace }: { workspace: DiagnosisWorkspace }) {
  const coldStart = workspace.curve[0];
  const confusablePair = useMemo(() => {
    let best: { actual: CauseId; predicted: CauseId; count: number } = {
      actual: DIAGNOSIS_CAUSES[0].id,
      predicted: DIAGNOSIS_CAUSES[1].id,
      count: -1,
    };

    for (const actual of DIAGNOSIS_CAUSES) {
      for (const predicted of DIAGNOSIS_CAUSES) {
        if (actual.id === predicted.id) {
          continue;
        }

        const count = workspace.holdout.confusion[actual.id][predicted.id];
        if (count > best.count) {
          best = { actual: actual.id, predicted: predicted.id, count };
        }
      }
    }

    return best;
  }, [workspace]);

  return (
    <main className="page-width page-content diagnosis-method-page">
      <a className="back-link" href="/diagnosis">← Back to diagnosis</a>
      <section className="page-heading">
        <div>
          <p className="field-label">METHOD</p>
          <h1>How you would build a diagnosis feature</h1>
          <p className="lede">
            The classifier on the previous page is a few hundred lines of code. The labelled cases it
            reads take years to collect. This page follows the build in the order you would do it: what
            you are accumulating, where the labels come from, what the model does with them, how the
            first version ships before you have any, and what to watch once it runs.
          </p>
        </div>
      </section>

      <section className="prose-block">
        <h2>The labelled cases are the asset</h2>
        <p>
          Hardware is a recipe. A competitor who sees an eight-port tester buys the same FPGA, spends a
          few months, and ships the same box. That has already happened to everyone in this market. A
          diagnosis feature works the other way round. Its main ingredient is failures that somebody
          already resolved and wrote the cause down for, and that ingredient is not for sale.
        </p>
        <PipelineDiagram
          labelledCount={workspace.labelledCount}
          causeCount={DIAGNOSIS_CAUSES.length}
        />
        <p>
          The four steps across the top are an afternoon of work. The block underneath is the part that
          compounds. It fills at the rate real links fail and real engineers finish resolving them, so a
          year of shipping puts you a year ahead of whoever starts next year.
        </p>
      </section>

      <section className="prose-block">
        <h2>Where the labels come from</h2>
        <p>
          A label is not a measurement. It starts as a sentence an engineer writes at the end of a debug
          session, such as "the crimp on pin 4 was cold, reterminated and it passed". Somebody then files
          that sentence under one of a small set of causes, and each cause changes what the next person
          does at the bench. Three consequences follow.
        </p>
        <ul className="prose-list">
          <li>
            <strong>The label set has to be actionable.</strong> A cause nobody can act on is not worth
            predicting. This demo uses {DIAGNOSIS_CAUSES.length} causes, and each one leads to a different
            next step on the bench.
          </li>
          <li>
            <strong>Labels arrive late.</strong> The station records the failure on day zero. The engineer
            finds the cause days later, if anyone closes the case at all. In this fixture the median gap
            is {formatNumber(workspace.medianDaysToLabel, 0)} working days.
          </li>
          <li>
            <strong>Some labels are wrong.</strong> The engineer who wrote "crosstalk" sometimes had a
            reflection. A few percent of bad labels caps how accurate anything fitted on top can get, so
            reviewing the labels pays better than tuning the model.
          </li>
        </ul>
        <p>
          So you take the labels from the workflow that already exists. The test station holds the
          measurement and the ticket holds the resolution. Join the two while the engineer still
          remembers, and the labelled cases accumulate as a by-product of work somebody was doing anyway.
          The vendor who ships the instrument is the only one holding both halves.
        </p>
      </section>

      <section className="prose-block">
        <h2>What the model does with them</h2>
        <p>
          The model is a Gaussian naive Bayes classifier, picked because it is the least clever thing that
          works. For each cause it stores a mean and a variance per feature, then asks which cause makes
          the ten observed numbers least surprising. The page fits it in the browser at load time, from
          the same fixture the dashboard reads. No number on either page is typed in by hand.
        </p>
        <p>
          A simple model is the right choice here because it makes the labelled cases, not the
          architecture, the thing under test. If accuracy rises when you add examples and stalls when
          you stop, that is a fact about the data. A gradient-boosted tree would move the curve up a few points and change
          none of the conclusions.
        </p>
        <FeatureLikelihoodDiagram
          classifier={workspace.classifier}
          feature="returnLossDb"
          first={confusablePair.actual}
          second={confusablePair.predicted}
        />
        <p>
          The two distributions overlap almost everywhere. That overlap is why the model calls{" "}
          {causeSpec(confusablePair.actual).short} a {causeSpec(confusablePair.predicted).short}{" "}
          {confusablePair.count} times on the holdout. It multiplies ten features together to pull the
          causes apart. Where the physics coincides, the fix is a new measurement rather than more
          examples, and the overlap tells you which one you need.
        </p>
      </section>

      <section className="prose-block">
        <h2>How the first version ships</h2>
        <p>
          With {coldStart?.labelledExamples ?? 0} examples the model is right{" "}
          {formatPercent(coldStart?.accuracy ?? 0, 0)} of the time. That is not a product. It reaches{" "}
          {formatPercent(workspace.holdout.accuracy, 0)} at {workspace.classifier.trainingSize} examples
          and is still climbing. The first release therefore has to be worth using for another reason
          while it collects labels. Ship it as a triage queue, as a "what was it?" prompt at the end of a
          failing run, or as an importer for the debug notes the customer already writes. Each one is
          useful on day one, and each one produces labels while people use it.
        </p>
        <p>
          Three things get you to useful accuracy sooner, in rough order of how much they help.
        </p>
        <ul className="prose-list">
          <li>
            Start with failures the vendor's own applications engineers have already resolved.
          </li>
          <li>Make labelling one click inside the flow the engineer is already in.</li>
          <li>
            Ask about the cases the model is least sure of. One case sitting between two causes teaches
            it more than several obvious ones.
          </li>
        </ul>
      </section>

      <section className="prose-block">
        <h2>Four things to watch</h2>
        <ul className="prose-list">
          <li>
            <strong>Overconfidence.</strong> Naive Bayes multiplies ten correlated features as if they
            were independent and reports{" "}
            {formatPercent(workspace.uncalibrated.meanConfidence, 0)} confidence at{" "}
            {formatPercent(workspace.uncalibrated.accuracy, 0)} accuracy. Temperature scaling on the
            calibration split fixes the claim without touching the predictions.
          </li>
          <li>
            <strong>Class imbalance.</strong> Common causes crowd out rare ones. The two or three most
            frequent labels dominate every accuracy figure on these pages. Read per-cause recall instead
            of the headline number, and point the labelling effort at the causes with the fewest cases.
          </li>
          <li>
            <strong>Confounds that look like signal.</strong> Long cables and hot racks move the same
            features that causes do. A model fitted on one site's cable lengths can learn the site
            instead of the physics. Hold out a whole site rather than a random slice, and the score tells
            you which one it learned.
          </li>
          <li>
            <strong>Distribution shift.</strong> A new connector generation or a firmware change moves the
            features underneath a model that was right last quarter. Fitting the model once is not
            enough. Keep the labelling loop running after launch and refit on a schedule.
          </li>
        </ul>
        <div className="detail-actions">
          <a className="secondary-button" href="/diagnosis">Back to the diagnosis dashboard</a>
        </div>
      </section>
    </main>
  );
}
