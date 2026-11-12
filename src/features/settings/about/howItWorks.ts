import type { AboutPage } from './types';

export const howItWorksPage: AboutPage = {
  slug: 'how-it-works',
  title: 'How Famara works',
  summary: 'How dishes are picked for you and what the scores mean.',
  blocks: [
    {
      kind: 'paragraph',
      text: 'Famara starts from the food you already love and looks for versions of those dishes that are a little better for you. It never asks you to give up your cuisine; it looks inside it.',
    },
    { kind: 'heading', text: 'Safety comes first' },
    {
      kind: 'paragraph',
      text: 'Before anything is ranked, Famara removes every recipe that does not fit your declared allergens and diet. If we cannot confirm that a recipe is free of one of your allergens, for example because an ingredient could not be matched, it is left out rather than shown as safe.',
    },
    { kind: 'heading', text: 'What the fit score weighs' },
    {
      kind: 'bullets',
      items: [
        'Your cuisines: dishes from the cuisines you love, and their neighbours, come first.',
        'Your goals: more protein, more fiber, lower sodium and the others you picked.',
        'Your time and effort: how long a recipe takes and how involved it is.',
        'Your pantry: recipes that use what you already have get a boost in "Use my pantry".',
        'Your feedback: likes, cooks and "not for me" reasons shape what comes next. Feedback from long ago counts for less over time.',
      ],
    },
    {
      kind: 'paragraph',
      text: 'The ring on each card shows how well a dish fits all of this together. Tap "Why this fits you" on any recipe to see the reasons in plain words.',
    },
    { kind: 'heading', text: 'The health score' },
    {
      kind: 'paragraph',
      text: 'Each recipe also has a health score. It rewards fiber, protein and vegetables and counts against sodium, saturated fat and added sugar, measured per calorie so large and small portions are compared fairly. The same recipe always gets the same score.',
    },
    { kind: 'heading', text: 'Variety on purpose' },
    {
      kind: 'paragraph',
      text: 'Your feed mixes cuisines and main ingredients so it does not show five versions of the same dish in a row.',
    },
    { kind: 'heading', text: 'Nutrition numbers' },
    {
      kind: 'paragraph',
      text: 'Nutrition is calculated from public USDA ingredient data where every ingredient could be matched, and marked "computed". Where that was not possible it is marked "estimated" or left out. Daily targets come from the Dietary Guidelines for Americans, adjusted with your personal details if you add them.',
    },
    { kind: 'heading', text: 'Small appetite mode' },
    {
      kind: 'paragraph',
      text: 'Turn it on in Settings and Famara favours gentle, lighter dishes, halves portions (rounding to whole eggs, tortillas and the like) and plans smaller meals with snacks in between.',
    },
  ],
};
