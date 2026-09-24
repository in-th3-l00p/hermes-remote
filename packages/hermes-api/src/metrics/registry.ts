/** Latency buckets in seconds, sized for API calls and streamed turns. */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

type Labels = Record<string, string>;

// Sorted so the same labels given in any order map to one series.
const key = (labels: Labels): string =>
  Object.entries(labels)
    .map(
      ([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`,
    )
    .sort()
    .join(",");

/** A tiny Prometheus registry: counters, gauges and one histogram family. */
export class Metrics {
  private readonly counters = new Map<string, { help: string; values: Map<string, number> }>();
  private readonly histograms = new Map<
    string,
    { help: string; series: Map<string, { buckets: number[]; sum: number; count: number }> }
  >();
  private readonly gauges = new Map<string, { help: string; read: () => number }>();

  // Explicit so Bun's coverage doesn't count an implicit constructor (see HANDOFF.md).
  constructor() {}

  count(name: string, help: string, labels: Labels, by = 1): void {
    const family = this.counters.get(name) ?? { help, values: new Map() };
    this.counters.set(name, family);
    const k = key(labels);
    family.values.set(k, (family.values.get(k) ?? 0) + by);
  }

  observe(name: string, help: string, labels: Labels, seconds: number): void {
    const family = this.histograms.get(name) ?? { help, series: new Map() };
    this.histograms.set(name, family);
    const k = key(labels);
    const series = family.series.get(k) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    family.series.set(k, series);
    BUCKETS.forEach((bound, i) => {
      if (seconds <= bound) {
        series.buckets[i] = (series.buckets[i] as number) + 1;
      }
    });
    series.sum += seconds;
    series.count += 1;
  }

  /** A gauge read at scrape time. */
  gauge(name: string, help: string, read: () => number): void {
    this.gauges.set(name, { help, read });
  }

  /** Prometheus text exposition format. */
  render(): string {
    const out: string[] = [];
    for (const [name, { help, values }] of this.counters) {
      out.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
      for (const [labels, value] of values) {
        out.push(`${name}{${labels}} ${value}`);
      }
    }
    for (const [name, { help, series }] of this.histograms) {
      out.push(`# HELP ${name} ${help}`, `# TYPE ${name} histogram`);
      for (const [labels, s] of series) {
        const sep = labels === "" ? "" : ",";
        BUCKETS.forEach((bound, i) => {
          out.push(`${name}_bucket{${labels}${sep}le="${bound}"} ${s.buckets[i]}`);
        });
        out.push(`${name}_bucket{${labels}${sep}le="+Inf"} ${s.count}`);
        out.push(`${name}_sum{${labels}} ${s.sum}`, `${name}_count{${labels}} ${s.count}`);
      }
    }
    for (const [name, { help, read }] of this.gauges) {
      out.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${read()}`);
    }
    return `${out.join("\n")}\n`;
  }
}
