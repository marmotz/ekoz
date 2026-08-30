/**
 * Infra configuration for e2e specs that boot the full `AppModule`.
 *
 * `ConfigService` validates every infra parameter on module init and aborts boot
 * on a missing one (technical.md §2). Local runs pick these up from an untracked
 * `config.toml`, but CI has no such file, so specs must supply the infra keys
 * themselves. This sets the `EKOZ_*` env overrides in place and returns a
 * cleanup that restores the previous environment.
 */

const STATIC_OVERRIDES: Record<string, string> = {
  EKOZ_SERVER__DOMAIN: 'ekoz.example.com',
  EKOZ_SERVER__API_URL: 'https://api.ekoz.example.com',
  EKOZ_SERVER__WEB_URL: 'https://app.ekoz.example.com',
  EKOZ_SECRET__KEY: Buffer.alloc(32).toString('base64'),
};

export interface TestInfraConfigOptions {
  /** PostgreSQL connection string; defaults to `process.env.DATABASE_URL`. */
  databaseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export function applyTestInfraConfig(options: TestInfraConfigOptions = {}): () => void {
  const env = options.env ?? process.env;
  const databaseUrl = options.databaseUrl ?? env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('applyTestInfraConfig: no databaseUrl and DATABASE_URL is not set');
  }

  const overrides = { ...STATIC_OVERRIDES, EKOZ_DATABASE__URL: databaseUrl };
  const previous: Record<string, string | undefined> = {};

  for (const [name, value] of Object.entries(overrides)) {
    previous[name] = env[name];
    env[name] = value;
  }

  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete env[name];
      } else {
        env[name] = value;
      }
    }
  };
}
