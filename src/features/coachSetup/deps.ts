/**
 * The one place coach setup reaches into code owned by other areas: the 18+ and AI-consent rule
 * that decides whether "Start cooking" opens the coach or the plain cook mode.
 */
export { selectCanUseAi, useSessionStore } from '@/features/auth';
