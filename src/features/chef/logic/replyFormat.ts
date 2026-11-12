/**
 * Chef replies use a tiny subset of markdown: paragraphs, "- " bullets and **bold**. This parses
 * that subset into blocks the reply view renders with native text; anything else stays plain.
 */
export interface Span {
  readonly text: string;
  readonly bold: boolean;
}

export type ReplyBlock =
  | { readonly kind: 'paragraph'; readonly spans: readonly Span[] }
  | { readonly kind: 'bullets'; readonly items: readonly (readonly Span[])[] };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** Splits `**bold**` runs; an unmatched `**` is kept as literal text. */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = [];
  let rest = line;
  while (rest.length > 0) {
    const open = rest.indexOf('**');
    const close = open < 0 ? -1 : rest.indexOf('**', open + 2);
    if (open < 0 || close < 0) {
      spans.push({ text: rest, bold: false });
      break;
    }
    if (open > 0) spans.push({ text: rest.slice(0, open), bold: false });
    const inner = rest.slice(open + 2, close);
    if (inner) spans.push({ text: inner, bold: true });
    rest = rest.slice(close + 2);
  }
  return spans;
}

export function parseReply(reply: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let paragraph: string[] = [];
  let bullets: Span[][] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', spans: parseSpans(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push({ kind: 'bullets', items: bullets });
      bullets = [];
    }
  };

  for (const raw of reply.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
    } else if (BULLET.test(line)) {
      flushParagraph();
      bullets.push(parseSpans(line.replace(BULLET, '')));
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();
  return blocks;
}
