import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  guides: [
    'intro',
    {
      type: 'category',
      label: 'Getting started',
      items: ['getting-started/quickstart', 'getting-started/installation'],
    },
    {
      type: 'category',
      label: 'Running a server',
      items: ['server/deployment', 'server/configuration', 'server/operations'],
    },
    'security',
    'faq',
  ],
};

export default sidebars;
