import { ABOUT_PAGE_LIST, ABOUT_PAGES } from './pages';
import { ABOUT_SLUGS } from './types';

describe('about pages', () => {
  it('has a page for every slug, keyed by its own slug', () => {
    for (const slug of ABOUT_SLUGS) expect(ABOUT_PAGES[slug].slug).toBe(slug);
    expect(ABOUT_PAGE_LIST).toHaveLength(ABOUT_SLUGS.length);
  });

  it.each(ABOUT_PAGE_LIST.map((page) => [page.slug, page] as const))(
    '%s has a title, summary and real content',
    (_slug, page) => {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.summary.length).toBeGreaterThan(0);
      expect(page.blocks.length).toBeGreaterThan(3);
      for (const block of page.blocks) {
        if (block.kind === 'bullets') expect(block.items.length).toBeGreaterThan(0);
        else if (block.kind === 'link') expect(block.url).toMatch(/^https:\/\//);
        else expect(block.text.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it('states plainly that Famara is not medical advice', () => {
    const text = JSON.stringify(ABOUT_PAGES.limitations.blocks);
    expect(text).toMatch(/not a substitute for advice/);
  });

  it('credits every catalog source', () => {
    const text = JSON.stringify(ABOUT_PAGES.sources.blocks);
    for (const credit of ['TheMealDB', 'MedlinePlus', 'FoodData Central', 'Dietary Guidelines']) {
      expect(text).toContain(credit);
    }
  });
});
