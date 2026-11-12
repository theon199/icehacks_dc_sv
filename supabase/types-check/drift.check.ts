// Compile-time check that src/lib/supabase/database.types.ts matches the types generated from the
// migrated database (CI writes them to supabase/.generated/database.generated.ts). A failure names
// the tables, views, functions or enums that drifted.
import type { Database as Committed } from "../../src/lib/supabase/database.types";
import type { Database as Generated } from "../.generated/database.generated";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true
  : false;
type Drifted<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A
    ? K extends keyof B ? Equal<A[K], B[K]> extends true ? never : K
    : K
    : K;
}[keyof A | keyof B];
type Expect<T extends true> = T;

type C = Committed["public"];
type G = Generated["public"];

export type TablesInSync = Expect<Equal<Drifted<C["Tables"], G["Tables"]>, never>>;
export type ViewsInSync = Expect<Equal<Drifted<C["Views"], G["Views"]>, never>>;
export type FunctionsInSync = Expect<Equal<Drifted<C["Functions"], G["Functions"]>, never>>;
export type EnumsInSync = Expect<Equal<Drifted<C["Enums"], G["Enums"]>, never>>;
