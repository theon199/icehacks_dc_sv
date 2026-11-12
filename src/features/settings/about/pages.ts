import { aiUsePage } from './aiUse';
import { howItWorksPage } from './howItWorks';
import { limitationsPage } from './limitations';
import { privacyPage } from './privacy';
import { sourcesPage } from './sources';
import { termsPage } from './terms';
import { ABOUT_SLUGS, type AboutPage, type AboutSlug } from './types';

export const ABOUT_PAGES: Readonly<Record<AboutSlug, AboutPage>> = {
  'how-it-works': howItWorksPage,
  sources: sourcesPage,
  'ai-use': aiUsePage,
  limitations: limitationsPage,
  privacy: privacyPage,
  terms: termsPage,
};

/** Pages in the order Settings lists them. */
export const ABOUT_PAGE_LIST: readonly AboutPage[] = ABOUT_SLUGS.map((slug) => ABOUT_PAGES[slug]);
