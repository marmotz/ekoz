import type { MentionTarget } from '@ekozhq/sdk';

export type MentionKind = MentionTarget['type'];

/** One colour per kind, shared by the timeline chips and the composer ones. */
export const MENTION_KIND_CLASSES: Record<MentionKind, string> = {
  user: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  role: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
  group: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  all: 'bg-amber-500/20 text-amber-900 dark:text-amber-200',
};

/** Layout shared by every chip. */
export const MENTION_CHIP_CLASS =
  'inline-flex items-center gap-1 rounded px-1 align-baseline font-medium';
