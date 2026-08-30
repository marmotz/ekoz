import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { type Attributes, type Counter, type Histogram, metrics as otelMetrics } from '@opentelemetry/api';
import { readdirSync } from 'node:fs';
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks';
import { PullMetricReader, startMetrics } from './otel.js';

const METER_NAME = 'ekoz-server-core';

/** Live snapshot of the database connection pool. */
export interface DbPoolStats {
  size: number;
  inUse: number;
  waiting: number;
}

/**
 * Thin wrapper over OpenTelemetry instrument creation (ADR 0020, technical.md
 * §11). Features take this to declare their own domain instruments; server-core
 * registers the process + HTTP baseline here.
 *
 * `/metrics` reads the serialised text through `collect()`.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnApplicationShutdown {
  private reader?: PullMetricReader;
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();
  private readonly gaugeValues = new Map<string, number>();
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });
  private gcPauseTotalMs = 0;
  private gcObserver?: PerformanceObserver;
  private dbPoolStats: (() => DbPoolStats) | null = null;
  private readonly gaugeSetters = new Map<string, (value: number) => void>();

  onModuleInit(): void {
    const { reader } = startMetrics();
    this.reader = reader;
    this.loopDelay.enable();
    this.registerProcessInstruments();
    this.registerHttpInstruments();
    this.registerDatabaseInstruments();
    this.registerEmailInstruments();
    this.registerBlobInstruments();
  }

  async onApplicationShutdown(): Promise<void> {
    this.loopDelay.disable();
    this.gcObserver?.disconnect();
    await this.reader?.shutdown();
  }

  /** Prometheus text exposition for `GET /metrics`. */
  async collect(): Promise<string> {
    if (!this.reader) {
      throw new Error('MetricsService not initialised');
    }

    return this.reader.collectText();
  }

  counter(name: string, description?: string, unit?: string): Counter {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = otelMetrics.getMeter(METER_NAME).createCounter(name, { description, unit });
      this.counters.set(name, counter);
    }

    return counter;
  }

  histogram(name: string, description?: string, unit?: string): Histogram {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = otelMetrics.getMeter(METER_NAME).createHistogram(name, { description, unit });
      this.histograms.set(name, histogram);
    }

    return histogram;
  }

  /** Register an observable gauge backed by a synchronous callback. */
  gauge(name: string, read: () => number, description?: string, unit?: string): void {
    const observable = otelMetrics.getMeter(METER_NAME).createObservableGauge(name, { description, unit });
    observable.addCallback((result) => result.observe(read()));
  }

  /** Register a gauge whose value is pushed via the returned setter. */
  settableGauge(name: string, description?: string, unit?: string): (value: number) => void {
    let setter = this.gaugeSetters.get(name);
    if (!setter) {
      this.gaugeValues.set(name, 0);
      this.gauge(name, () => this.gaugeValues.get(name) ?? 0, description, unit);
      setter = (value: number) => this.gaugeValues.set(name, value);
      this.gaugeSetters.set(name, setter);
    }

    return setter;
  }

  /** Convenience: record one HTTP request into the baseline instruments. */
  recordHttpRequest(attributes: Attributes, durationSeconds: number): void {
    this.counter('http_server_requests_total').add(1, attributes);
    this.histogram('http_server_request_duration_seconds', 'HTTP request duration', 's').record(
      durationSeconds,
      attributes
    );
  }

  /**
   * Wire the database pool gauges to a live stats source. Called by
   * `PrismaService` once the adapter pool is available (technical.md §11).
   */
  registerDbPoolStats(read: () => DbPoolStats): void {
    this.dbPoolStats = read;
  }

  /** Record one completed database query into the baseline histogram. */
  recordDbQuery(durationSeconds: number): void {
    this.histogram('db_client_query_duration_seconds', 'Database query duration', 's').record(durationSeconds);
  }

  /** Outbound email instruments, fed by the email feature when it lands (technical.md §11). */
  setEmailQueueDepth(depth: number): void {
    this.gaugeSetters.get('email_queue_depth')?.(depth);
  }
  recordEmailSendAttempt(): void {
    this.counter('email_send_attempts_total').add(1);
  }
  recordEmailSendFailure(): void {
    this.counter('email_send_failures_total').add(1);
  }

  /** Blob storage instruments, fed by the storage feature when it lands (technical.md §11). */
  setBlobStats(stats: { bytesTotal: number; count: number; dedupRatio: number }): void {
    this.gaugeSetters.get('blob_bytes_total')?.(stats.bytesTotal);
    this.gaugeSetters.get('blob_count')?.(stats.count);
    this.gaugeSetters.get('blob_dedup_ratio')?.(stats.dedupRatio);
  }

  private registerProcessInstruments(): void {
    this.gcObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) this.gcPauseTotalMs += entry.duration;
    });
    this.gcObserver.observe({ entryTypes: ['gc'] });

    this.gauge('process_resident_memory_bytes', () => process.memoryUsage().rss, 'Resident set size', 'By');
    this.gauge('process_heap_used_bytes', () => process.memoryUsage().heapUsed, 'Heap used', 'By');
    this.gauge('process_uptime_seconds', () => process.uptime(), 'Process uptime', 's');
    this.gauge('nodejs_eventloop_lag_seconds', () => this.loopDelay.mean / 1e9, 'Mean event-loop delay', 's');
    this.gauge('nodejs_gc_pause_seconds_total', () => this.gcPauseTotalMs / 1000, 'Cumulative GC pause time', 's');
    this.gauge(
      'process_open_fds',
      () => {
        try {
          // Linux only; best-effort.
          return readdirSync('/proc/self/fd').length;
        } catch {
          return 0;
        }
      },
      'Open file descriptors'
    );
  }

  /**
   * Pre-register the baseline HTTP instruments so they appear in `/metrics` (at
   * zero) before the first request (technical.md §11).
   */
  private registerHttpInstruments(): void {
    this.counter('http_server_requests_total', 'Total HTTP requests by route and status class');
    this.histogram('http_server_request_duration_seconds', 'HTTP request duration', 's');
  }

  /**
   * Database baseline (technical.md §11): the query-duration histogram, plus
   * pool gauges that stay at zero until `PrismaService` calls
   * `registerDbPoolStats(...)` with the live adapter pool.
   */
  private registerDatabaseInstruments(): void {
    this.histogram('db_client_query_duration_seconds', 'Database query duration', 's');
    this.gauge('db_client_connections_max', () => this.dbPoolStats?.().size ?? 0, 'Connection pool size');
    this.gauge('db_client_connections_used', () => this.dbPoolStats?.().inUse ?? 0, 'Connections currently in use');
    this.gauge(
      'db_client_connections_waiting',
      () => this.dbPoolStats?.().waiting ?? 0,
      'Requests waiting for a connection'
    );
  }

  /**
   * Outbound-email baseline (technical.md §11). Registered here so the names are
   * fixed; the email feature feeds them once the SMTP queue exists.
   */
  private registerEmailInstruments(): void {
    this.settableGauge('email_queue_depth', 'Pending outbound emails');
    // Seed at 0 so the series is exposed before the first send (Prometheus omits
    // a counter with no data points).
    this.counter('email_send_attempts_total', 'Outbound email send attempts').add(0);
    this.counter('email_send_failures_total', 'Outbound email send failures').add(0);
  }

  /**
   * Blob-storage baseline (technical.md §11). Registered here; the storage
   * feature feeds them once the blob store exists.
   */
  private registerBlobInstruments(): void {
    this.settableGauge('blob_bytes_total', 'Total stored blob bytes (post-dedup)', 'By');
    this.settableGauge('blob_count', 'Distinct stored blobs');
    this.settableGauge('blob_dedup_ratio', 'Deduplication ratio (0..1)');
  }
}
