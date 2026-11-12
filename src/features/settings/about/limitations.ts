import type { AboutPage } from './types';

export const limitationsPage: AboutPage = {
  slug: 'limitations',
  title: 'Limitations',
  summary: 'Famara offers general information, not medical advice.',
  blocks: [
    {
      kind: 'note',
      text: 'Famara is a cooking and meal-planning app. It does not diagnose, treat or prevent any condition, and it is not a substitute for advice from a doctor or registered dietitian.',
    },
    { kind: 'heading', text: 'Allergies' },
    {
      kind: 'paragraph',
      text: 'Famara hides recipes it cannot confirm are free of your declared allergens, but recipe data can be incomplete and products vary by brand. Always read the labels of what you buy, and talk to your doctor about managing a serious allergy.',
    },
    { kind: 'heading', text: 'Nutrition' },
    {
      kind: 'paragraph',
      text: 'Nutrition values are calculated from typical ingredient data and standard portions. Your ingredients, brands and serving sizes will differ. Values marked "estimated", and anything worked out from a photo, are rougher still.',
    },
    { kind: 'heading', text: 'Health goals and targets' },
    {
      kind: 'paragraph',
      text: 'Daily targets are general guidelines for healthy adults. If you are pregnant, managing a medical condition, recovering from illness or following a plan from a clinician, follow their guidance instead.',
    },
    { kind: 'heading', text: 'Health data' },
    {
      kind: 'paragraph',
      text: 'If you connect Apple Health, any patterns Famara shows, such as how steady your glucose was after a meal, are informational observations from your own data. They are not medical findings and should not be used to change medication or treatment.',
    },
    { kind: 'heading', text: 'AI features' },
    {
      kind: 'paragraph',
      text: 'AI answers can be wrong or incomplete. Famara re-checks suggested recipes against your allergens and diet, but treat everything else the AI says as a starting point, not a fact.',
    },
    { kind: 'heading', text: 'Small appetite mode' },
    {
      kind: 'paragraph',
      text: 'Smaller portions are a convenience, not a treatment. If you are eating much less than usual or losing weight without trying, please speak to a health professional.',
    },
    { kind: 'heading', text: 'Prices and places' },
    {
      kind: 'paragraph',
      text: 'Cost estimates and restaurant results come from cached listings and public sources. Prices, menus and opening hours change, so check with the store or restaurant.',
    },
  ],
};
