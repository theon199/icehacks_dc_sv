import type { AboutSlug } from '@/features/settings';

/**
 * The short name beside the back control on each informational page. The page's own title (from
 * the settings copy) sits under it as the headline.
 */
export const ABOUT_SHORT_TITLES: Readonly<Record<AboutSlug, string>> = {
  'how-it-works': 'How it works',
  sources: 'Sources',
  'ai-use': 'AI use',
  limitations: 'Limitations',
  privacy: 'Privacy',
  terms: 'Terms',
};
