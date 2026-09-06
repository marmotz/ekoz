import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module.js';
import { ConfigService } from './core/config/config.service.js';
import { NestLoggerService } from './core/observability/nest-logger.service.js';
import { startTracing } from './core/observability/otel.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });

// Run every module's `onModuleInit` now — this is where `ConfigService` loads the layered
// configuration (`config.toml` + env).
//
// `app.listen()` would trigger it too, but the resolved parameters are needed first: the logger format and
// level, then the bind address. `init()` is idempotent, so the later `app.listen()` does not repeat it.
await app.init();

const config = app.get(ConfigService);
const logger = app.get(NestLoggerService);
logger.reconfigure({
  level: config.get('observability.log_level'),
  format: config.get('observability.log_format'),
});
app.useLogger(logger);

const tracing = startTracing({
  otlpEndpoint: config.get('observability.otlp_endpoint'),
  sampleRatio: config.get('observability.trace_sample_ratio'),
});

app.enableShutdownHooks();

const host = config.get('http.host');
const port = config.get('http.port');
await app.listen(port, host);
logger.log(`Ekoz server listening on http://${host}:${port}`, 'Bootstrap');

process.on('beforeExit', () => {
  void tracing.shutdown();
});
