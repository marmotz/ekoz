import type { LanguageFn } from 'highlight.js';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

/**
 * Languages a code block can be tagged with, shared by the composer selector and
 * the timeline renderer (web-client-composer-formatting technical design C4, C5).
 * One file to edit to add a language.
 */
export interface CodeLanguage {
  /** Canonical id, written after the opening fence. */
  id: string;
  /** Name shown on the code block header and in the selector. */
  label: string;
  /** Other names people type after a fence; they resolve to `id`. */
  aliases: readonly string[];
  grammar: LanguageFn;
}

/** The id of a block that must not be highlighted or detected. */
export const PLAIN_TEXT_ID = 'text';

/** Fence names read as plain text (the first one is the canonical id). */
export const PLAIN_TEXT_NAMES = [PLAIN_TEXT_ID, 'txt', 'plaintext'] as const;

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: 'bash', label: 'Bash', aliases: ['sh', 'shell', 'zsh'], grammar: bash },
  { id: 'c', label: 'C', aliases: ['h'], grammar: c },
  { id: 'cpp', label: 'C++', aliases: ['c++', 'cc', 'hpp'], grammar: cpp },
  { id: 'csharp', label: 'C#', aliases: ['cs', 'c#'], grammar: csharp },
  { id: 'css', label: 'CSS', aliases: [], grammar: css },
  { id: 'diff', label: 'Diff', aliases: ['patch'], grammar: diff },
  { id: 'go', label: 'Go', aliases: ['golang'], grammar: go },
  { id: 'xml', label: 'HTML', aliases: ['html', 'svg'], grammar: xml },
  { id: 'java', label: 'Java', aliases: [], grammar: java },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'jsx', 'mjs'], grammar: javascript },
  { id: 'json', label: 'JSON', aliases: [], grammar: json },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kt'], grammar: kotlin },
  { id: 'markdown', label: 'Markdown', aliases: ['md'], grammar: markdown },
  { id: 'php', label: 'PHP', aliases: [], grammar: php },
  { id: 'python', label: 'Python', aliases: ['py'], grammar: python },
  { id: 'ruby', label: 'Ruby', aliases: ['rb'], grammar: ruby },
  { id: 'rust', label: 'Rust', aliases: ['rs'], grammar: rust },
  { id: 'sql', label: 'SQL', aliases: [], grammar: sql },
  { id: 'swift', label: 'Swift', aliases: [], grammar: swift },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx'], grammar: typescript },
  { id: 'yaml', label: 'YAML', aliases: ['yml'], grammar: yaml },
];

const BY_NAME = new Map<string, CodeLanguage>(
  CODE_LANGUAGES.flatMap((language) =>
    [language.id, ...language.aliases].map((name) => [name, language] as const),
  ),
);

/** The table entry a fence name designates (id or alias, any case), if any. */
export function findLanguage(name: string | null | undefined): CodeLanguage | undefined {
  return name ? BY_NAME.get(name.trim().toLowerCase()) : undefined;
}

/**
 * Normalises the language written after a fence: an alias becomes its id, a known
 * id is kept, plain-text names become `text`, anything else becomes `text` too.
 * Nothing written stays `null`, which the timeline auto-detects.
 */
export function resolveLanguage(input: string | null | undefined): string | null {
  const name = input?.trim();
  if (!name) return null;
  return findLanguage(name)?.id ?? PLAIN_TEXT_ID;
}
