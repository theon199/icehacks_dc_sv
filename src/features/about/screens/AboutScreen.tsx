import { ComingSoon } from '@/ui';

import { ABOUT_PAGES, type AboutPage } from '../pages';

export interface AboutScreenProps {
  page: AboutPage;
}

/** Placeholder until the about pages are written. */
export function AboutScreen({ page }: AboutScreenProps) {
  const info = ABOUT_PAGES[page];
  return <ComingSoon title={info.title} description={info.summary} icon="info.circle" />;
}
