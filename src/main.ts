import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module.js';
import { ConfigService } from './core/config/config.service.js';
import { NestLoggerService } from './core/observability/nest-logger.service.js';
import { startTracing } from './core/observability/otel.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });

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
