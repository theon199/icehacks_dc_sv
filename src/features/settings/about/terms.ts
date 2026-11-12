import type { AboutPage } from './types';

export const termsPage: AboutPage = {
  slug: 'terms',
  title: 'Terms of use',
  summary: 'The rules for using Famara.',
  updated: 'Last updated November 2026',
  blocks: [
    {
      kind: 'paragraph',
      text: 'By creating an account or using Famara you agree to these terms. Please read them together with the privacy policy.',
    },
    { kind: 'heading', text: 'Who can use Famara' },
    {
      kind: 'paragraph',
      text: 'You must be at least 13 to use Famara and at least 18 to use its AI features. You are responsible for keeping your sign-in details safe and for activity on your account.',
    },
    { kind: 'heading', text: 'Information, not medical advice' },
    {
      kind: 'paragraph',
      text: 'Recipes, nutrition values, targets and AI answers are general information. They are not medical, dietary or allergy advice. Check ingredient labels yourself and ask a qualified professional about your health.',
    },
    { kind: 'heading', text: 'Community rules' },
    {
      kind: 'bullets',
      items: [
        'Share only photos and words that are yours to share.',
        'Be respectful. No harassment, hate, threats or sexual content.',
        'No spam, advertising or impersonating other people or the Famara team.',
        'Do not post content that promotes unsafe eating or dangerous practices.',
      ],
    },
    {
      kind: 'paragraph',
      text: 'We may hide or remove content and limit or suspend accounts that break these rules. You will be told when this happens to your content and can appeal from the notice.',
    },
    { kind: 'heading', text: 'Your content' },
    {
      kind: 'paragraph',
      text: 'You keep ownership of what you post. You give Famara permission to store, display and share it inside the app, as needed to run the service, for as long as it stays posted. Deleting a post or your account ends that permission, except for copies others have legitimately kept, such as a remix that credits you.',
    },
    { kind: 'heading', text: 'Recipes and links from others' },
    {
      kind: 'paragraph',
      text: 'Recipes, photos, videos and web pages from other sources belong to their owners and are credited in the app. Links to stores may be affiliate links, which never change the price you pay.',
    },
    { kind: 'heading', text: 'AI features' },
    {
      kind: 'paragraph',
      text: 'AI answers may be inaccurate. Do not rely on them for decisions about allergies or health. Do not use AI features to create harmful content or to get around safety checks. Use is limited to a fair daily allowance.',
    },
    { kind: 'heading', text: 'Using Famara fairly' },
    {
      kind: 'paragraph',
      text: 'Do not misuse the service: no scraping, automated access, attempts to break security or to overload our systems.',
    },
    { kind: 'heading', text: 'Changes and availability' },
    {
      kind: 'paragraph',
      text: 'Famara is provided as it is. We work to keep it running and accurate but cannot promise it will always be available or error-free. We may change or end features, and we will tell you in the app before changing these terms in a way that matters.',
    },
    { kind: 'heading', text: 'Ending your account' },
    {
      kind: 'paragraph',
      text: 'You can delete your account at any time from Settings. We may close accounts that seriously or repeatedly break these terms.',
    },
    { kind: 'heading', text: 'Liability' },
    {
      kind: 'paragraph',
      text: 'To the extent the law allows, Famara is not liable for indirect losses or for harm that comes from relying on recipes, nutrition information or AI answers. Nothing in these terms limits rights you have under consumer law.',
    },
  ],
};
