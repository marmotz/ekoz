/**
 * Human-readable rendering of server errors (ADR 0020 follow-up, see
 * `docs/technical/error-reporting.md`).
 *
 * Runtime libraries (Prisma Next, `pg`, Nest) wrap failures in deep cause
 * chains of structured error objects. Left to the runtime's default printer,
 * a single unreachable database dumps a dozen source excerpts and stack frames
 * per failing module. This module flattens a chain into one report: what
 * failed, why, how to fix it.
 */

/** Cause chains deeper than this are cut — guards against cyclic `cause`. */
const MAX_CAUSE_DEPTH = 8;

/** Node error codes that mean "the database host cannot be reached". */
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

export interface ErrorLink {
  /** Constructor name, e.g. `SqlConnectionError`. */
  readonly name: string;
  /** Trimmed message; may be empty (the runtime often leaves it blank). */
  readonly message: string;
  /** Machine code (`ECONNREFUSED`, `CONTRACT.MARKER_READ_FAILED`, ...). */
  readonly code?: string;
  /** Structured `why` / `fix` texts carried by Prisma Next errors. */
  readonly why?: string;
  readonly fix?: string;
}

export interface ErrorReport {
  /** The outermost message: the one-line answer to "what failed". */
  readonly headline: string;
  /** Code of the outermost error, when it has one. */
  readonly code?: string;
  /** Outermost first, then each cause; duplicates collapsed. */
  readonly chain: readonly ErrorLink[];
  /** Actionable advice inferred from the chain, if any. */
  readonly hint?: string;
  /** Raw stack of the outermost error, for debug output. */
  readonly stack?: string;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function toLink(error: unknown): ErrorLink {
  if (typeof error !== 'object' || error === null) {
    return { name: 'Error', message: String(error) };
  }

  const record = error as Record<string, unknown>;
  const name = nonEmptyString(record.constructor && (record.constructor as { name?: string }).name);

  return {
    name: name ?? nonEmptyString(record.name) ?? 'Error',
    message: nonEmptyString(record.message) ?? '',
    code: nonEmptyString(record.code),
    why: nonEmptyString(record.why),
    fix: nonEmptyString(record.fix),
  };
}

/** Outermost error first; follows `cause` and flattens `AggregateError`. */
function collectChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0 && chain.length < MAX_CAUSE_DEPTH) {
    const current = queue.shift();
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    chain.push(current);

    if (typeof current === 'object' && current !== null) {
      const { cause, errors } = current as { cause?: unknown; errors?: unknown };
      if (Array.isArray(errors)) {
        queue.push(...errors);
      }
      if (cause !== undefined) {
        queue.push(cause);
      }
    }
  }

  return chain;
}

/** A link adds nothing when it repeats an earlier link's message and code. */
function isRedundant(link: ErrorLink, previous: readonly ErrorLink[]): boolean {
  return previous.some(
    (other) =>
      other.message === link.message && other.code === link.code && other.name === link.name,
  );
}

/** True when the failure (or any cause) means the database host cannot be reached. */
export function isDatabaseUnreachable(error: unknown): boolean {
  return collectChain(error).some((raw) => {
    const code = toLink(raw).code;
    return code !== undefined && NETWORK_ERROR_CODES.has(code);
  });
}

function inferHint(chain: readonly ErrorLink[]): string | undefined {
  if (chain.some((link) => link.code !== undefined && NETWORK_ERROR_CODES.has(link.code))) {
    return (
      'The database is unreachable. Check that PostgreSQL is running ' +
      '(locally: `docker compose up -d`) and that DATABASE_URL points to it.'
    );
  }

  if (chain.some((link) => link.code === '28P01' || link.code === '28000')) {
    return 'PostgreSQL rejected the credentials. Check the user and password in DATABASE_URL.';
  }

  if (chain.some((link) => link.code === '3D000')) {
    return 'The database does not exist. Create it, or fix the database name in DATABASE_URL.';
  }

  if (chain.some((link) => link.code === 'EADDRINUSE')) {
    return 'The port is already in use. Stop the other process or change `http.port`.';
  }

  if (chain.some((link) => link.code?.startsWith('CONTRACT.'))) {
    return 'The database schema may be behind the code. Run `bun run db:migrate` (or `db:deploy`).';
  }

  return undefined;
}

/** Build a structured, de-duplicated report from any thrown value. */
export function describeError(error: unknown): ErrorReport {
  const outer = toLink(error);
  const links: ErrorLink[] = [outer];
  for (const raw of collectChain(error).slice(1)) {
    const link = toLink(raw);
    // Wrapper errors that carry no message, code, why or fix say nothing new.
    const isEmptyWrapper = !link.message && !link.code && !link.why && !link.fix;
    if (!isEmptyWrapper && !isRedundant(link, links)) {
      links.push(link);
    }
  }

  const headline = outer.message || outer.code || outer.name;

  return {
    headline,
    code: outer.code,
    chain: links,
    hint: inferHint(links),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

/** One line, for log records: `headline [CODE] (caused by: ...)`. */
export function summarizeError(error: unknown): string {
  const report = describeError(error);
  const code = report.code ? ` [${report.code}]` : '';
  const causes = report.chain
    .slice(1)
    .map((link) => link.message || link.code || link.name)
    .filter((text) => text !== report.headline);

  return causes.length > 0
    ? `${report.headline}${code} (caused by: ${causes.join(' <- ')})`
    : `${report.headline}${code}`;
}

export interface FormatOptions {
  /** Title line, e.g. `Ekoz server failed to start`. */
  readonly title: string;
  /** Add ANSI colours. */
  readonly color?: boolean;
  /** Append the raw stack of the outermost error. */
  readonly includeStack?: boolean;
}

/** Multi-line, indented report meant for a terminal. */
export function formatErrorReport(error: unknown, options: FormatOptions): string {
  const report = describeError(error);
  const paint = (code: string, text: string) => (options.color ? `[${code}m${text}[0m` : text);
  const indent = (text: string) => text.replace(/^/gm, '    ');

  const lines: string[] = [paint('1;31', `x ${options.title}`), ''];

  const [, ...causes] = report.chain;
  const outer = report.chain[0] ?? { name: 'Error', message: report.headline };
  const code = outer.code ? ` ${paint('90', `[${outer.code}]`)}` : '';
  lines.push(`  ${paint('1', report.headline)}${code}`);
  if (outer.why) {
    lines.push(indent(`Why: ${outer.why}`));
  }
  if (outer.fix) {
    lines.push(indent(`Fix: ${outer.fix}`));
  }

  if (causes.length > 0) {
    lines.push('', '  Caused by:');
    for (const cause of causes) {
      const detail = [cause.message, cause.code && `[${cause.code}]`].filter(Boolean).join(' ');
      lines.push(`    - ${paint('90', `${cause.name}:`)} ${detail || '(no message)'}`);
      if (cause.why) {
        lines.push(indent(`  Why: ${cause.why}`));
      }
      if (cause.fix) {
        lines.push(indent(`  Fix: ${cause.fix}`));
      }
    }
  }

  if (report.hint) {
    lines.push('', `  ${paint('33', 'Hint:')} ${report.hint}`);
  }

  if (options.includeStack && report.stack) {
    lines.push('', paint('90', indent(report.stack)));
  } else {
    lines.push('', paint('90', '  Set OBSERVABILITY_LOG_LEVEL=debug to print the stack trace.'));
  }

  return `${lines.join('\n')}\n`;
}

/** `true` when the operator asked for verbose diagnostics via the environment. */
export function isDebugRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  const level = env.EKOZ_OBSERVABILITY__LOG_LEVEL ?? env.OBSERVABILITY_LOG_LEVEL;

  return level === 'debug' || level === 'trace';
}

export interface FatalHandlerOptions {
  readonly title?: string;
  readonly write?: (text: string) => void;
  readonly exit?: (code: number) => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly color?: boolean;
}

/**
 * Prints `error` once, readably, and exits with status 1. Returns a function
 * safe to call repeatedly: a second failure (several `onModuleInit` hooks
 * rejecting for the same root cause) is ignored rather than printed again.
 */
export function createFatalReporter(options: FatalHandlerOptions = {}): (error: unknown) => void {
  const write = options.write ?? ((text: string) => void process.stderr.write(text));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const env = options.env ?? process.env;
  const color = options.color ?? (Boolean(process.stderr.isTTY) && !env.NO_COLOR);
  let reported = false;

  return (error: unknown) => {
    if (reported) {
      return;
    }
    reported = true;

    write(
      formatErrorReport(error, {
        title: options.title ?? 'Ekoz server crashed',
        color,
        includeStack: isDebugRequested(env),
      }),
    );
    exit(1);
  };
}

/**
 * Routes `uncaughtException` and `unhandledRejection` through the fatal
 * reporter, replacing the runtime's raw source-excerpt dump.
 */
export function installProcessErrorHandlers(report: (error: unknown) => void): void {
  process.on('uncaughtException', report);
  process.on('unhandledRejection', report);
}
