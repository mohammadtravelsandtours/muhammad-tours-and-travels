import { Injectable } from '@nestjs/common';

/**
 * A minimal, dependency-free Prometheus-format metrics registry.
 *
 * This deliberately does NOT use the `prom-client` package — this
 * sandbox has no reachable npm registry to install any new dependency
 * against (see every other Phase 9/10 file's own note on this), and a
 * hand-rolled counter/histogram covering exactly the handful of series
 * this platform actually needs is a legitimate, small, dependency-free
 * substitute for the Prometheus text exposition format
 * (https://prometheus.io/docs/instrumenting/exposition_formats/), not a
 * shortcut. If this platform's metrics needs grow far beyond counters
 * and one fixed histogram, replace this with `prom-client` — a real npm
 * install, once one is possible — rather than extending this by hand
 * indefinitely.
 */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  // Fixed-bucket histogram, seconds — matches Prometheus's own convention
  // (http_request_duration_seconds) so a real Prometheus/Grafana stack
  // reads this exactly like any other exporter's histogram.
  private static readonly HISTOGRAM_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly histogramBucketCounts = new Map<string, number[]>();
  private readonly histogramSums = new Map<string, number>();
  private readonly histogramCounts = new Map<string, number>();

  private readonly startedAt = Date.now();

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.seriesKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  /** `valueSeconds` — always seconds, to match Prometheus convention, whatever unit the caller measured in. */
  observeHistogram(name: string, labels: Record<string, string>, valueSeconds: number): void {
    const key = this.seriesKey(name, labels);
    if (!this.histogramBucketCounts.has(key)) {
      this.histogramBucketCounts.set(key, new Array(MetricsService.HISTOGRAM_BUCKETS.length).fill(0));
    }
    const buckets = this.histogramBucketCounts.get(key)!;
    for (let i = 0; i < MetricsService.HISTOGRAM_BUCKETS.length; i++) {
      if (valueSeconds <= MetricsService.HISTOGRAM_BUCKETS[i]) buckets[i]++;
    }
    this.histogramSums.set(key, (this.histogramSums.get(key) ?? 0) + valueSeconds);
    this.histogramCounts.set(key, (this.histogramCounts.get(key) ?? 0) + 1);
  }

  /**
   * Renders every counter/histogram plus a fixed set of "gauge" lines the
   * caller supplies fresh at scrape time (e.g. current supplier health,
   * read from the database) — gauges are never accumulated here, since
   * their whole point is "the value right now", not a running total.
   */
  render(extraGaugeLines: string[] = []): string {
    const lines: string[] = [];

    lines.push('# HELP process_uptime_seconds Seconds since this process started.');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(3)}`);

    const counterNames = new Set([...this.counters.keys()].map((k) => k.split('{')[0]));
    for (const name of counterNames) {
      lines.push(`# TYPE ${name} counter`);
      for (const [key, value] of this.counters) {
        if (key.split('{')[0] === name) lines.push(`${key} ${value}`);
      }
    }

    const histogramNames = new Set([...this.histogramCounts.keys()].map((k) => k.split('{')[0]));
    for (const name of histogramNames) {
      lines.push(`# TYPE ${name} histogram`);
      for (const [key, count] of this.histogramCounts) {
        if (key.split('{')[0] !== name) continue;
        const labelPart = key.includes('{') ? key.slice(key.indexOf('{'), key.lastIndexOf('}') + 1) : '';
        const bareLabels = labelPart.slice(1, -1); // strip { }
        const buckets = this.histogramBucketCounts.get(key)!;
        for (let i = 0; i < MetricsService.HISTOGRAM_BUCKETS.length; i++) {
          const withLe = bareLabels ? `{${bareLabels},le="${MetricsService.HISTOGRAM_BUCKETS[i]}"}` : `{le="${MetricsService.HISTOGRAM_BUCKETS[i]}"}`;
          lines.push(`${name}_bucket${withLe} ${buckets[i]}`);
        }
        const infLabels = bareLabels ? `{${bareLabels},le="+Inf"}` : `{le="+Inf"}`;
        lines.push(`${name}_bucket${infLabels} ${count}`);
        lines.push(`${name}_sum${labelPart} ${(this.histogramSums.get(key) ?? 0).toFixed(6)}`);
        lines.push(`${name}_count${labelPart} ${count}`);
      }
    }

    lines.push(...extraGaugeLines);

    return lines.join('\n') + '\n';
  }

  private seriesKey(name: string, labels: Record<string, string>): string {
    const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return name;
    const labelStr = entries.map(([k, v]) => `${k}="${this.escapeLabelValue(v)}"`).join(',');
    return `${name}{${labelStr}}`;
  }

  private escapeLabelValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
