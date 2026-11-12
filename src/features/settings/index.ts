// Public surface of the settings feature.
export { ABOUT_PAGE_LIST, ABOUT_PAGES } from './about/pages';
export type { AboutBlock, AboutPage, AboutSlug } from './about/types';
export { AI_TERMS_VERSION, reconcileAiConsent, setAiConsent, useAiConsentSync } from './aiConsent';
export { formatAppVersion, readAppVersion } from './appVersion';
export { useSettingsLaunchSync } from './useSettingsLaunchSync';
