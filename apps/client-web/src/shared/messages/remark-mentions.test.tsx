import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { expect, it } from 'vitest';

import { ALLOWED_ELEMENTS } from '@/shared/messages/markdown-allow-list';
import { remarkMentions } from '@/shared/messages/remark-mentions';

const mentions = [
  { type: 'all' as const, target: null, token: '@all' },
  { type: 'user' as const, target: 'u1', token: '@alice/chat.test' },
];

function renderBody(source: string, list = mentions) {
  return render(
    <Markdown
      remarkPlugins={[remarkGfm, [remarkMentions, { mentions: list }]]}
      allowedElements={[...ALLOWED_ELEMENTS]}
      unwrapDisallowed
      components={
        {
          mention: (props: Record<string, unknown> & { children?: ReactNode }) => (
            <b data-testid="mention" data-index={String(props['data-mention-index'])}>
              {props.children}
            </b>
          ),
        } as Components
      }
    >
      {source}
    </Markdown>,
  );
}

it('turns tokens in text into mention elements carrying the target index', () => {
  const { getAllByTestId, container } = renderBody('hello @all, ask @alice/chat.test');

  const nodes = getAllByTestId('mention');
  expect(nodes.map((node) => node.textContent)).toEqual(['@all', '@alice/chat.test']);
  expect(nodes.map((node) => node.getAttribute('data-index'))).toEqual(['0', '1']);
  expect(container).toHaveTextContent('hello @all, ask @alice/chat.test');
});

it('reaches tokens inside emphasis and lists', () => {
  const { getAllByTestId } = renderBody('**@all**\n\n- @alice/chat.test');

  expect(getAllByTestId('mention')).toHaveLength(2);
});

it('leaves tokens in inline code and code blocks alone', () => {
  const { queryAllByTestId, container } = renderBody('`@all`\n\n```\n@alice/chat.test\n```');

  expect(queryAllByTestId('mention')).toHaveLength(0);
  expect(container.querySelector('code')).toHaveTextContent('@all');
});

it('does not match inside a longer name', () => {
  const { queryAllByTestId } = renderBody('@allison and @all.', mentions);

  expect(queryAllByTestId('mention')).toHaveLength(0);
});

it('renders the text untouched when the message has no mentions', () => {
  const { queryAllByTestId, container } = renderBody('hello @all', []);

  expect(queryAllByTestId('mention')).toHaveLength(0);
  expect(container).toHaveTextContent('hello @all');
});
