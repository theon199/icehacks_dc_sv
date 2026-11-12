/** Building blocks of the informational pages. Kept as data so the copy is easy to review. */
export type AboutBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: readonly string[] }
  /** A highlighted aside, e.g. "not medical advice". */
  | { kind: 'note'; text: string }
  /** An external page opened in the in-app browser. */
  | { kind: 'link'; label: string; url: string };

export const ABOUT_SLUGS = [
  'how-it-works',
  'sources',
  'ai-use',
  'limitations',
  'privacy',
  'terms',
] as const;

export type AboutSlug = (typeof ABOUT_SLUGS)[number];

export interface AboutPage {
  slug: AboutSlug;
  title: string;
  /** One line for the Settings list. */
  summary: string;
  /** Shown under the title on legal pages. */
  updated?: string;
  blocks: readonly AboutBlock[];
}
