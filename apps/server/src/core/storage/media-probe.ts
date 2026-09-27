import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 15_000;
const THUMBNAIL_MAX_DIMENSION = 480;

export interface MediaDimensions {
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
}

/**
 * Probe `path`'s dimensions and duration with `ffprobe -show_streams`
 * (technical.md §S7). Arguments are passed as an array (no shell); a
 * `file://`-only protocol whitelist keeps a maliciously crafted input from
 * making ffprobe fetch a remote URL. Returns all-`null` on any failure —
 * callers treat that as "no metadata", never as an error to propagate.
 */
export async function probeMediaDimensions(
  ffprobePath: string,
  path: string,
): Promise<MediaDimensions> {
  try {
    const { stdout } = await execFileAsync(
      ffprobePath,
      ['-v', 'error', '-protocol_whitelist', 'file', '-of', 'json', '-show_streams', path],
      { timeout: COMMAND_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 10 * 1024 * 1024 },
    );

    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const stream = parsed.streams?.find((s) => s.codec_type === 'video' && s.width && s.height);
    if (!stream) {
      return { width: null, height: null, durationMs: null };
    }

    const durationSeconds = stream.duration ? Number(stream.duration) : Number.NaN;

    return {
      width: stream.width ?? null,
      height: stream.height ?? null,
      durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : null,
    };
  } catch {
    return { width: null, height: null, durationMs: null };
  }
}

/**
 * Generate one JPEG thumbnail frame at `outputPath`, max 480 px on the longer
 * side, never upscaled (technical.md §S7). For a video, seeks to 1 s (clamped
 * to the clip's duration); an image has no seek. Returns `false` on any
 * failure — callers log a warning and skip the thumbnail, the upload stays
 * `ready`.
 */
export async function generateThumbnail(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  options: { isVideo: boolean; durationMs: number | null },
): Promise<boolean> {
  const seekSeconds = options.isVideo
    ? Math.max(0, Math.min(1, (options.durationMs ?? 1000) / 1000))
    : null;

  const args = [
    '-y',
    '-protocol_whitelist',
    'file',
    ...(seekSeconds !== null ? ['-ss', seekSeconds.toFixed(3)] : []),
    '-i',
    inputPath,
    '-vframes',
    '1',
    '-vf',
    `scale='min(iw,${THUMBNAIL_MAX_DIMENSION})':'min(ih,${THUMBNAIL_MAX_DIMENSION})':force_original_aspect_ratio=decrease`,
    outputPath,
  ];

  try {
    await execFileAsync(ffmpegPath, args, {
      timeout: COMMAND_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });

    return true;
  } catch {
    return false;
  }
}
