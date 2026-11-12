/** The informational pages linked from Settings and the sign-up screen. */
export const ABOUT_PAGES = {
  'how-it-works': {
    title: 'How Famara works',
    summary: 'How recipes are picked for you and what each score means.',
  },
  sources: {
    title: 'Data sources and credits',
    summary: 'Where recipes, photos and nutrition data come from.',
  },
  'ai-use': {
    title: 'How Famara uses AI',
    summary: 'What the AI features do, what they see and their limits.',
  },
  limitations: {
    title: 'Limitations',
    summary: 'Famara offers general information, not medical advice.',
  },
  privacy: {
    title: 'Privacy policy',
    summary: 'What we collect, why, and the choices you have.',
  },
  terms: {
    title: 'Terms of use',
    summary: 'The rules for using Famara.',
  },
} as const satisfies Record<string, { title: string; summary: string }>;

export type AboutPage = keyof typeof ABOUT_PAGES;
