import { act, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { AiGate } from './AiGate';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const initial = useSessionStore.getState();
const thisYear = new Date().getFullYear();

function signIn(age: number, aiConsent: boolean) {
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    // Ages come from the birth year's lower bound, so add one to land on the intended age.
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent,
  });
}

function renderGate() {
  return renderWithTheme(
    <AiGate feature="Chef" purpose="Ask about food.">
      <Text>secret chef</Text>
    </AiGate>,
  );
}

beforeEach(() => useSessionStore.setState(initial, true));

describe('AiGate', () => {
  it('keeps the feature from anyone under 18, even with consent, and offers no way in', async () => {
    signIn(17, true);
    await renderGate();
    expect(screen.getByText('Chef is for adults')).toBeOnTheScreen();
    expect(screen.queryByText('secret chef')).toBeNull();
    expect(screen.queryByTestId('ai-gate-review')).toBeNull();
  });

  it('treats an unknown age as under 18', async () => {
    useSessionStore.getState().signedIn({
      userId: 'person-1',
      birthYear: null,
      onboardingComplete: false,
      aiConsent: true,
    });
    await renderGate();
    expect(screen.queryByText('secret chef')).toBeNull();
  });

  it('explains what is shared and links adults without consent to the consent sheet', async () => {
    signIn(30, false);
    await renderGate();
    expect(screen.getByText('Turn on AI features to use Chef')).toBeOnTheScreen();
    expect(screen.getByText(/never sent/)).toBeOnTheScreen();
    expect(screen.queryByText('secret chef')).toBeNull();
    await userEvent.setup().press(screen.getByTestId('ai-gate-review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/ai-consent');
  });

  it('shows the feature to an adult who agreed', async () => {
    signIn(30, true);
    await renderGate();
    expect(screen.getByText('secret chef')).toBeOnTheScreen();
  });

  it('locks again as soon as consent is withdrawn', async () => {
    signIn(30, true);
    await renderGate();
    expect(screen.getByText('secret chef')).toBeOnTheScreen();
    await act(async () => useSessionStore.getState().setAiConsent(false));
    expect(await screen.findByText('Turn on AI features to use Chef')).toBeOnTheScreen();
  });
});
