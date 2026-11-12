import { parseReply, parseSpans } from './replyFormat';

describe('parseReply', () => {
  it('splits paragraphs and bullet lists', () => {
    expect(parseReply('Try these:\n- **Dal** with rice\n- Chana masala\n\nEnjoy!')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'Try these:', bold: false }] },
      {
        kind: 'bullets',
        items: [
          [
            { text: 'Dal', bold: true },
            { text: ' with rice', bold: false },
          ],
          [{ text: 'Chana masala', bold: false }],
        ],
      },
      { kind: 'paragraph', spans: [{ text: 'Enjoy!', bold: false }] },
    ]);
  });

  it('joins wrapped lines of one paragraph and accepts numbered lists', () => {
    expect(parseReply('one\ntwo\r\n1. first\n2) second')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'one two', bold: false }] },
      {
        kind: 'bullets',
        items: [[{ text: 'first', bold: false }], [{ text: 'second', bold: false }]],
      },
    ]);
  });
});

describe('parseSpans', () => {
  it('keeps an unmatched marker as text', () => {
    expect(parseSpans('a **b')).toEqual([{ text: 'a **b', bold: false }]);
  });
});
