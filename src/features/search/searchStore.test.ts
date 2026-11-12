import { useSessionStore } from '@/features/auth';

import { EMPTY_FILTERS } from './filters';
import { useSearchStore } from './searchStore';

const startingSession = useSessionStore.getState();

function fillSearch() {
  const search = useSearchStore.getState();
  search.setMode('chef');
  search.setQuery('lentil soup');
  search.setFilters({ ...EMPTY_FILTERS, diets: ['vegan'], maxKcal: 450 });
}

beforeEach(() => {
  useSessionStore.setState({ ...startingSession, userId: 'person-a' }, true);
  useSearchStore.getState().reset();
});

afterAll(() => useSessionStore.setState(startingSession, true));

describe('search state ownership', () => {
  it('starts over when a different account signs in', () => {
    fillSearch();
    useSessionStore.setState({ userId: 'person-b' });
    const { mode, query, filters } = useSearchStore.getState();
    expect({ mode, query, filters }).toEqual({ mode: 'search', query: '', filters: EMPTY_FILTERS });
  });

  it('starts over on sign-out', () => {
    fillSearch();
    useSessionStore.setState({ userId: null });
    expect(useSearchStore.getState().query).toBe('');
  });

  it('keeps everything while the same account stays signed in', () => {
    fillSearch();
    useSessionStore.setState({ userId: 'person-a' });
    expect(useSearchStore.getState().query).toBe('lentil soup');
    expect(useSearchStore.getState().filters.maxKcal).toBe(450);
  });
});
