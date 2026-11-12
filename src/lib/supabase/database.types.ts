/**
 * Supabase types for the Famara database (`public` schema).
 *
 * The `Database` type mirrors supabase/migrations exactly and is what `createClient<Database>()`
 * expects. CI regenerates it from the migrated schema and fails if this file drifts
 * (supabase/types-check/drift.check.ts). To refresh it after a migration, with a local stack:
 *
 *   supabase db reset
 *   supabase gen types typescript --local --schema public > supabase/.generated/database.generated.ts
 *
 * then copy the generated `Database` type over the one below (CI also uploads that file as the
 * `database-types` artifact). Everything else here is maintained by hand: the lookup helpers,
 * `Constants` (update it when an enum changes) and the Famara aliases at the end.
 * See docs/BACKEND.md for what each table, view and RPC does.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ai_usage: {
        Row: {
          count: number;
          feature: string;
          updated_at: string;
          user_id: string;
          window_seconds: number;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          feature: string;
          updated_at?: string;
          user_id: string;
          window_seconds: number;
          window_start: string;
        };
        Update: {
          count?: number;
          feature?: string;
          updated_at?: string;
          user_id?: string;
          window_seconds?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      badge_awards: {
        Row: {
          awarded_at: string;
          badge_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          awarded_at?: string;
          badge_id: string;
          user_id: string;
        };
        Update: {
          awarded_at?: string;
          badge_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "badge_awards_badge_id_fkey";
            columns: ["badge_id"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "badge_awards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      badges: {
        Row: {
          description: string;
          id: string;
          metric: string;
          name: string;
          sort_order: number;
          threshold: number;
        };
        ComputedFields: never;
        Insert: {
          description: string;
          id: string;
          metric: string;
          name: string;
          sort_order?: number;
          threshold: number;
        };
        Update: {
          description?: string;
          id?: string;
          metric?: string;
          name?: string;
          sort_order?: number;
          threshold?: number;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          parent_comment_id: string | null;
          post_id: string;
          status: Database["public"]["Enums"]["content_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          parent_comment_id?: string | null;
          post_id: string;
          status?: Database["public"]["Enums"]["content_status"];
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          parent_comment_id?: string | null;
          post_id?: string;
          status?: Database["public"]["Enums"]["content_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "comment_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      cook_events: {
        Row: {
          client_event_id: string | null;
          cooked_at: string;
          created_at: string;
          cuisine: string | null;
          id: string;
          local_date: string;
          rating: number | null;
          recipe_ref: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id?: string | null;
          cooked_at?: string;
          created_at?: string;
          cuisine?: string | null;
          id?: string;
          local_date: string;
          rating?: number | null;
          recipe_ref: string;
          user_id: string;
        };
        Update: {
          client_event_id?: string | null;
          cooked_at?: string;
          created_at?: string;
          cuisine?: string | null;
          id?: string;
          local_date?: string;
          rating?: number | null;
          recipe_ref?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      dish_confirmations: {
        Row: {
          created_at: string;
          dish_key: string;
          had_it: boolean;
          place_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          dish_key: string;
          had_it: boolean;
          place_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dish_key?: string;
          had_it?: boolean;
          place_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          followee_id: string;
          follower_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          followee_id: string;
          follower_id: string;
        };
        Update: {
          created_at?: string;
          followee_id?: string;
          follower_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey";
            columns: ["followee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friend_invites: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string;
          inviter_id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          expires_at?: string;
          inviter_id: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string;
          inviter_id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "friend_invites_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_invites_redeemed_by_fkey";
            columns: ["redeemed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredient_price_cache: {
        Row: {
          cache_key: string;
          confidence: string;
          currency: string;
          expires_at: string;
          fetched_at: string;
          ingredient_id: string;
          package_qty: number | null;
          price_cents: number | null;
          region: string;
          source_name: string | null;
          source_url: string | null;
          status: string;
          unit: string | null;
        };
        ComputedFields: never;
        Insert: {
          cache_key: string;
          confidence?: string;
          currency?: string;
          expires_at: string;
          fetched_at?: string;
          ingredient_id: string;
          package_qty?: number | null;
          price_cents?: number | null;
          region?: string;
          source_name?: string | null;
          source_url?: string | null;
          status?: string;
          unit?: string | null;
        };
        Update: {
          cache_key?: string;
          confidence?: string;
          currency?: string;
          expires_at?: string;
          fetched_at?: string;
          ingredient_id?: string;
          package_qty?: number | null;
          price_cents?: number | null;
          region?: string;
          source_name?: string | null;
          source_url?: string | null;
          status?: string;
          unit?: string | null;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action_kind"];
          automated: boolean;
          created_at: string;
          id: string;
          moderator_id: string | null;
          reason: string;
          report_id: string | null;
          suspended_until: string | null;
          target_id: string;
          target_kind: Database["public"]["Enums"]["report_target"];
          target_owner_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: Database["public"]["Enums"]["moderation_action_kind"];
          automated?: boolean;
          created_at?: string;
          id?: string;
          moderator_id?: string | null;
          reason: string;
          report_id?: string | null;
          suspended_until?: string | null;
          target_id: string;
          target_kind: Database["public"]["Enums"]["report_target"];
          target_owner_id?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["moderation_action_kind"];
          automated?: boolean;
          created_at?: string;
          id?: string;
          moderator_id?: string | null;
          reason?: string;
          report_id?: string | null;
          suspended_until?: string | null;
          target_id?: string;
          target_kind?: Database["public"]["Enums"]["report_target"];
          target_owner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey";
            columns: ["moderator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_actions_target_owner_id_fkey";
            columns: ["target_owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_appeals: {
        Row: {
          action_id: string;
          appellant_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          message: string;
          status: Database["public"]["Enums"]["appeal_status"];
        };
        ComputedFields: never;
        Insert: {
          action_id: string;
          appellant_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          message: string;
          status?: Database["public"]["Enums"]["appeal_status"];
        };
        Update: {
          action_id?: string;
          appellant_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          message?: string;
          status?: Database["public"]["Enums"]["appeal_status"];
        };
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "moderation_actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_appeals_appellant_id_fkey";
            columns: ["appellant_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_appeals_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          comment_id: string | null;
          created_at: string;
          data: NonNullable<Json>;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id: string | null;
          read_at: string | null;
          recipient_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id?: string | null;
          read_at?: string | null;
          recipient_id: string;
        };
        Update: {
          actor_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          post_id?: string | null;
          read_at?: string | null;
          recipient_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comment_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      places_cache: {
        Row: {
          cache_key: string;
          expires_at: string;
          fetched_at: string;
          lat_rounded: number;
          lng_rounded: number;
          payload: NonNullable<Json>;
          query: string;
        };
        ComputedFields: never;
        Insert: {
          cache_key: string;
          expires_at: string;
          fetched_at?: string;
          lat_rounded: number;
          lng_rounded: number;
          payload: NonNullable<Json>;
          query: string;
        };
        Update: {
          cache_key?: string;
          expires_at?: string;
          fetched_at?: string;
          lat_rounded?: number;
          lng_rounded?: number;
          payload?: NonNullable<Json>;
          query?: string;
        };
        Relationships: [];
      };
      post_likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          blurhash: string | null;
          created_at: string;
          height: number;
          id: string;
          owner_id: string;
          path: string;
          position: number;
          post_id: string;
          width: number;
        };
        ComputedFields: never;
        Insert: {
          blurhash?: string | null;
          created_at?: string;
          height: number;
          id?: string;
          owner_id: string;
          path: string;
          position: number;
          post_id: string;
          width: number;
        };
        Update: {
          blurhash?: string | null;
          created_at?: string;
          height?: number;
          id?: string;
          owner_id?: string;
          path?: string;
          position?: number;
          post_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "post_media_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_saves: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_saves_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_saves_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_saves_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string;
          body: string;
          comment_count: number;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["post_kind"];
          like_count: number;
          parent_post_id: string | null;
          rating: number | null;
          recipe_ref: string | null;
          status: Database["public"]["Enums"]["content_status"];
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body?: string;
          comment_count?: number;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["post_kind"];
          like_count?: number;
          parent_post_id?: string | null;
          rating?: number | null;
          recipe_ref?: string | null;
          status?: Database["public"]["Enums"]["content_status"];
          title: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["post_visibility"];
        };
        Update: {
          author_id?: string;
          body?: string;
          comment_count?: number;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["post_kind"];
          like_count?: number;
          parent_post_id?: string | null;
          rating?: number | null;
          recipe_ref?: string | null;
          status?: Database["public"]["Enums"]["content_status"];
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["post_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_parent_post_id_fkey";
            columns: ["parent_post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_parent_post_id_fkey";
            columns: ["parent_post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          bio: string;
          created_at: string;
          cuisines: string[];
          display_name: string;
          handle: string;
          id: string;
          is_team: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          bio?: string;
          created_at?: string;
          cuisines?: string[];
          display_name: string;
          handle: string;
          id: string;
          is_team?: boolean;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          bio?: string;
          created_at?: string;
          cuisines?: string[];
          display_name?: string;
          handle?: string;
          id?: string;
          is_team?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          automated: boolean;
          created_at: string;
          details: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
          target_id: string;
          target_kind: Database["public"]["Enums"]["report_target"];
          target_owner_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          automated?: boolean;
          created_at?: string;
          details?: string;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_id: string;
          target_kind: Database["public"]["Enums"]["report_target"];
          target_owner_id?: string | null;
        };
        Update: {
          automated?: boolean;
          created_at?: string;
          details?: string;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_id?: string;
          target_kind?: Database["public"]["Enums"]["report_target"];
          target_owner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_target_owner_id_fkey";
            columns: ["target_owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_documents: {
        Row: {
          collection: string;
          data: NonNullable<Json>;
          deleted_at: string | null;
          device_id: string;
          doc_id: string;
          revision: number;
          server_updated_at: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          collection: string;
          data?: NonNullable<Json>;
          deleted_at?: string | null;
          device_id: string;
          doc_id: string;
          revision?: number;
          server_updated_at?: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          collection?: string;
          data?: NonNullable<Json>;
          deleted_at?: string | null;
          device_id?: string;
          doc_id?: string;
          revision?: number;
          server_updated_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      walmart_item_cache: {
        Row: {
          expires_at: string;
          fetched_at: string;
          item_id: string;
          payload: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          expires_at: string;
          fetched_at?: string;
          item_id: string;
          payload: NonNullable<Json>;
        };
        Update: {
          expires_at?: string;
          fetched_at?: string;
          item_id?: string;
          payload?: NonNullable<Json>;
        };
        Relationships: [];
      };
      walmart_item_map: {
        Row: {
          approved: boolean;
          created_at: string;
          ingredient_id: string;
          item_id: string;
          note: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          approved?: boolean;
          created_at?: string;
          ingredient_id: string;
          item_id: string;
          note?: string | null;
          updated_at?: string;
        };
        Update: {
          approved?: boolean;
          created_at?: string;
          ingredient_id?: string;
          item_id?: string;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      comment_cards: {
        Row: {
          author_avatar_path: string | null;
          author_display_name: string;
          author_handle: string | null;
          author_id: string;
          body: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          parent_comment_id: string | null;
          post_id: string;
          status: Database["public"]["Enums"]["content_status"];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "comment_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_cards: {
        Row: {
          actor_avatar_path: string | null;
          actor_display_name: string | null;
          actor_handle: string | null;
          actor_id: string | null;
          comment_id: string | null;
          created_at: string;
          data: NonNullable<Json>;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          post_id: string | null;
          read_at: string | null;
          recipient_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comment_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_cards: {
        Row: {
          author_avatar_path: string | null;
          author_display_name: string;
          author_handle: string | null;
          author_id: string;
          author_is_team: boolean;
          body: string;
          comment_count: number;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["post_kind"];
          like_count: number;
          liked_by_me: boolean | null;
          media: Json | null;
          parent_post_id: string | null;
          rating: number | null;
          recipe_ref: string | null;
          saved_by_me: boolean | null;
          status: Database["public"]["Enums"]["content_status"];
          title: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_parent_post_id_fkey";
            columns: ["parent_post_id"];
            isOneToOne: false;
            referencedRelation: "post_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_parent_post_id_fkey";
            columns: ["parent_post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_comment: {
        Args: {
          p_body: string;
          p_parent_comment_id?: string;
          p_post_id: string;
        };
        Returns: {
          author_id: string;
          body: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          parent_comment_id: string | null;
          post_id: string;
          status: Database["public"]["Enums"]["content_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "comments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      age_years: { Args: Record<PropertyKey, never>; Returns: number };
      appeal: {
        Args: { p_action_id: string; p_message: string };
        Returns: string;
      };
      appeal_queue: { Args: { p_limit?: number }; Returns: Json };
      block_user: { Args: { p_user_id: string }; Returns: undefined };
      claim_storage_purge: {
        Args: { p_limit?: number };
        Returns: {
          bucket_id: string;
          id: number;
          object_name: string;
        }[];
      };
      claim_fill_leases: {
        Args: { p_holder: string; p_keys: string[]; p_ttl_seconds?: number };
        Returns: string[];
      };
      complete_storage_purge: { Args: { p_ids: number[] }; Returns: number };
      confirm_dish: {
        Args: { p_dish_key: string; p_had_it: boolean; p_place_id: string };
        Returns: Json;
      };
      consume_ai_quota: {
        Args: { p_feature: string; p_limit: number; p_window_seconds?: number };
        Returns: {
          allowed: boolean;
          remaining: number;
          reset_at: string;
        }[];
      };
      create_friend_invite: { Args: Record<PropertyKey, never>; Returns: Json };
      decide_appeal: {
        Args: {
          p_appeal_id: string;
          p_note?: string;
          p_outcome: Database["public"]["Enums"]["appeal_status"];
        };
        Returns: undefined;
      };
      delete_comment: { Args: { p_comment_id: string }; Returns: Json };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: Json };
      dish_confirmation_summary: {
        Args: {
          p_dish_key: string;
          p_place_ids: string[];
        };
        Returns: {
          my_answer: boolean;
          no_count: number;
          place_id: string;
          yes_count: number;
        }[];
      };
      export_my_data: { Args: Record<PropertyKey, never>; Returns: Json };
      follow_user: { Args: { p_user_id: string }; Returns: undefined };
      get_feed: {
        Args: {
          p_author_id?: string;
          p_cursor?: string;
          p_limit?: number;
          p_mode?: Database["public"]["Enums"]["feed_mode"];
        };
        Returns: Json;
      };
      get_profile_summary: { Args: { p_user_id: string }; Returns: Json };
      is_adult: { Args: Record<PropertyKey, never>; Returns: boolean };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      moderate: {
        Args: {
          p_action: Database["public"]["Enums"]["moderation_action_kind"];
          p_reason: string;
          p_suspend_days?: number;
          p_target_id: string;
          p_target_kind: Database["public"]["Enums"]["report_target"];
        };
        Returns: string;
      };
      moderation_queue: {
        Args: {
          p_cursor?: string;
          p_limit?: number;
          p_status?: Database["public"]["Enums"]["report_status"];
        };
        Returns: Json;
      };
      my_account_status: { Args: Record<PropertyKey, never>; Returns: Json };
      my_ai_usage: {
        Args: Record<PropertyKey, never>;
        Returns: {
          count: number;
          feature: string;
          window_seconds: number;
          window_start: string;
        }[];
      };
      my_moderation_decisions: {
        Args: { p_limit?: number };
        Returns: {
          action: Database["public"]["Enums"]["moderation_action_kind"];
          action_id: string;
          appeal_note: string;
          appeal_status: Database["public"]["Enums"]["appeal_status"];
          appealable: boolean;
          automated: boolean;
          created_at: string;
          reason: string;
          suspended_until: string;
          target_id: string;
          target_kind: Database["public"]["Enums"]["report_target"];
        }[];
      };
      my_reports: {
        Args: { p_limit?: number };
        Returns: {
          created_at: string;
          details: string;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          resolved_at: string;
          status: Database["public"]["Enums"]["report_status"];
          target_id: string;
          target_kind: Database["public"]["Enums"]["report_target"];
        }[];
      };
      my_stats: { Args: { p_today?: string }; Returns: Json };
      publish_post: {
        Args: {
          p_body?: string;
          p_kind: Database["public"]["Enums"]["post_kind"];
          p_media?: Json;
          p_parent_post_id?: string;
          p_rating?: number;
          p_recipe_ref?: string;
          p_title: string;
          p_visibility?: Database["public"]["Enums"]["post_visibility"];
        };
        Returns: {
          author_id: string;
          body: string;
          comment_count: number;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["post_kind"];
          like_count: number;
          parent_post_id: string | null;
          rating: number | null;
          recipe_ref: string | null;
          status: Database["public"]["Enums"]["content_status"];
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "posts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_cook_event: {
        Args: {
          p_client_event_id?: string;
          p_cooked_at?: string;
          p_cuisine?: string;
          p_local_date: string;
          p_rating?: number;
          p_recipe_ref: string;
        };
        Returns: Json;
      };
      record_text_review: {
        Args: {
          p_body: string;
          p_category?: string;
          p_target: string;
          p_title: string;
          p_ttl_seconds?: number;
          p_user_id: string;
          p_verdict: string;
        };
        Returns: number;
      };
      redeem_friend_invite: { Args: { p_code: string }; Returns: Json };
      release_fill_leases: {
        Args: { p_holder: string; p_keys: string[] };
        Returns: number;
      };
      release_usage: {
        Args: { p_bucket: string; p_period: string; p_units: number };
        Returns: undefined;
      };
      report_content: {
        Args: {
          p_details?: string;
          p_reason: Database["public"]["Enums"]["report_reason"];
          p_target_id: string;
          p_target_kind: Database["public"]["Enums"]["report_target"];
        };
        Returns: string;
      };
      reserve_usage: {
        Args: {
          p_bucket: string;
          p_limit: number;
          p_period: string;
          p_units: number;
        };
        Returns: number;
      };
      set_birth_year: { Args: { p_birth_year: number }; Returns: Json };
      sync_pull: {
        Args: { p_full?: boolean; p_limit?: number; p_since?: number };
        Returns: Json;
      };
      sync_push: { Args: { p_docs: Json }; Returns: Json };
      toggle_like: { Args: { p_post_id: string }; Returns: Json };
      toggle_save: { Args: { p_post_id: string }; Returns: Json };
      unblock_user: { Args: { p_user_id: string }; Returns: undefined };
      unfollow_user: { Args: { p_user_id: string }; Returns: undefined };
      unread_notification_count: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      weekly_top_dishes: {
        Args: { p_limit?: number; p_min_cooks?: number };
        Returns: {
          avg_rating: number;
          cook_count: number;
          cooks: number;
          post_count: number;
          recipe_ref: string;
        }[];
      };
    };
    Enums: {
      app_role: "moderator" | "admin";
      appeal_status: "pending" | "upheld" | "reversed";
      content_status: "visible" | "hidden" | "removed";
      feed_mode: "following" | "popular" | "new" | "author" | "saved";
      moderation_action_kind:
        | "hide"
        | "restore"
        | "remove"
        | "warn"
        | "suspend"
        | "unsuspend"
        | "dismiss";
      notification_kind:
        | "like"
        | "comment"
        | "reply"
        | "follow"
        | "friend_accept"
        | "moderation"
        | "appeal_decision"
        | "badge";
      post_kind: "cook" | "remix" | "tip";
      post_visibility: "public" | "followers";
      report_reason:
        | "spam"
        | "harassment"
        | "hate"
        | "sexual"
        | "violence"
        | "self_harm"
        | "misinformation"
        | "unsafe_food"
        | "impersonation"
        | "other";
      report_status: "open" | "actioned" | "dismissed";
      report_target: "post" | "comment" | "user" | "recipe";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// -------------------------------------------------------------------------------------------------
// Lookup helpers. Famara exposes one schema, so these index `public` directly:
// Tables<"posts">, TablesInsert<"posts">, TablesUpdate<"posts">, Enums<"feed_mode">.
// -------------------------------------------------------------------------------------------------

type PublicSchema = Database["public"];
type PublicTableName = keyof PublicSchema["Tables"];
type PublicViewName = keyof PublicSchema["Views"];

/** Row of a table or view. */
export type Tables<Name extends PublicTableName | PublicViewName> = Name extends PublicTableName
  ? PublicSchema["Tables"][Name]["Row"]
  : Name extends PublicViewName ? PublicSchema["Views"][Name]["Row"]
  : never;

/** Insert payload of a table. */
export type TablesInsert<Name extends PublicTableName> = PublicSchema["Tables"][Name]["Insert"];

/** Update payload of a table. */
export type TablesUpdate<Name extends PublicTableName> = PublicSchema["Tables"][Name]["Update"];

/** Values of an enum. */
export type Enums<Name extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][Name];

/** A composite type (none are defined yet). */
export type CompositeTypes<Name extends keyof PublicSchema["CompositeTypes"]> =
  PublicSchema["CompositeTypes"][Name];

export const Constants = {
  public: {
    Enums: {
      app_role: ["moderator", "admin"],
      appeal_status: ["pending", "upheld", "reversed"],
      content_status: ["visible", "hidden", "removed"],
      feed_mode: ["following", "popular", "new", "author", "saved"],
      moderation_action_kind: [
        "hide",
        "restore",
        "remove",
        "warn",
        "suspend",
        "unsuspend",
        "dismiss",
      ],
      notification_kind: [
        "like",
        "comment",
        "reply",
        "follow",
        "friend_accept",
        "moderation",
        "appeal_decision",
        "badge",
      ],
      post_kind: ["cook", "remix", "tip"],
      post_visibility: ["public", "followers"],
      report_reason: [
        "spam",
        "harassment",
        "hate",
        "sexual",
        "violence",
        "self_harm",
        "misinformation",
        "unsafe_food",
        "impersonation",
        "other",
      ],
      report_status: ["open", "actioned", "dismissed"],
      report_target: ["post", "comment", "user", "recipe"],
    },
  },
} as const;

// -------------------------------------------------------------------------------------------------
// Famara aliases (maintained by hand; keep when regenerating the section above)
// -------------------------------------------------------------------------------------------------

export type Profile = Tables<"profiles">;
export type Post = Tables<"posts">;
export type PostComment = Tables<"comments">;
export type InboxNotification = Tables<"notifications">;
export type CookEvent = Tables<"cook_events">;
export type Badge = Tables<"badges">;
export type UserDocument = Tables<"user_documents">;
export type CommentCard = Tables<"comment_cards">;
export type NotificationCard = Tables<"notification_cards">;

export type PostKind = Enums<"post_kind">;
export type PostVisibility = Enums<"post_visibility">;
export type ContentStatus = Enums<"content_status">;
export type FeedMode = Enums<"feed_mode">;
export type NotificationKind = Enums<"notification_kind">;
export type ReportTarget = Enums<"report_target">;
export type ReportReason = Enums<"report_reason">;
export type ModerationActionKind = Enums<"moderation_action_kind">;
export type AppRole = Enums<"app_role">;

/** One photo on a post card (`post_cards.media`). */
export interface PostMediaItem {
  path: string;
  width: number;
  height: number;
  blurhash: string | null;
  position: number;
}

/** A `post_cards` row as returned inside `get_feed` items (view columns are never null there). */
export interface PostCard {
  id: string;
  author_id: string;
  author_handle: string;
  author_display_name: string;
  author_avatar_path: string | null;
  author_is_team: boolean;
  kind: PostKind;
  recipe_ref: string | null;
  title: string;
  body: string;
  rating: number | null;
  visibility: PostVisibility;
  status: ContentStatus;
  parent_post_id: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  liked_by_me: boolean;
  saved_by_me: boolean;
  media: PostMediaItem[];
}

/** `get_feed` result. */
export interface FeedPage {
  items: PostCard[];
  next_cursor: string | null;
}

/** `my_account_status` / `set_birth_year` result. */
export interface AccountStatus {
  user_id: string;
  handle: string;
  has_birth_year: boolean;
  age_years: number | null;
  is_adult: boolean;
  is_underage: boolean;
  suspended_until: string | null;
  roles: AppRole[];
}

/** A document as sent to `sync_push`. */
export interface SyncDocument {
  collection: string;
  doc_id: string;
  data: { [key: string]: Json | undefined };
  updated_at: string;
  device_id: string;
  deleted_at?: string | null;
}

/** A document as stored on the server (`sync_pull` items, stale-write rejections). */
export interface StoredSyncDocument {
  collection: string;
  doc_id: string;
  data: { [key: string]: Json | undefined };
  updated_at: string;
  device_id: string;
  deleted_at: string | null;
  revision: number;
}

export interface SyncPushResult {
  applied: { collection: string; doc_id: string; revision: number }[];
  rejected: {
    collection: string;
    doc_id: string;
    reason: "stale" | "conflict" | "future_timestamp";
    server: Omit<StoredSyncDocument, "collection" | "doc_id"> | null;
  }[];
}

export interface SyncPullResult {
  documents: StoredSyncDocument[];
  cursor: number;
  has_more: boolean;
  /**
   * True when deletions newer than `p_since` were compacted away. No documents come back: pull
   * again from 0 (with `p_full: true` on every later page) and drop every synced local document
   * that the full pull does not return. Never true for a pull with `p_full: true`.
   */
  resync: boolean;
}

export interface EarnedBadge {
  badge_id: string;
  awarded_at: string;
}

/** `my_stats` result. */
export interface MyStats {
  cooked_count: number;
  cooked_this_week: number;
  current_streak: number;
  longest_streak: number;
  last_cooked_at: string | null;
  cuisine_count: number;
  cuisines: { cuisine: string; count: number }[];
  post_count: number;
  likes_received: number;
  badges: EarnedBadge[];
}

/** `record_cook_event` result. */
export interface CookEventResult {
  event_id: string;
  new_badges: string[];
  stats: MyStats;
}

/** `get_profile_summary` result. */
export interface ProfileSummary {
  id: string;
  handle: string;
  display_name: string;
  avatar_path: string | null;
  bio: string;
  cuisines: string[];
  is_team: boolean;
  created_at: string;
  post_count: number;
  likes_received: number;
  follower_count: number;
  following_count: number;
  badges: EarnedBadge[];
  is_self: boolean;
  is_following: boolean;
  follows_me: boolean;
  is_friend: boolean;
  blocked_by_me: boolean;
}

/** `create_friend_invite` result. */
export interface FriendInvite {
  code: string;
  expires_at: string;
}

/** `redeem_friend_invite` result. */
export interface RedeemedInvite {
  inviter_id: string;
  inviter_handle: string;
}

/** `toggle_like` result. */
export interface LikeState {
  liked: boolean;
  like_count: number;
}

/** `toggle_save` result. */
export interface SaveState {
  saved: boolean;
}

/** `confirm_dish` result. */
export interface DishConfirmationTally {
  place_id: string;
  dish_key: string;
  yes_count: number;
  no_count: number;
  my_answer: boolean;
}

/** `delete_comment` result. `kept_for_replies`: the comment was blanked to keep its replies. */
export interface CommentDeletion {
  deleted: true;
  kept_for_replies: boolean;
}

/** `delete_my_account` result. */
export interface AccountDeletion {
  deleted: true;
  storage_objects_queued: number;
}

/** `data` of a `moderation` notification. */
export interface ModerationNotice {
  action_id: string;
  action: ModerationActionKind;
  target_kind: ReportTarget;
  target_id: string;
  reason: string;
  automated: boolean;
  suspended_until: string | null;
  appealable: boolean;
}

/** One entry of `moderation_queue().items`. */
export interface ModerationQueueItem {
  target_kind: ReportTarget;
  target_id: string;
  target_owner_id: string | null;
  owner_handle: string | null;
  report_count: number;
  automated_count: number;
  first_reported_at: string;
  last_reported_at: string;
  reports: {
    report_id: string;
    reason: ReportReason;
    details: string;
    reporter_id: string | null;
    automated: boolean;
    created_at: string;
  }[];
  target: { [key: string]: Json | undefined } | null;
  previous_actions: {
    action: ModerationActionKind;
    reason: string;
    created_at: string;
    automated: boolean;
  }[];
}

/** `moderation_queue` result. Pass `next_cursor` back as `p_cursor` for the next page. */
export interface ModerationQueuePage {
  items: ModerationQueueItem[];
  next_cursor: string | null;
}

/** One row of `my_moderation_decisions()`: what was decided about your content, not by whom. */
export type ModerationDecision =
  Database["public"]["Functions"]["my_moderation_decisions"]["Returns"][number];

/** One row of `my_reports()`: a report you filed and where it stands, not who handled it. */
export type MyReport = Database["public"]["Functions"]["my_reports"]["Returns"][number];

/** `data` of an `appeal_decision` notification. */
export interface AppealDecisionNotice {
  appeal_id: string;
  action_id: string;
  outcome: "upheld" | "reversed";
  note: string | null;
  /** False when a newer decision on the same content or account still applies. */
  state_restored: boolean;
}

/** Machine codes raised by Famara RPCs (the PostgREST error `message`). */
export type RpcErrorCode =
  | "not_authenticated"
  | "age_gate_required"
  | "underage"
  | "suspended"
  | "profile_missing"
  | "forbidden"
  | "rate_limited"
  | "invalid_input"
  | "invalid_cursor"
  | "invalid_birth_year"
  | "birth_year_locked"
  | "invalid_target"
  | "user_not_found"
  | "post_not_found"
  | "comment_not_found"
  | "handle_reserved"
  | "target_not_found"
  | "parent_not_found"
  | "invalid_title"
  | "invalid_body"
  | "invalid_rating"
  | "invalid_media"
  | "media_not_uploaded"
  | "media_in_use"
  | "media_unavailable"
  | "recipe_required"
  | "reply_depth_exceeded"
  | "invalid_parent_comment"
  | "invite_not_found"
  | "invite_used"
  | "invalid_document"
  | "too_many_documents"
  | "document_too_large"
  | "sync_quota"
  | "invalid_details"
  | "invalid_message"
  | "invalid_reason"
  | "invalid_action"
  | "invalid_suspension"
  | "invalid_outcome"
  | "invalid_note"
  | "not_appealable"
  | "appeal_window_closed"
  | "already_appealed"
  | "action_not_found"
  | "appeal_not_found"
  | "appeal_decided"
  | "invalid_recipe"
  | "invalid_cuisine"
  | "invalid_cooked_at"
  | "invalid_local_date"
  | "invalid_feature"
  | "invalid_limit"
  | "invalid_window"
  | "invalid_place"
  | "invalid_dish";
