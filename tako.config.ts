import { reactTanstackGenerator } from '@kurotako/gen-react-tanstack';
import { typescriptGenerator } from '@kurotako/gen-typescript';
import { zodGenerator } from '@kurotako/gen-zod';
import { openapiParser } from '@kurotako/parser-openapi';
import { prismaParser } from '@kurotako/parser-prisma';
import { defineConfig } from 'kurotako';

// A generator entry's `name` must be unique across `generators` (kurotako
// enforces this to keep `outputs[].generators` unambiguous), so `zodGenerator`
// cannot be listed twice under its own name. `outputs[].generators` itself
// matches on each emitted file's `<namespace>/<segment>/…` path, and
// `zodGenerator` hardcodes that segment to `zod` regardless of the entry's
// `name` — so renaming alone still lets `db`'s `zod` files (Prisma,
// server-internal) leak into `packages/sdk/src/generated`. Wrap it to also
// rewrite the emitted path segment to `zod-api`, giving the `api` source a
// zod pass whose files are addressable only via `zod-api`, scoped to
// `packages/sdk/src/generated`.
//
// The wrapper also patches a `@kurotako/gen-zod` 0.3.7 bug: a schema holding a
// nested object gets a hand-written `z.ZodType<...Dto>` alias that names its
// enum types (`type: RoomPreviewDtoType`) while the file only imports the enum
// *schemas*, so the SDK does not typecheck. The missing `type` imports are added.
const ENUM_IMPORT = /import \{ ([^}]+) \} from '\.\/enums\.js';/;

function importMissingEnumTypes(content: string): string {
  const match = ENUM_IMPORT.exec(content);
  if (!match?.[1]) return content;

  const specifiers = match[1].split(', ');
  const body = content.replace(match[0], '');
  const missing = specifiers
    .filter((specifier) => specifier.endsWith('Schema') && !specifier.startsWith('type '))
    .map((specifier) => specifier.slice(0, -'Schema'.length))
    .filter((name) => new RegExp(`\\b${name}\\b`).test(body) && !specifiers.includes(name));
  if (missing.length === 0) return content;

  const merged = [...missing.map((name) => `type ${name}`), ...specifiers].sort((a, b) =>
    a.replace('type ', '').localeCompare(b.replace('type ', '')),
  );

  return content.replace(match[0], `import { ${merged.join(', ')} } from './enums.js';`);
}

const zodApiGenerator = {
  ...zodGenerator,
  name: 'zod-api',
  generate: async (...args: Parameters<typeof zodGenerator.generate>) => {
    const output = await zodGenerator.generate(...args);
    return {
      ...output,
      files: output.files.map((file) => {
        const segments = file.path.split('/');
        segments[1] = 'zod-api';
        return {
          ...file,
          path: segments.join('/'),
          content: importMissingEnumTypes(file.content),
        };
      }),
    };
  },
};

// Request bodies of the authentication forms in `apps/client-web`, one generated
// TanStack Form hook each.
const CLIENT_WEB_FORMS = [
  'LoginDto',
  'RegisterDto',
  'ResendVerificationDto',
  'RequestPasswordResetDto',
  'ConfirmPasswordResetDto',
];

// `reactTanstackGenerator` runs its own private copy of `zodGenerator` (into
// `<ns>/react-tanstack/zod/`), which has the same nested-object bug as above. The
// copy is swapped for a wrapper that adds the missing `type` imports; its name and
// options stay as declared by the driver.
const zodPrivateGenerator = {
  ...zodGenerator,
  generate: async (...args: Parameters<typeof zodGenerator.generate>) => {
    const output = await zodGenerator.generate(...args);
    return {
      ...output,
      files: output.files.map((file) => ({
        ...file,
        content: importMissingEnumTypes(file.content),
      })),
    };
  },
};

const reactTanstackFormsGenerator = {
  ...reactTanstackGenerator,
  dependsOn: (options: Parameters<typeof reactTanstackGenerator.dependsOn>[0]) =>
    reactTanstackGenerator
      .dependsOn(options)
      .map((dependency) => ({ ...dependency, use: zodPrivateGenerator })),
};

export default defineConfig({
  sources: {
    db: {
      use: prismaParser,
      options: {
        // Version-8 mode reads `contract.json` from this folder, not the `.prisma` source.
        schema: './apps/server/src/core/prisma',
        version: 8,
      },
    },
    api: {
      use: openapiParser,
      options: {
        document: './apps/server/openapi.json',
      },
    },
  },
  generators: [
    { use: zodGenerator, namespaces: ['db'] },
    { use: typescriptGenerator, namespaces: ['api'] },
    { use: zodApiGenerator, namespaces: ['api'] },
    {
      use: reactTanstackFormsGenerator,
      namespaces: ['api'],
      // Only the request bodies the client web forms submit.
      options: { include: CLIENT_WEB_FORMS },
    },
  ],
  outputs: [
    { dir: './apps/server/src/generated', generators: ['zod'] },
    { dir: './packages/sdk/src/generated', generators: ['typescript', 'zod-api'] },
    { dir: './apps/client-web/src/generated', generators: ['react-tanstack'] },
  ],
});
