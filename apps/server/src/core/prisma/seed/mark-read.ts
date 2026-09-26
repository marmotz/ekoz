/** CLI parsing for `prisma/mark-read.ts`, kept pure so it can be unit tested. */

export interface MarkReadArgs {
  readonly channelName: string;
}

export const MARK_READ_USAGE = 'Usage: bun run db:mark-read <channel name>';

export function parseMarkReadArgs(argv: readonly string[]): MarkReadArgs {
  const channelName = argv.join(' ').trim();
  if (!channelName) {
    throw new Error(MARK_READ_USAGE);
  }
  return { channelName };
}
