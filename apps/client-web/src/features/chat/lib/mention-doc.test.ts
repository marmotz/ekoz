import { Markdown } from '@tiptap/markdown';
import type { JSONContent } from '@tiptap/react';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, expect, it } from 'vitest';

import { injectMentionNodes } from '@/features/chat/lib/mention-doc';
import { MentionNode, mentionsOfDoc } from '@/features/chat/lib/mention-node';

const alice = { type: 'user' as const, target: 'u1', token: '@alice/chat.test' };
const all = { type: 'all' as const, target: null, token: '@all' };
const labelFor = (mention: { type: string }) => (mention.type === 'all' ? 'everyone' : 'Alice');

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function createEditor() {
  editor = new Editor({
    extensions: [StarterKit.configure({ heading: false }), Markdown, MentionNode],
  });
  return editor;
}

function load(body: string, mentions = [alice, all]) {
  const instance = createEditor();
  const doc = injectMentionNodes(instance.markdown?.parse(body) as JSONContent, mentions, labelFor);
  instance.commands.setContent(doc);
  return instance;
}

it('turns the tokens of a body back into mention nodes', () => {
  const instance = load('hi @alice/chat.test and @all!');

  expect(mentionsOfDoc(instance.state.doc)).toEqual([
    { type: 'user', target: 'u1', token: '@alice/chat.test', label: 'Alice' },
    { type: 'all', target: null, token: '@all', label: 'everyone' },
  ]);
  expect(instance.getText()).toBe('hi @alice/chat.test and @all!');
});

it('round-trips to the same Markdown body', () => {
  const body = '**bold** @alice/chat.test and *em* @all';

  expect(load(body).getMarkdown()).toBe(body);
});

it('leaves tokens in inline code and code blocks as text', () => {
  const instance = load('`@all`\n\n```\n@alice/chat.test\n```');

  expect(mentionsOfDoc(instance.state.doc)).toEqual([]);
  expect(instance.getMarkdown()).toContain('`@all`');
});

it('applies the boundary rule of the rendered chips', () => {
  const instance = load('@allison @all_ @all');

  expect(mentionsOfDoc(instance.state.doc)).toEqual([
    { type: 'all', target: null, token: '@all', label: 'everyone' },
  ]);
});

it('reaches tokens nested in lists and quotes', () => {
  const instance = load('- @alice/chat.test\n\n> @all');

  expect(mentionsOfDoc(instance.state.doc)).toHaveLength(2);
});

it('changes nothing for a body without mentions', () => {
  const doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
  };

  expect(injectMentionNodes(doc, [], labelFor)).toEqual(doc);
});
