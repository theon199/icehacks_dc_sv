// Chef: the AI assistant, plus the AI gate other AI features reuse.
export { AiGate, type AiGateProps } from './components/AiGate';
export { ChefScreen, type ChefScreenProps } from './screens/ChefScreen';
export {
  describeAiProblem,
  remainingNote,
  waitPhrase,
  type AiProblem,
  type AiProblemKind,
  type ProblemCopy,
} from './logic/problems';
export { safetyPrefsFrom } from './deps';
