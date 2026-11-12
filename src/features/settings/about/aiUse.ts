import type { AboutPage } from './types';

export const aiUsePage: AboutPage = {
  slug: 'ai-use',
  title: 'How Famara uses AI',
  summary: 'What the AI features do, what they see and where they fall short.',
  blocks: [
    {
      kind: 'paragraph',
      text: 'Most of Famara works without AI: recommendations, search, planning, shopping lists and cook mode all run on your device from the recipe catalog. AI powers a few extra features, and only if you are 18 or older and have turned them on.',
    },
    { kind: 'heading', text: 'Features that use AI' },
    {
      kind: 'bullets',
      items: [
        'Chef: a chat that suggests dishes, answers cooking questions and plans a day.',
        'Make it healthier: suggests ingredient swaps for one of your goals.',
        'Snap: recognises pantry items or a dish in a photo and estimates its nutrition.',
        'Nearby helper: tips for ordering a lighter version of a dish at a restaurant.',
        'Price estimates: when no listed price is cached, an AI web lookup that always cites its source.',
      ],
    },
    { kind: 'heading', text: 'What is sent' },
    {
      kind: 'paragraph',
      text: 'When you use one of these features, Famara sends what you typed or the photo you took, together with the parts of your profile the answer depends on: cuisines, diets, allergens, goals and, for Chef, your recent conversation. It does not send your email address, your birth year or anything from Apple Health.',
    },
    {
      kind: 'paragraph',
      text: 'Requests go through Famara servers to a third-party AI provider that processes them only to produce a reply. Famara does not use your messages or photos to train AI models.',
    },
    { kind: 'heading', text: 'How answers are checked' },
    {
      kind: 'paragraph',
      text: 'When the AI suggests a recipe from the catalog, Famara checks it again on your device against your allergens and diet before showing it, and drops anything that does not pass. Estimates from photos are labelled as estimates.',
    },
    { kind: 'heading', text: 'Limits' },
    {
      kind: 'bullets',
      items: [
        'AI can be confidently wrong. Check ingredient labels yourself, especially for allergies.',
        'It is not a dietitian or a doctor and does not give medical advice.',
        'Each account has a daily allowance so the service stays available for everyone.',
      ],
    },
    { kind: 'heading', text: 'Your choice' },
    {
      kind: 'paragraph',
      text: 'You can turn AI features off at any time in Settings. Everything that does not need AI keeps working, and nothing new is sent once they are off.',
    },
  ],
};
