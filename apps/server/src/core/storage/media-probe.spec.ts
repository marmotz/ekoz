import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateThumbnail, probeMediaDimensions } from './media-probe.js';

const execFileAsync = promisify(execFile);

function hasRealFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

describe('probeMediaDimensions', () => {
  it('returns all-null for a nonexistent path', async () => {
    const result = await probeMediaDimensions('ffprobe', '/no/such/file.png');
    expect(result).toEqual({ width: null, height: null, durationMs: null });
  });

  it('returns all-null when ffprobe itself does not exist', async () => {
    const result = await probeMediaDimensions('/no/such/ffprobe', '/no/such/file.png');
    expect(result).toEqual({ width: null, height: null, durationMs: null });
  });
});

describe.skipIf(!hasRealFfmpeg())('probeMediaDimensions / generateThumbnail (real ffmpeg)', () => {
  let dir: string;
  let imagePath: string;
  let videoPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ekoz-media-probe-'));
    imagePath = join(dir, 'still.png');
    videoPath = join(dir, 'clip.mp4');

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=64x32',
      '-frames:v',
      '1',
      imagePath,
    ]);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=96x48:d=2',
      '-t',
      '2',
      '-pix_fmt',
      'yuv420p',
      videoPath,
    ]);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('probes a still image (no duration)', async () => {
    const result = await probeMediaDimensions('ffprobe', imagePath);
    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
  });

  it('probes a video and reports its duration in milliseconds', async () => {
    const result = await probeMediaDimensions('ffprobe', videoPath);
    expect(result.width).toBe(96);
    expect(result.height).toBe(48);
    expect(result.durationMs).toBeGreaterThan(1000);
    expect(result.durationMs).toBeLessThan(3000);
  });

  it('generates a thumbnail for an image, scaled to fit within 480px', async () => {
    const outPath = join(dir, 'thumb.jpg');
    const ok = await generateThumbnail('ffmpeg', imagePath, outPath, {
      isVideo: false,
      durationMs: null,
    });
    expect(ok).toBe(true);

    const dims = await probeMediaDimensions('ffprobe', outPath);
    expect(dims.width).toBe(64);
    expect(dims.height).toBe(32);
  });

  it('generates a thumbnail for a video, seeking within its duration', async () => {
    const outPath = join(dir, 'thumb.jpg');
    const ok = await generateThumbnail('ffmpeg', videoPath, outPath, {
      isVideo: true,
      durationMs: 2000,
    });
    expect(ok).toBe(true);

    const dims = await probeMediaDimensions('ffprobe', outPath);
    expect(dims.width).toBe(96);
    expect(dims.height).toBe(48);
  });

  it('scales an oversized frame down to fit within 480px on the long side', async () => {
    const bigPath = join(dir, 'big.png');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=1000x500',
      '-frames:v',
      '1',
      bigPath,
    ]);
    const outPath = join(dir, 'thumb-big.jpg');
    const ok = await generateThumbnail('ffmpeg', bigPath, outPath, {
      isVideo: false,
      durationMs: null,
    });
    expect(ok).toBe(true);

    const dims = await probeMediaDimensions('ffprobe', outPath);
    expect(dims.width).toBeLessThanOrEqual(480);
    expect(dims.height).toBeLessThanOrEqual(480);
    expect(Math.max(dims.width ?? 0, dims.height ?? 0)).toBe(480);
  });

  it('returns false when ffmpeg cannot read the input', async () => {
    const ok = await generateThumbnail('ffmpeg', '/no/such/file.png', join(dir, 'x.jpg'), {
      isVideo: false,
      durationMs: null,
    });
    expect(ok).toBe(false);
  });
});
