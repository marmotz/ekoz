import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';

const config: Config = {
  title: 'Ekoz',
  tagline: 'An open chat protocol, a reference server and an SDK',
  url: 'https://ekoz.marmotz.dev',
  baseUrl: '/',
  organizationName: 'marmotz',
  projectName: 'ekoz',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    // Protocol pages contain raw `<` and `{` in prose and tables: parse .md as CommonMark.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // Default instance ("Guides"): never versioned.
          id: 'guides',
          path: 'docs',
          routeBasePath: 'guides',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'protocol',
        // Single source of truth: the specification is published as is, never copied.
        path: '../../docs/protocol',
        routeBasePath: 'protocol',
        sidebarPath: './sidebars-protocol.ts',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'sdk',
        path: 'sdk',
        routeBasePath: 'sdk',
        sidebarPath: './sidebars-sdk.ts',
      },
    ],
    // API reference generated from the SDK sources into the `sdk` instance tree, so that a
    // version cut of the SDK docs freezes the generated reference with the rest.
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'sdk-api',
        entryPoints: ['../../packages/sdk/src/index.ts'],
        tsconfig: '../../packages/sdk/tsconfig.json',
        out: 'sdk/api',
        // The theme computes sidebar ids relative to this path: it must be the `sdk` instance, not the guides preset.
        docsPath: './sdk',
        readme: 'none',
        // The generated wire types carry validation tags (@pattern, @minLength...) TypeDoc does not know.
        logLevel: 'Error',
        sidebar: { autoConfiguration: true },
      },
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        // The default docs instance is "guides", not "default": tell the search bar so.
        docsPluginIdForPreferredVersion: 'guides',
        docsRouteBasePath: ['/guides', '/protocol', '/sdk'],
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Ekoz',
      items: [
        { type: 'docSidebar', sidebarId: 'guides', docsPluginId: 'guides', label: 'Guides' },
        { type: 'docSidebar', sidebarId: 'protocol', docsPluginId: 'protocol', label: 'Protocol' },
        { type: 'docSidebar', sidebarId: 'sdk', docsPluginId: 'sdk', label: 'SDK' },
        {
          type: 'docsVersionDropdown',
          docsPluginId: 'protocol',
          position: 'right',
          className: 'version-dropdown version-dropdown--protocol',
        },
        {
          type: 'docsVersionDropdown',
          docsPluginId: 'sdk',
          position: 'right',
          className: 'version-dropdown version-dropdown--sdk',
        },
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
