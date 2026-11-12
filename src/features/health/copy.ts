/**
 * Every word the health feature shows. Wording is informational: it describes what the person's
 * own data showed and never diagnoses, prescribes or sets targets.
 */
import type { ActivityLevel, DaySuggestion, HealthConnectionState } from '@/domain/health';

export const healthCopy = {
  intro:
    'Famara can read workouts, sleep and glucose from Apple Health to tailor suggestions to your day. It never writes to Apple Health.',
  disclaimer:
    'Health insights are for information only and are not medical advice. Talk to a healthcare professional about your health or glucose.',
  privacy:
    'Health data stays on this iPhone. If you turn on sync, only the summaries below are saved to your account, never raw readings.',

  connection: {
    title: 'Apple Health',
    checking: 'Checking Apple Health…',
    states: {
      unsupported: 'Apple Health is available on iPhone only.',
      unavailable: 'Apple Health is not available on this device.',
      off: 'Not connected.',
      needs_permission:
        'Allow Famara to read your workouts, sleep and glucose to finish connecting.',
      connected: 'Connected. If nothing shows up, check Health › Sharing › Apps › Famara.',
    } satisfies Record<HealthConnectionState, string>,
    connect: 'Connect Apple Health',
    allow: 'Allow access',
    disconnect: 'Disconnect',
    disconnectHint:
      'Stops reading Apple Health and clears the health data Famara kept on this device.',
    connectFailed: 'Could not connect to Apple Health. Please try again.',
    sync: 'Sync summaries to my account',
    syncHint: 'Keeps your day context and dish insights on your other devices.',
  },

  day: {
    title: 'Today',
    empty: 'No workouts or sleep recorded in the last 24 hours.',
    pending: 'Nothing to show yet. Today updates each time you open Famara.',
    activity: {
      rest: 'Rest day so far',
      light: 'Lightly active',
      active: 'Active day',
      very_active: 'Very active day',
    } satisfies Record<ActivityLevel, string>,
    workoutMinutes: (minutes: number) =>
      minutes === 1 ? '1 minute of workouts' : `${minutes} minutes of workouts`,
    sleep: (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest === 0 ? `${hours} h of sleep` : `${hours} h ${rest} min of sleep`;
    },
    noSleep: 'No sleep recorded',
    sleepLabel: 'Sleep',
    shortNight: 'Short night',
    suggestions: {
      more_protein: 'Leaning towards protein-rich dishes to help you recover.',
      refuel_carbs: 'Including some slower carbs to refuel after a big day.',
      lighter_dinner: 'Suggesting lighter dinners after a short night.',
      earlier_dinner: 'An earlier dinner may feel better tonight.',
    } satisfies Record<DaySuggestion, string>,
    noSuggestions: 'Suggestions are as usual today.',
  },

  glucose: {
    title: 'Glucose after meals',
    noData:
      'If you wear a glucose sensor that saves to Apple Health, Famara can show how your readings looked in the two hours after dishes you cook.',
    collecting: (days: number, needed: number) =>
      `Collecting: ${days} of ${needed} days with a clear reading after a meal.`,
    collectingHint:
      'Meals count when there is a reading right before you eat, steady readings for two hours after, and no other meal or workout in that time.',
    ready: 'Compared with your own typical rise after meals.',
    steadierTitle: 'Kept your readings steadier',
    noSteadier: 'No dish stands out as steadier yet. Keep cooking and logging meals.',
    dishLine: (pairs: number, rise: number) => `${pairs} meals · typical rise ${rise} mg/dL`,
    unknownDish: 'A dish you cooked',
  },
} as const;
