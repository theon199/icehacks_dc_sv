/**
 * The only file that talks to Apple Health. The native module is imported lazily on first use and
 * only on iOS, so screens that never touch Health never load it, and other platforms never try.
 */
import type * as HealthKitModule from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';

import type {
  GlucoseReading,
  HealthPlatform,
  HealthRequestStatus,
  SleepInterval,
  WorkoutSession,
} from '@/domain/health';
import { describeError, logger } from '@/lib/logger';

import { toGlucoseReadings, toSleepIntervals, toWorkoutSessions } from './healthKitMapping';

type HealthKit = typeof HealthKitModule;

/** Everything Famara reads. It never writes to Health. */
const READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierBloodGlucose',
] as const;

/** Upper bound on samples per query; two weeks of five-minute glucose readings is ~4 000. */
const SAMPLE_LIMIT = 20_000;

export interface TimeRange {
  from: number;
  to: number;
}

/** What the health feature needs from the platform; tests substitute their own. */
export interface HealthSource {
  platform(): Promise<HealthPlatform>;
  requestStatus(): Promise<HealthRequestStatus>;
  /** Shows the system permission sheet (a no-op once answered). */
  requestAccess(): Promise<void>;
  /** False while the device is locked and Health data is encrypted. */
  canReadNow(): Promise<boolean>;
  readWorkouts(range: TimeRange): Promise<WorkoutSession[]>;
  readSleep(range: TimeRange): Promise<SleepInterval[]>;
  readGlucose(range: TimeRange): Promise<GlucoseReading[]>;
}

let loading: Promise<HealthKit | null> | null = null;

function load(): Promise<HealthKit | null> {
  if (Platform.OS !== 'ios') return Promise.resolve(null);
  loading ??= import('@kingstinct/react-native-healthkit').catch((error: unknown) => {
    // A build without the native module (for example a plain JS runtime) behaves as unavailable.
    logger.warn('Apple Health module failed to load', describeError(error));
    return null;
  });
  return loading;
}

async function required(): Promise<HealthKit> {
  const kit = await load();
  if (!kit) throw new Error('Apple Health is not available on this device.');
  return kit;
}

const dateFilter = ({ from, to }: TimeRange) => ({
  date: { startDate: new Date(from), endDate: new Date(to) },
});

export const healthKitSource: HealthSource = {
  async platform() {
    if (Platform.OS !== 'ios') return 'unsupported';
    const kit = await load();
    if (!kit) return 'unavailable';
    try {
      return (await kit.isHealthDataAvailableAsync()) ? 'available' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  },

  async requestStatus() {
    const kit = await load();
    if (!kit) return 'unknown';
    try {
      const status = await kit.getRequestStatusForAuthorization({ toRead: READ_TYPES });
      if (status === kit.AuthorizationRequestStatus.unnecessary) return 'answered';
      if (status === kit.AuthorizationRequestStatus.shouldRequest) return 'should_request';
      return 'unknown';
    } catch (error) {
      logger.warn('Could not read Apple Health request status', describeError(error));
      return 'unknown';
    }
  },

  async requestAccess() {
    const kit = await required();
    await kit.requestAuthorization({ toRead: READ_TYPES });
  },

  async canReadNow() {
    const kit = await load();
    if (!kit) return false;
    try {
      return await kit.isProtectedDataAvailableAsync();
    } catch {
      return false;
    }
  },

  async readWorkouts(range) {
    const kit = await required();
    const samples = await kit.queryWorkoutSamples({
      limit: SAMPLE_LIMIT,
      ascending: true,
      filter: dateFilter(range),
    });
    return toWorkoutSessions(samples);
  },

  async readSleep(range) {
    const kit = await required();
    const samples = await kit.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: SAMPLE_LIMIT,
      ascending: true,
      filter: dateFilter(range),
    });
    return toSleepIntervals(samples);
  },

  async readGlucose(range) {
    const kit = await required();
    const samples = await kit.queryQuantitySamples('HKQuantityTypeIdentifierBloodGlucose', {
      limit: SAMPLE_LIMIT,
      ascending: true,
      unit: 'mg/dL',
      filter: dateFilter(range),
    });
    return toGlucoseReadings(samples);
  },
};
