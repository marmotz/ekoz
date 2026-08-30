import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module.js';

/**
 * Bind address.
 *
 * Temporary: `http.host` / `http.port` are infra config parameters, but the
 * layered configuration system (task #4) is not wired yet, so they are read
 * straight from the environment with hardcoded fallbacks for now.
 */
const host = process.env['HTTP_HOST'] ?? '0.0.0.0';
const port = Number(process.env['HTTP_PORT'] ?? 3000);

const app = await NestFactory.create(AppModule, { bufferLogs: false });
app.enableShutdownHooks();
await app.listen(port, host);

Logger.log(`Ekoz server listening on http://${host}:${port}`, 'Bootstrap');
