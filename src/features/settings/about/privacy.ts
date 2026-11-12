import type { AboutPage } from './types';

export const privacyPage: AboutPage = {
  slug: 'privacy',
  title: 'Privacy policy',
  summary: 'What Famara collects, why, and the choices you have.',
  updated: 'Last updated November 2026',
  blocks: [
    {
      kind: 'paragraph',
      text: 'Famara is built to collect as little as it can. This policy explains what we store, why we need it, who else handles it and how you stay in control.',
    },
    { kind: 'heading', text: 'What we collect' },
    {
      kind: 'bullets',
      items: [
        'Account: your email address and sign-in details, or the identifier Apple or Google shares when you sign in with them.',
        'Age: only your year of birth, used to confirm you are old enough for Famara and for AI features.',
        'Food profile: cuisines, diets, allergens, goals, cooking time, household size and the small appetite setting.',
        'Your activity in the app: saved recipes, meal plans, pantry, shopping lists, cook history, ratings and feedback.',
        'Personal details, if you add them: height, weight, sex and activity level, used only to work out nutrient targets.',
        'Community content you choose to share: posts, photos, comments, likes and follows.',
        'AI requests, if you use AI features: your messages and photos, and a count of how many requests you made.',
      ],
    },
    { kind: 'heading', text: 'What stays on your device' },
    {
      kind: 'paragraph',
      text: 'Apple Health data stays on your phone unless you choose to sync it. Your personal details are kept in the device Keychain. The recipe catalog is part of the app, so browsing and searching recipes does not send anything to us.',
    },
    { kind: 'heading', text: 'Location' },
    {
      kind: 'paragraph',
      text: 'Famara asks for your location only when you look for a dish nearby, and only while you use the app. It is used to look up restaurants near you and is not saved to your account.',
    },
    { kind: 'heading', text: 'How we use it' },
    {
      kind: 'bullets',
      items: [
        'To recommend recipes, plan meals and build shopping lists that fit you.',
        'To keep your data in sync across your devices.',
        'To run the community, including moderating content and acting on reports.',
        'To keep the service safe, for example by limiting how often requests can be made.',
      ],
    },
    {
      kind: 'paragraph',
      text: 'Famara does not sell your data, does not show ads, and does not track you across other apps or websites.',
    },
    { kind: 'heading', text: 'Who else handles it' },
    {
      kind: 'bullets',
      items: [
        'Our hosting and database provider, which stores your account and synced data.',
        'An AI provider, which processes AI requests to produce replies, only if you turn AI features on.',
        'A maps and places provider, which receives restaurant searches without your identity.',
        'Apple and Google, if you sign in with them or turn on push notifications.',
      ],
    },
    { kind: 'heading', text: 'Who can see what' },
    {
      kind: 'paragraph',
      text: 'Your food profile, personal details, plans and pantry are private to you. Posts are visible to other members or to your followers, as you choose when posting. People you block cannot see your content, and you will not see theirs.',
    },
    { kind: 'heading', text: 'How long we keep it' },
    {
      kind: 'paragraph',
      text: 'We keep your data while your account exists. Read notifications are removed after 90 days. When you delete your account, your profile, synced data, posts, comments and uploaded photos are deleted; photos are purged from storage shortly afterwards.',
    },
    { kind: 'heading', text: 'Your choices' },
    {
      kind: 'bullets',
      items: [
        'Export everything we store about you as a file, from Settings.',
        'Delete your account and its data, from Settings.',
        'Edit or remove your preferences and personal details at any time.',
        'Turn AI features, notifications and Apple Health access on or off.',
      ],
    },
    { kind: 'heading', text: 'Children' },
    {
      kind: 'paragraph',
      text: 'Famara is for people aged 13 and over, and AI features are for people aged 18 and over. We do not knowingly collect data from children under 13.',
    },
    { kind: 'heading', text: 'Changes' },
    {
      kind: 'paragraph',
      text: 'If we change this policy in a way that matters, we will tell you in the app before the change takes effect.',
    },
  ],
};
