import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';

const execFileAsync = promisify(execFile);
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Detects at boot whether `ffmpeg` / `ffprobe` are on the configured paths
 * (technical.md §S7). Thumbnails and media metadata are entirely optional:
 * when either binary is missing, the server logs one warning and boots
 * normally with {@link available} `false` — nothing downstream ever throws
 * for their absence.
 */
@Injectable()
export class MediaToolsService implements OnModuleInit {
  private readonly logger = new Logger(MediaToolsService.name);
  private _available = false;
  private _ffmpegVersion: string | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const [ffmpeg, ffprobe] = await Promise.all([
      this.probeVersion(this.config.get('media.ffmpeg_path')),
      this.probeVersion(this.config.get('media.ffprobe_path')),
    ]);

    this._available = ffmpeg !== null && ffprobe !== null;
    this._ffmpegVersion = ffmpeg;

    if (!this._available) {
      this.logger.warn('Thumbnails disabled: ffmpeg/ffprobe not found');
    } else {
      this.logger.log(`Media tools available (ffmpeg ${ffmpeg})`);
    }
  }

  get available(): boolean {
    return this._available;
  }

  get ffmpegVersion(): string | null {
    return this._ffmpegVersion;
  }

  private async probeVersion(path: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(path, ['-version'], {
        timeout: PROBE_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });

      return /version\s+(\S+)/.exec(stdout)?.[1] ?? 'unknown';
    } catch {
      return null;
    }
  }
}
