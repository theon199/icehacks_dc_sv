import type { ChefMessage } from '@/stores';

import {
  MAX_REQUEST_MESSAGES,
  PHOTO_ONLY_PROMPT,
  awaitsReply,
  readPhotoMark,
  toRequestMessages,
  withPhotoMark,
} from './conversation';

let counter = 0;
const msg = (role: ChefMessage['role'], text: string): ChefMessage => ({
  id: `m${counter++}`,
  role,
  text,
  at: '2026-11-11T10:00:00.000Z',
  recipeIds: [],
});

describe('toRequestMessages', () => {
  it('sends the thread as role and content, ending with the question', () => {
    expect(
      toRequestMessages([msg('user', 'Hi'), msg('assistant', 'Hello!'), msg('user', ' Soup? ')]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Soup?' },
    ]);
  });

  it("has nothing to send when the last turn is Chef's or the thread is empty", () => {
    expect(toRequestMessages([msg('user', 'Hi'), msg('assistant', 'Hello!')])).toBeNull();
    expect(toRequestMessages([])).toBeNull();
  });

  it('keeps the most recent turns and starts with the person', () => {
    const thread = Array.from({ length: 50 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `turn ${i}`),
    );
    thread.push(msg('user', 'latest'));
    const turns = toRequestMessages(thread) ?? [];
    expect(turns.length).toBeLessThanOrEqual(MAX_REQUEST_MESSAGES);
    expect(turns[0]?.role).toBe('user');
    expect(turns[turns.length - 1]).toEqual({ role: 'user', content: 'latest' });
  });

  it('drops empty turns and trims long ones to the function limit', () => {
    const turns = toRequestMessages([msg('assistant', '   '), msg('user', 'x'.repeat(5000))]);
    expect(turns).toEqual([{ role: 'user', content: 'x'.repeat(4000) }]);
  });
});

describe('photo marker', () => {
  it('round-trips and fills in a question for a photo sent on its own', () => {
    expect(readPhotoMark(withPhotoMark('What is this?'))).toEqual({
      text: 'What is this?',
      hasPhoto: true,
    });
    expect(readPhotoMark(withPhotoMark('  '))).toEqual({ text: PHOTO_ONLY_PROMPT, hasPhoto: true });
    expect(readPhotoMark('Plain')).toEqual({ text: 'Plain', hasPhoto: false });
  });
});

describe('awaitsReply', () => {
  it('is true only while the person spoke last', () => {
    expect(awaitsReply([msg('user', 'Hi')])).toBe(true);
    expect(awaitsReply([msg('user', 'Hi'), msg('assistant', 'Yo')])).toBe(false);
    expect(awaitsReply([])).toBe(false);
  });
});
