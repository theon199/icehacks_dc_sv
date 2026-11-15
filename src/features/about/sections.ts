import type { AboutBlock } from '@/features/settings';

export interface AboutSection {
  /** Null for the lead-in before the first heading. */
  heading: string | null;
  blocks: AboutBlock[];
}

/**
 * Splits a page's blocks at its headings: the lead-in before the first heading, then one section
 * per heading with the blocks under it. Empty sections are dropped.
 */
export function sectionsOf(blocks: readonly AboutBlock[]): AboutSection[] {
  const sections: AboutSection[] = [{ heading: null, blocks: [] }];
  for (const block of blocks) {
    if (block.kind === 'heading') {
      sections.push({ heading: block.text, blocks: [] });
    } else {
      sections[sections.length - 1]?.blocks.push(block);
    }
  }
  return sections.filter((section) => section.heading !== null || section.blocks.length > 0);
}
