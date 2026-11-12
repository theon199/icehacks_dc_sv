import { compileSafetyRules } from '@/domain/safety';

import { resultFacts } from './ResultCard';
import { searchRecipe } from '../__fixtures__/recipes';
import { toResultItem } from '../resultItems';

const rules = compileSafetyRules({ allergens: [], diets: [] });

describe('resultFacts', () => {
  it('shows computed calories as a plain figure', () => {
    const facts = resultFacts(toResultItem(searchRecipe('a'), rules));
    expect(facts.text).toMatch(/· 420 kcal$/);
    expect(facts.spoken).not.toMatch(/estimated/);
  });

  it('marks estimated calories on screen and for VoiceOver', () => {
    const recipe = searchRecipe('b', { nutritionConfidence: 'estimated' });
    const facts = resultFacts(toResultItem(recipe, rules));
    expect(facts.text).toMatch(/~420 kcal est\.$/);
    expect(facts.spoken).toMatch(/about 420 kcal, estimated$/);
  });

  it('leaves calories out when the catalog has none', () => {
    const recipe = searchRecipe('c', { nutritionConfidence: 'none', nutrition: null });
    const facts = resultFacts(toResultItem(recipe, rules));
    expect(facts.text).not.toMatch(/kcal/);
  });
});
