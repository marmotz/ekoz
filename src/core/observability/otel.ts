import { diag, DiagLogLevel, metrics as otelMetrics } from '@opentelemetry/api';
import { PrometheusSerializer } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

diag.setLogger(
  { error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, verbose: () => {} },
  DiagLogLevel.NONE
);

const SERVICE_NAME = 'ekoz-server';

/**
 * A pull-based `MetricReader`: it never pushes anywhere. `GET /metrics` calls
 * `collect()` on demand and serialises the result in Prometheus text format
 * (ADR 0020 — Prometheus exposition, OTLP push can be added later without
 * touching call sites).
 */
export class PullMetricReader extends MetricReader {
  private readonly serializer = new PrometheusSerializer();

  async collectText(): Promise<string> {
    const { resourceMetrics, errors } = await this.collect();
    if (errors.length > 0) {
      throw new AggregateError(errors, 'metric collection failed');
    }

    return this.serializer.serialize(resourceMetrics);
  }

  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

/**
 * Build the OpenTelemetry `MeterProvider` and register it as the global one, so
 * `MetricsService` and future call sites take meters off `@opentelemetry/api`.
 */
export function startMetrics(): { reader: PullMetricReader; provider: MeterProvider } {
  const reader = new PullMetricReader();
  const provider = new MeterProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    readers: [reader],
  });
  otelMetrics.setGlobalMeterProvider(provider);

  return { reader, provider };
}

export interface TracingOptions {
  /** OTLP/HTTP traces endpoint. Tracing export is off entirely when unset. */
  readonly otlpEndpoint?: string;
  /** Head-based sampling ratio, `0`..`1`. */
  readonly sampleRatio: number;
}

/**
 * Start the tracer provider. With no `otlpEndpoint` the provider is registered
 * (so span APIs stay valid) but nothing is exported, no network resource is
 * opened, and the auto-instrumentations are left disabled — zero cost until an
 * operator opts in (ADR 0020 — exporter off by default).
 *
 * When an endpoint is set, HTTP handlers, Express routes and `pg` queries (the
 * driver behind the Prisma adapter) are instrumented and exported over OTLP.
 * Outbound SMTP spans are added by the email feature when it lands.
 */
export function startTracing(options: TracingOptions): { shutdown: () => Promise<void> } {
  const tracingOn = Boolean(options.otlpEndpoint);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
    sampler: new TraceIdRatioBasedSampler(tracingOn ? options.sampleRatio : 0),
    spanProcessors: tracingOn ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: options.otlpEndpoint }))] : [],
  });
  provider.register();

  let unregisterInstrumentations: (() => void) | undefined;
  if (tracingOn) {
    unregisterInstrumentations = registerInstrumentations({
      tracerProvider: provider,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) => ['/healthz', '/readyz', '/metrics'].includes(req.url ?? ''),
        }),
        new ExpressInstrumentation(),
        new PgInstrumentation(),
      ],
    });
  }

  return {
    shutdown: async () => {
      unregisterInstrumentations?.();
      await provider.shutdown();
    },
  };
}
