import {
  REGIONS,
  REGION_LABELS,
  cuisineInfo,
  cuisineLabel,
  cuisinesInRegion,
} from '@/domain/types';

import { MAX_CUISINES } from '../deps';
import { ChoiceGroup } from './ChoiceGroup';
import { PreferenceCard } from './PreferenceCard';

export interface CuisinePickerProps {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

const sections = REGIONS.map((region) => ({
  region,
  title: REGION_LABELS[region],
  options: cuisinesInRegion(region).map((info) => [info.id, info.label] as const),
})).filter((section) => section.options.length > 0);

/** Up to five loved cuisines, grouped by region. */
export function CuisinePicker({ selected, onChange }: CuisinePickerProps) {
  const full = selected.length >= MAX_CUISINES;
  // Cuisines picked elsewhere (a newer catalog) that this build does not list, so they can still
  // be removed here.
  const unlisted = selected.filter((id) => cuisineInfo(id) == null);
  const toggle = (id: string, next: boolean) =>
    onChange(next ? [...selected, id] : selected.filter((value) => value !== id));

  return (
    <PreferenceCard
      testID="prefs-cuisines"
      title="Cuisines you love"
      summary={`${selected.length} of ${MAX_CUISINES} chosen`}
      summaryActive={selected.length > 0}
    >
      {unlisted.length > 0 ? (
        <ChoiceGroup
          testID="prefs-cuisine"
          title="Also chosen"
          options={unlisted.map((id) => [id, cuisineLabel(id)] as const)}
          selected={selected}
          onToggle={toggle}
        />
      ) : null}
      {sections.map((section) => (
        <ChoiceGroup
          key={section.region}
          testID="prefs-cuisine"
          title={section.title}
          options={section.options}
          selected={selected}
          full={full}
          onToggle={toggle}
        />
      ))}
    </PreferenceCard>
  );
}
