import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { ReportScreen } from './screens/ReportScreen';

const mockRpc = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));

const POST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const initialSession = useSessionStore.getState();
const clients: QueryClient[] = [];

async function renderReport(kind = 'post', id = POST_ID) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(client);
  return renderWithTheme(
    <QueryClientProvider client={client}>
      <ReportScreen target={kind} targetId={id} label="Ana" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSessionStore.setState(
    { status: 'ready', userId: 'user-1', birthYear: 1990, onboardingComplete: true },
    false,
  );
  mockRpc.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  useSessionStore.setState(initialSession, true);
});

describe('ReportScreen', () => {
  it('sends the chosen reason and details, then thanks the reporter', async () => {
    mockRpc.mockResolvedValue({ data: 'report-1', error: null });
    await renderReport();

    await fireEvent.press(screen.getByTestId('reason-unsafe_food'));
    await fireEvent.changeText(
      screen.getByTestId('report-details'),
      '  Chicken left out overnight  ',
    );
    await fireEvent.press(screen.getByTestId('report-submit'));

    expect(mockRpc).toHaveBeenCalledWith('report_content', {
      p_target_kind: 'post',
      p_target_id: POST_ID,
      p_reason: 'unsafe_food',
      p_details: 'Chicken left out overnight',
    });
    expect(await screen.findByText('Thanks for telling us')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('report-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('does not send until a reason is chosen', async () => {
    await renderReport();
    await fireEvent.press(screen.getByTestId('report-submit'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a reason.')).toBeTruthy();
  });

  it('offers to block after reporting a person', async () => {
    mockRpc.mockResolvedValue({ data: 'report-2', error: null });
    await renderReport('user');
    await fireEvent.press(screen.getByTestId('reason-impersonation'));
    await fireEvent.press(screen.getByTestId('report-submit'));
    expect(await screen.findByText('Block Ana')).toBeTruthy();
  });

  it('keeps the form when the server refuses the report', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PT429', message: 'rate_limited', details: 'Too many reports today.' },
    });
    await renderReport();
    await fireEvent.press(screen.getByTestId('reason-spam'));
    await fireEvent.press(screen.getByTestId('report-submit'));
    expect(screen.queryByText('Thanks for telling us')).toBeNull();
    expect(screen.getByTestId('report-submit')).toBeTruthy();
  });

  it('explains when the link does not name anything reportable', async () => {
    await renderReport('post', 'nope');
    expect(screen.getByText('Nothing to report')).toBeTruthy();
  });
});
