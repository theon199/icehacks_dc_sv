import { useEffect, useState } from 'react';

import type { SnapMode } from '@/lib/api/ai';

import { PhotoBackdrop } from './PhotoBackdrop';
import { ProgressCard } from './ProgressCard';
import type { SnapStage } from '../hooks/useSnapRequest';

export interface SnapProgressProps {
  photoUri: string;
  stage: SnapStage;
  mode: SnapMode;
  onCancel: () => void;
}

/** After this long, reassure the person that a slow answer is still coming. */
const SLOW_AFTER_MS = 15_000;

function stageTitle(stage: SnapStage, mode: SnapMode): string {
  if (stage === 'preparing') return 'Preparing your photo';
  return mode === 'pantry' ? 'Spotting the food items' : 'Recognising the dish';
}

/** The photo being read, dimmed, with what is happening now and the close circle as the way out. */
export function SnapProgress({ photoUri, stage, mode, onCancel }: SnapProgressProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PhotoBackdrop
      photoUri={photoUri}
      onClose={onCancel}
      closeLabel="Cancel"
      testID="snap-progress"
    >
      <ProgressCard
        title={stageTitle(stage, mode)}
        message={
          slow
            ? 'Still working on it. Busy photos can take a little longer.'
            : 'Famara sends this photo once to an AI service to read the food in it.'
        }
      />
    </PhotoBackdrop>
  );
}
