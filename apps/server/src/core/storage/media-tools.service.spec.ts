import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import { MediaToolsService } from './media-tools.service.js';

function fakeConfig(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function hasRealFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

describe('MediaToolsService', () => {
  it('reports unavailable for a nonexistent binary, without throwing', async () => {
    const service = new MediaToolsService(
      fakeConfig({
        'media.ffmpeg_path': '/no/such/ffmpeg',
        'media.ffprobe_path': '/no/such/ffprobe',
      }),
    );
    await service.onModuleInit();

    expect(service.available).toBe(false);
    expect(service.ffmpegVersion).toBeNull();
  });

  it('reports unavailable when only ffprobe is missing', async () => {
    const service = new MediaToolsService(
      fakeConfig({ 'media.ffmpeg_path': 'ffmpeg', 'media.ffprobe_path': '/no/such/ffprobe' }),
    );
    await service.onModuleInit();

    expect(service.available).toBe(false);
  });

  it.skipIf(!hasRealFfmpeg())(
    'reports available with a version when both real binaries resolve',
    async () => {
      const service = new MediaToolsService(
        fakeConfig({ 'media.ffmpeg_path': 'ffmpeg', 'media.ffprobe_path': 'ffprobe' }),
      );
      await service.onModuleInit();

      expect(service.available).toBe(true);
      expect(service.ffmpegVersion).toBeTruthy();
    },
  );
});
