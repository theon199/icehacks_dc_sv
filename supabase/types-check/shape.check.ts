// Compile-time check that the hand-maintained Database type has the shape supabase-js expects
// (tables with Row/Insert/Update/Relationships, views with Row, functions with Args/Returns).
import type { Database } from "../../src/lib/supabase/database.types";

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type TableShape = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: Relationship[];
};
type ViewShape = { Row: Record<string, unknown>; Relationships: Relationship[] };
type FunctionShape = { Args: Record<string, unknown> | never; Returns: unknown };
type SchemaShape = {
  Tables: Record<string, TableShape>;
  Views: Record<string, ViewShape>;
  Functions: Record<string, FunctionShape>;
  Enums: Record<string, string>;
};

type Expect<T extends true> = T;
export type PublicSchemaHasClientShape = Expect<Database["public"] extends SchemaShape ? true : false>;
