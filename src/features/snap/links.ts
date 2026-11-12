/**
 * Links into the Snap camera. Kept free of camera and image modules so any screen can import them
 * through the feature barrel.
 */
import type { Href } from 'expo-router';

import type { SnapMode } from '@/lib/api/ai';
import { stringParam, type RawParam } from '@/lib/params';

export type { SnapMode };

/** The Snap camera, opened on the chosen mode when one is given. */
export function snapCameraHref(options: { mode?: SnapMode } = {}): Href {
  return options.mode ? { pathname: '/snap', params: { mode: options.mode } } : '/snap';
}

/** A `mode` route param as a Snap mode, or undefined when absent or unknown. */
export function snapModeParam(value: RawParam): SnapMode | undefined {
  const raw = stringParam(value);
  return raw === 'pantry' || raw === 'dish' ? raw : undefined;
}
