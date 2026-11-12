import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, mealToSource, youtubeId, type MealDbMeal } from '../src/sources/mealdb.ts';
import { parseDurationText, parseIndexCards, parseRecipePage } from '../src/sources/medlineplus.ts';

// Small hand-written pages that mirror the structure the parser relies on.
const RECIPE_PAGE = `
<html><head><meta property="og:image" content="https://medlineplus.gov/images/x_fb.jpg"></head><body>
<h1>Test Lentil Soup</h1>
<div class="recipe-info"><p><strong>Prep time:</strong> 10 minutes <br><strong>Cook time:</strong> 1 hour 5 minutes <br>
<strong>Total time:</strong> 1 hour 15 minutes <br><strong>Number of Servings:</strong> 6</p></div>
<section><div class="mp-content"><h3>Ingredients</h3>
<ul class="bulletlist"><li>1 cup dry lentils</li><li>2&nbsp;carrots, diced</li></ul>
<p><strong>Topping</strong></p><ul><li>1/4 cup plain yogurt</li></ul></div></section>
<section><div class="mp-content"><h3>Directions</h3><ol><li>Rinse the lentils.</li><li>Simmer for 30 minutes.</li></ol></div></section>
<div class="fh-recipe"></div>
<div class="mp-img"><img src="https://medlineplus.gov/images/x.jpg"></div>
<div class="mp-nutrition">
  <div class="facts-serving-size fact-row"><span class="fact-left">Serving size</span><span class="fact-right">1 cup (240g)</span></div>
  <div class="fact-row fact-calories"><span class="fact-left">Calories</span><span class="fact-right">180</span></div>
  <div class="fact-row"><span class="fact-left"><strong>Total Fat</strong> 2g</span></div>
  <div class="fact-row"><span class="fact-left">Saturated Fat 0.5g</span></div>
  <div class="fact-row"><span class="fact-left"><strong>Sodium</strong> 310mg</span></div>
  <div class="fact-row"><span class="fact-left"><strong>Total Carbohydrate</strong> 30g</span></div>
  <div class="fact-row"><span class="fact-left">Dietary Fiber 9g</span></div>
  <div class="fact-row"><span class="fact-left">Total Sugars 4g</span></div>
  <div class="fact-row"><span class="fact-left">Includes 0g Added Sugars</span></div>
  <div class="fact-row"><span class="fact-left"><strong>Protein</strong> 12g</span></div>
</div></body></html>`;

describe('MedlinePlus parsing', () => {
  it('reads times, servings, ingredients with sections, directions and nutrition', () => {
    const page = parseRecipePage('test-lentil-soup', RECIPE_PAGE);
    assert.equal(page.title, 'Test Lentil Soup');
    assert.equal(page.prepMinutes, 10);
    assert.equal(page.cookMinutes, 65);
    assert.equal(page.totalMinutes, 75);
    assert.equal(page.servings, 6);
    assert.deepEqual(page.lines, [
      { text: '1 cup dry lentils' },
      { text: '2 carrots, diced' },
      { text: '1/4 cup plain yogurt', section: 'Topping' },
    ]);
    assert.deepEqual(page.directions, ['Rinse the lentils.', 'Simmer for 30 minutes.']);
    assert.equal(page.imageUrl, 'https://medlineplus.gov/images/x.jpg');
    assert.equal(page.origin, 'FoodHero.org');
    assert.equal(page.servingGrams, 240);
    assert.deepEqual(page.nutrition, {
      kcal: 180,
      fat_g: 2,
      sat_fat_g: 0.5,
      sodium_mg: 310,
      carbs_g: 30,
      fiber_g: 9,
      sugar_g: 4,
      added_sugar_g: 0,
      protein_g: 12,
    });
  });

  it('reads recipe cards from an index page', () => {
    const html = `<p><strong><a href="https://medlineplus.gov/recipes/bean-dip/">Bean Dip</a><br/><span class="recipe-nhlbi">NHLBI Heart-Healthy Recipe</span></strong></p>`;
    assert.deepEqual(parseIndexCards(html), [{ slug: 'bean-dip', origin: 'NHLBI Heart-Healthy Recipe' }]);
  });

  it('parses duration text', () => {
    assert.equal(parseDurationText('1 hour 30 minutes'), 90);
    assert.equal(parseDurationText('45 minutes'), 45);
    assert.equal(parseDurationText(''), null);
  });
});

describe('TheMealDB mapping', () => {
  const meal: MealDbMeal = {
    idMeal: '12345',
    strMeal: '  Test   Stew ',
    strCategory: 'Beef',
    strArea: 'Unknown',
    strInstructions: 'Brown the beef.\r\nSimmer for 2 hours.',
    strMealThumb: 'http://www.themealdb.com/images/media/meals/test.jpg',
    strTags: 'Stew, Winter',
    strYoutube: 'https://www.youtube.com/watch?v=abcdefghijk',
    strSource: 'not a url',
    strIngredient1: 'Beef',
    strMeasure1: '500g',
    strIngredient2: 'Onion ',
    strMeasure2: '',
    strIngredient3: '',
    strMeasure3: '1 tsp',
  };

  it('keeps ingredient/measure pairs, links and attribution', () => {
    const source = mealToSource(meal);
    assert.equal(source.id, 'mealdb:12345');
    assert.equal(source.title, 'Test Stew');
    assert.equal(source.area, null);
    assert.deepEqual(source.tags, ['stew', 'winter']);
    assert.deepEqual(source.lines, [
      { text: '500g Beef', name: 'Beef', measure: '500g' },
      { text: 'Onion', name: 'Onion', measure: '' },
    ]);
    assert.equal(source.imageUrl, 'https://www.themealdb.com/images/media/meals/test.jpg');
    assert.deepEqual(source.tutorials, [{ kind: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk', title: null, publisher: 'YouTube' }]);
    assert.equal(source.servings, null);
  });

  it('validates link syntax', () => {
    assert.equal(isHttpUrl('https://example.com/a'), true);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl('localhost'), false);
    assert.equal(youtubeId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
    assert.equal(youtubeId('https://www.youtube.com/watch?v=short'), null);
  });
});
