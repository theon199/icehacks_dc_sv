import { ABOUT_PAGE_LIST } from '@/features/settings';

import { sectionsOf } from './sections';

describe('sectionsOf', () => {
  it('keeps the lead-in apart and starts a section at each heading', () => {
    expect(
      sectionsOf([
        { kind: 'paragraph', text: 'Intro' },
        { kind: 'heading', text: 'First' },
        { kind: 'paragraph', text: 'One' },
        { kind: 'bullets', items: ['a', 'b'] },
        { kind: 'heading', text: 'Second' },
        { kind: 'note', text: 'Two' },
      ]),
    ).toEqual([
      { heading: null, blocks: [{ kind: 'paragraph', text: 'Intro' }] },
      {
        heading: 'First',
        blocks: [
          { kind: 'paragraph', text: 'One' },
          { kind: 'bullets', items: ['a', 'b'] },
        ],
      },
      { heading: 'Second', blocks: [{ kind: 'note', text: 'Two' }] },
    ]);
  });

  it('drops an empty lead-in', () => {
    expect(sectionsOf([{ kind: 'heading', text: 'Only' }])).toEqual([
      { heading: 'Only', blocks: [] },
    ]);
  });

  it('loses no block of any real page', () => {
    for (const page of ABOUT_PAGE_LIST) {
      const sections = sectionsOf(page.blocks);
      const kept = sections.reduce(
        (count, section) => count + section.blocks.length + (section.heading ? 1 : 0),
        0,
      );
      expect(kept).toBe(page.blocks.length);
    }
  });
});
