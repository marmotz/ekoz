import { afterEach, describe, expect, it } from 'vitest';
import { PullMetricReader, startMetrics, startTracing } from './otel.js';

describe('OpenTelemetry bootstrap (unit)', () => {
  const cleanups: Array<() => Promise<unknown>> = [];

  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });

  it('starts tracing with no exporter when no OTLP endpoint is set and does not throw', () => {
    const tracing = startTracing({ sampleRatio: 0 });
    cleanups.push(tracing.shutdown);
    expect(tracing.shutdown).toBeTypeOf('function');
  });

  it('accepts an OTLP endpoint without opening it eagerly', () => {
    const tracing = startTracing({
      otlpEndpoint: 'http://localhost:4318/v1/traces',
      sampleRatio: 0.5,
    });
    cleanups.push(tracing.shutdown);
    expect(tracing.shutdown).toBeTypeOf('function');
  });

  it('serialises collected metrics as Prometheus text', async () => {
    const { reader, provider } = startMetrics();
    cleanups.push(() => provider.shutdown());
    expect(reader).toBeInstanceOf(PullMetricReader);

    provider.getMeter('test').createCounter('ekoz_test_total').add(3);
    const text = await reader.collectText();
    expect(text).toContain('ekoz_test_total');
  });
});
