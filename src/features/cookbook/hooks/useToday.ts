import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localIsoDate, type IsoDate } from '@/domain/plan';

const systemClock = () => new Date();

/**
 * The person's local calendar day. Re-read whenever the app returns to the foreground so a planner
 * left open overnight moves on to the new day.
 */
export function useToday(clock: () => Date = systemClock): IsoDate {
  const [today, setToday] = useState(() => localIsoDate(clock()));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(localIsoDate(clock()));
    });
    return () => sub.remove();
  }, [clock]);
  return today;
}
