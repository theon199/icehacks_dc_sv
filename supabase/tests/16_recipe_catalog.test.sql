begin;
create extension if not exists pgtap schema extensions;
select plan(5);

insert into private.catalog_recipes (
  id, slug, title, summary, cuisine, region, course, servings, effort,
  source_name, license, nutrition_confidence, allergens, diet_flags, goal_tags,
  health_score, family_id, ingredient_ids, core_ingredient_ids,
  search_title, search_cuisine, search_ingredients
)
values
  ('test:catalog-one', 'test-catalog-one', 'Test Lentil Soup', '', 'test', '', 'soup', 2, 1,
   'Test Publisher', 'test', 'none', '{"milk":"free"}', 1, '[]', 0.9, 'test:catalog-family',
   '[]', '[]', 'test lentil soup', 'test', 'lentils'),
  ('test:catalog-two', 'test-catalog-two', 'Test Lentil Stew', '', 'test', '', 'main', 2, 1,
   'Test Publisher', 'test', 'none', '{"milk":"unknown"}', 1, '[]', 0.8, 'test:catalog-family',
   '[]', '[]', 'test lentil stew', 'test', 'lentils');

insert into private.catalog_recipe_steps (recipe_id, position, text)
values ('test:catalog-one', 2, 'Serve.'), ('test:catalog-one', 1, 'Simmer.');

set local role anon;

select is(
  jsonb_array_length(public.catalog_recipes(p_query => '''lenti'':*', p_family_id => 'test:catalog-family')),
  2, 'anonymous catalog search can prefix-match vetted recipes'
);
select is(
  public.catalog_recipes(p_family_id => 'test:catalog-family', p_filters => '{"avoid_allergens":["milk"]}')
    #>> '{0,id}',
  'test:catalog-one', 'an allergen is only allowed when explicitly free'
);
select is(
  jsonb_array_length(public.catalog_recipes(p_family_id => 'test:catalog-family', p_filters => '{"avoid_allergens":["milk"]}')),
  1, 'unknown allergen status is excluded'
);
select is(public.catalog_recipe_detail('test:catalog-one') #>> '{steps,0,text}',
  'Simmer.', 'details return directions in order');
reset role;
select ok(
  not has_table_privilege('anon', 'private.catalog_recipes', 'INSERT')
    and not has_table_privilege('authenticated', 'private.catalog_recipes', 'UPDATE'),
  'client roles cannot mutate the catalog'
);

select * from finish();
rollback;
