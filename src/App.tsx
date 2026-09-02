import { useEffect, useMemo, useState } from "react";
import {
  calculateEyeMetrics,
  type EyeMetrics,
  type ScanRun,
} from "./scan-model";
import { loadRuns } from "./run-loader";

type Route =
  | { kind: "history" }
  | { kind: "run"; runId: string }
  | { kind: "not-found" };

type SortKey =
  | "date"
  | "dut"
  | "lane"
  | "rate"
  | "pattern"
  | "temperature"
  | "width"
  | "height";

interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

function getRoute(): Route {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/" || pathname === "/runs") {
    return { kind: "history" };
  }

  const runMatch = pathname.match(/^\/runs\/([^/]+)$/);
  if (runMatch) {
    return { kind: "run", runId: decodeURIComponent(runMatch[1]) };
  }

  return { kind: "not-found" };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatBer(value: number): string {
  return value.toExponential(1).replace("e+", "e");
}

function sortValue(run: ScanRun, key: SortKey, metrics: EyeMetrics): string | number {
  switch (key) {
    case "date":
      return run.startedAt;
    case "dut":
      return run.dut.id;
    case "lane":
      return run.lane;
    case "rate":
      return run.dataRateGbps;
    case "pattern":
      return run.pattern;
    case "temperature":
      return run.temperatureC;
    case "width":
      return metrics.widthPs;
    case "height":
      return metrics.heightMv;
  }
}

function compareRuns(
  first: ScanRun,
  second: ScanRun,
  state: SortState,
  metricsById: ReadonlyMap<string, EyeMetrics>,
): number {
  const firstValue = sortValue(first, state.key, metricsById.get(first.id)!);
  const secondValue = sortValue(second, state.key, metricsById.get(second.id)!);
  const comparison =
    typeof firstValue === "number" && typeof secondValue === "number"
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue), undefined, {
          numeric: true,
          sensitivity: "base",
        });

  return comparison * (state.direction === "asc" ? 1 : -1);
}

function AppShell({ children }: { children: React.ReactNode }) {
  const route = getRoute();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="Eye Scan Results home">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <span className="brand-name">Eye Scan Results</span>
              <span className="brand-subtitle">measurement workspace</span>
            </span>
          </a>
          <nav className="primary-nav" aria-label="Primary navigation">
            <a className={route.kind === "history" ? "nav-link active" : "nav-link"} href="/">
              Run history
            </a>
          </nav>
          <div className="topbar-status">
            <span className="status-dot" aria-hidden="true" />
            <span>OFFLINE FIXTURES</span>
          </div>
        </div>
      </header>
      <div className="synthetic-banner">
        <div className="page-width banner-inner">
          <span className="banner-label">SYNTHETIC DATA</span>
          <span>
            Deterministic offline fixtures for interface demonstration. No instrument or customer data is connected.
          </span>
        </div>
      </div>
      {children}
      <footer className="page-footer page-width">
        <span>Eye Scan Results</span>
        <span>Static demo · generated scan fixtures</span>
      </footer>
    </div>
  );
}

function SortButton({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: SortState;
  onSort: (column: SortKey) => void;
}) {
  const isActive = sort.key === column;
  const indicator = isActive ? (sort.direction === "asc" ? "↑" : "↓") : "↕";

  return (
    <button className={isActive ? "sort-button sorted" : "sort-button"} onClick={() => onSort(column)}>
      <span>{label}</span>
      <span className="sort-indicator" aria-hidden="true">
        {indicator}
      </span>
    </button>
  );
}

function RunHistory({ runs }: { runs: ScanRun[] }) {
  const [sort, setSort] = useState<SortState>({ key: "date", direction: "desc" });
  const metricsById = useMemo(
    () => new Map(runs.map((run) => [run.id, calculateEyeMetrics(run)])),
    [runs],
  );
  const sortedRuns = useMemo(
    () => [...runs].sort((first, second) => compareRuns(first, second, sort, metricsById)),
    [metricsById, runs, sort],
  );

  const changeSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "date" ? "desc" : "asc" },
    );
  };

  return (
    <main className="page-width page-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">RUN BROWSER / STATIC DATASET</p>
          <h1>Run history</h1>
          <p className="lede">
            Twelve lane scans across a healthy baseline, a later unit, and a stabilized thermal condition.
          </p>
        </div>
        <div className="heading-stat" aria-label={`${runs.length} stored scans`}>
          <span className="heading-stat-value">{runs.length}</span>
          <span className="heading-stat-label">stored scans</span>
        </div>
      </section>

      <section className="dataset-strip" aria-label="Fixture dataset summary">
        <div className="dataset-item">
          <span className="dataset-key">GROUPS</span>
          <span className="dataset-value">Baseline · later unit · thermal</span>
        </div>
        <div className="dataset-item">
          <span className="dataset-key">SWEEP</span>
          <span className="dataset-value">65 phase × 45 threshold points</span>
        </div>
        <div className="dataset-item">
          <span className="dataset-key">DWELL</span>
          <span className="dataset-value">1.0 × 10⁹ bits / point</span>
        </div>
      </section>

      <section className="table-section" aria-labelledby="run-table-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ALL RUNS</p>
            <h2 id="run-table-title">Stored measurements</h2>
          </div>
          <p className="section-help">Select a row to open its shareable run record.</p>
        </div>
        <div className="table-frame">
          <table className="run-table">
            <caption className="visually-hidden">Sortable stored synthetic eye-scan measurements</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={sort.key === "date" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Date" column="date" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "dut" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="DUT" column="dut" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "lane" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Lane" column="lane" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "rate" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Rate" column="rate" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "pattern" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Pattern" column="pattern" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "temperature" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Temp" column="temperature" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "width" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Eye width" column="width" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col" aria-sort={sort.key === "height" ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <SortButton label="Eye height" column="height" sort={sort} onSort={changeSort} />
                </th>
                <th scope="col"><span className="visually-hidden">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {sortedRuns.map((run) => {
                const metrics = metricsById.get(run.id)!;
                return (
                  <tr key={run.id}>
                    <td className="date-cell">
                      <a className="row-link" href={`/runs/${encodeURIComponent(run.id)}`}>
                        {formatDate(run.startedAt)}
                      </a>
                      <span className="sub-value">{run.startedAt.slice(11, 16)} UTC</span>
                    </td>
                    <td>
                      <span className="primary-value">{run.dut.id}</span>
                      <span className="sub-value">{run.dut.description}</span>
                    </td>
                    <td className="numeric-cell"><span className="lane-badge">L{run.lane}</span></td>
                    <td className="numeric-cell">{run.dataRateGbps.toFixed(2)} <span className="unit">Gbps</span></td>
                    <td><span className="mono-value">{run.pattern}</span></td>
                    <td className="numeric-cell">{run.temperatureC} <span className="unit">°C</span></td>
                    <td className="metric-cell">
                      <span>{formatNumber(metrics.widthPs)} <span className="unit">ps</span></span>
                      <span className="sub-value">{metrics.widthUi.toFixed(3)} UI</span>
                    </td>
                    <td className="metric-cell">
                      <span>{formatNumber(metrics.heightMv)} <span className="unit">mV</span></span>
                      <span className="sub-value">95% upper bound</span>
                    </td>
                    <td className="open-cell"><a className="open-link" href={`/runs/${encodeURIComponent(run.id)}`} aria-label={`Open ${run.id}`}>Open <span aria-hidden="true">→</span></a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footnote">
          <span>Eye metrics use the 1e-6 BER target at one-sided 95% confidence.</span>
          <span>Rows {sortedRuns.length} / {runs.length}</span>
        </div>
      </section>
    </main>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd className={mono ? "mono-value" : undefined}>{value}</dd>
    </div>
  );
}

function RunDetail({ run, metrics }: { run: ScanRun; metrics: EyeMetrics }) {
  const zeroErrorPoints = run.cells.filter((cell) => cell.errors === 0).length;
  const totalErrors = run.cells.reduce((sum, cell) => sum + cell.errors, 0);
  const totalBits = run.cells.length * run.sweep.bitsTested;

  return (
    <main className="page-width page-content">
      <a className="back-link" href="/">← Back to run history</a>
      <section className="detail-heading">
        <div>
          <p className="eyebrow">RUN RECORD / {formatDate(run.startedAt)}</p>
          <div className="detail-title-line">
            <h1>{run.dut.id} <span>/</span> Lane {run.lane}</h1>
            <span className="fixture-chip">SYNTHETIC FIXTURE</span>
          </div>
          <p className="lede">{run.dut.description} · {run.dataRateGbps.toFixed(2)} Gbps · {run.pattern}</p>
        </div>
        <div className="run-id-block">
          <span className="dataset-key">RUN ID</span>
          <span className="run-id mono-value">{run.id}</span>
        </div>
      </section>

      <section className="metric-grid" aria-label="Eye opening metrics">
        <article className="metric-card">
          <div className="metric-card-top"><span className="eyebrow">EYE WIDTH</span><span className="metric-mark">↔</span></div>
          <div className="large-metric">{formatNumber(metrics.widthPs)} <span>ps</span></div>
          <div className="metric-secondary">{metrics.widthUi.toFixed(3)} UI</div>
          <div className="metric-qualifier">at BER {formatBer(metrics.targetBer)} · {metrics.confidence * 100}% confidence</div>
        </article>
        <article className="metric-card">
          <div className="metric-card-top"><span className="eyebrow">EYE HEIGHT</span><span className="metric-mark">↕</span></div>
          <div className="large-metric">{formatNumber(metrics.heightMv)} <span>mV</span></div>
          <div className="metric-secondary">threshold slice {formatNumber(metrics.thresholdSliceMv)} mV</div>
          <div className="metric-qualifier">at BER {formatBer(metrics.targetBer)} · {metrics.confidence * 100}% confidence</div>
        </article>
        <article className="metric-card metric-card-neutral">
          <div className="metric-card-top"><span className="eyebrow">GRID COVERAGE</span><span className="metric-mark">▦</span></div>
          <div className="large-metric">{run.sweep.phase.steps} × {run.sweep.threshold.steps}</div>
          <div className="metric-secondary">{formatNumber(run.cells.length, 0)} sweep points</div>
          <div className="metric-qualifier">{formatNumber(run.sweep.bitsTested, 0)} tested bits per point</div>
        </article>
      </section>

      <div className="detail-columns">
        <section className="detail-panel" aria-labelledby="context-title">
          <div className="section-heading compact-heading">
            <div><p className="eyebrow">TEST CONTEXT</p><h2 id="context-title">Run metadata</h2></div>
          </div>
          <dl className="detail-grid">
            <DetailField label="Started" value={`${formatDateTime(run.startedAt)} UTC`} />
            <DetailField label="Operator" value={run.operator} />
            <DetailField label="Instrument" value={run.instrument.serial} mono />
            <DetailField label="Firmware" value={run.instrument.firmware} mono />
            <DetailField label="DUT" value={run.dut.id} mono />
            <DetailField label="Description" value={run.dut.description} />
            <DetailField label="Lane" value={`Lane ${run.lane}`} />
            <DetailField label="Data rate" value={`${run.dataRateGbps.toFixed(2)} Gbps`} />
            <DetailField label="Pattern" value={run.pattern} mono />
            <DetailField label="Ambient" value={`${run.temperatureC} °C`} />
            <DetailField label="Phase sweep" value={`${run.sweep.phase.min} to +${run.sweep.phase.max} ps · ${run.sweep.phase.steps} steps`} />
            <DetailField label="Threshold sweep" value={`${run.sweep.threshold.min} to +${run.sweep.threshold.max} mV · ${run.sweep.threshold.steps} steps`} />
          </dl>
          {run.notes && <div className="notes-block"><span className="dataset-key">NOTES</span><p>{run.notes}</p></div>}
        </section>

        <section className="detail-panel evidence-panel" aria-labelledby="evidence-title">
          <div className="section-heading compact-heading">
            <div><p className="eyebrow">RAW MEASUREMENT EVIDENCE</p><h2 id="evidence-title">Stored scan data</h2></div>
          </div>
          <div className="evidence-list">
            <div><span>Raw error count</span><strong>{formatNumber(totalErrors, 0)}</strong></div>
            <div><span>Zero-error points</span><strong>{formatNumber(zeroErrorPoints, 0)} <small>/ {formatNumber(run.cells.length, 0)}</small></strong></div>
            <div><span>Tested bits, all points</span><strong>{formatNumber(totalBits, 0)}</strong></div>
          </div>
          <div className="confidence-note">
            <span className="confidence-icon" aria-hidden="true">i</span>
            <p>Raw integer counts and tested bits are retained in the fixture. BER and its one-sided upper confidence bound are derived when this record is read.</p>
          </div>
          <div className="detail-actions">
            <a className="secondary-button" href="/">Return to all runs</a>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="page-width page-content loading-state" aria-live="polite">
      <span className="loading-bar" />
      <p className="eyebrow">LOADING STATIC FIXTURES</p>
      <h1>Opening run history…</h1>
    </main>
  );
}

function ErrorState() {
  return (
    <main className="page-width page-content error-state">
      <p className="eyebrow">FIXTURE LOAD ERROR</p>
      <h1>Run history is unavailable.</h1>
      <p className="lede">The static measurement fixture could not be opened. Refresh to try again.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>Refresh</button>
    </main>
  );
}

function NotFound() {
  return (
    <main className="page-width page-content error-state">
      <p className="eyebrow">404 / RUN NOT FOUND</p>
      <h1>This run record does not exist.</h1>
      <p className="lede">Return to the stored fixture set to choose another run.</p>
      <a className="primary-button" href="/">Open run history</a>
    </main>
  );
}

export default function App() {
  const [runs, setRuns] = useState<ScanRun[] | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    loadRuns()
      .then((loadedRuns) => {
        if (active) {
          setRuns(loadedRuns);
        }
      })
      .catch(() => {
        if (active) {
          setHasLoadError(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  let content: React.ReactNode;
  if (hasLoadError) {
    content = <ErrorState />;
  } else if (!runs) {
    content = <LoadingState />;
  } else {
    const route = getRoute();
    if (route.kind === "history") {
      content = <RunHistory runs={runs} />;
    } else if (route.kind === "run") {
      const selectedRun = runs.find((run) => run.id === route.runId);
      content = selectedRun ? <RunDetail run={selectedRun} metrics={calculateEyeMetrics(selectedRun)} /> : <NotFound />;
    } else {
      content = <NotFound />;
    }
  }

  return <AppShell>{content}</AppShell>;
}
