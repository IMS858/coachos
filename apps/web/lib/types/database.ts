/**
 * Database types — manually maintained until you run:
 *
 *   pnpm dlx supabase gen types typescript \
 *     --project-id YOUR_PROJECT_ID --schema public \
 *     > apps/web/lib/types/database.ts
 *
 * Updated for migrations 0001-0007.
 */

export type Json =
  | string | number | boolean | null
  | { [key: string]: Json | undefined } | Json[];

export type UserRole = "owner" | "trainer" | "client";

export type ClientStatus =
  | "lead" | "assessment_booked" | "assessment_completed"
  | "active" | "paused" | "churned";

export type SessionStatus =
  | "scheduled" | "confirmed" | "completed"
  | "no_show" | "cancelled" | "late_cancelled";

export type ServiceType = "training" | "massage" | "pilates" | "recovery" | "body_comp";

export type PlanKind = "subscription" | "package";

export type PlanTier =
  | "essentials_2x" | "standard_3x" | "premium_4x"
  | "recovery_monthly" | "custom"
  | "package_6" | "package_12" | "package_24" | "package_custom";

export type BillingType = "membership" | "package" | "unset";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          role: UserRole;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string; email: string; full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      clients: {
        Row: {
          id: string;
          status: ClientStatus;
          billing_type: BillingType;
          primary_trainer_id: string | null;
          joined_at: string | null;
          last_session_at: string | null;
          stripe_customer_id: string | null;
          notes_internal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["clients"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["clients"]["Row"]>;
      };
      plans: {
        Row: {
          id: string;
          client_id: string;
          kind: PlanKind;
          tier: PlanTier;
          service_type: ServiceType | null;
          custom_label: string | null;
          status: string;
          current_session_number: number | null;
          total_sessions: number | null;
          sessions_used: number | null;
          monthly_rate_cents: number | null;
          sessions_per_week: number | null;
          package_total_cents: number | null;
          start_date: string;
          end_date: string | null;
          expires_at: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["plans"]["Row"]> & {
          client_id: string; kind: PlanKind; tier: PlanTier;
        };
        Update: Partial<Database["public"]["Tables"]["plans"]["Row"]>;
      };
      sessions: {
        Row: {
          id: string;
          client_id: string;
          trainer_id: string | null;
          scheduled_at: string;
          duration_minutes: number;
          session_type: string;
          service_type: ServiceType | null;
          status: SessionStatus;
          plan_id: string | null;
          notes_pre: string | null;
          notes_post: string | null;
          completed_at: string | null;
          completed_by: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancellation_reason: string | null;
          late_cancel_fee_charged: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sessions"]["Row"]> & {
          client_id: string; scheduled_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Row"]>;
      };
      // Other tables — loose typing until generated
      [key: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: {
      client_billing_summary: {
        Row: {
          client_id: string;
          full_name: string;
          email: string;
          phone: string | null;
          status: ClientStatus;
          billing_type: BillingType;
          primary_trainer_id: string | null;
          last_session_at: string | null;
          active_plans_count: number;
          active_subscriptions_count: number;
          active_packages_count: number;
          total_monthly_cents: number;
          primary_plan_label: string | null;
        };
      };
    };
    Functions: {
      increment_session_counter: {
        Args: { p_client_id: string; p_service_type: ServiceType };
        Returns: {
          plan_id: string | null;
          incremented: boolean;
          session_number?: number;
          reason?: string;
        };
      };
      decrement_session_counter: {
        Args: { p_plan_id: string };
        Returns: { plan_id: string; session_number: number };
      };
    };
    Enums: {
      user_role: UserRole;
      client_status: ClientStatus;
      session_status: SessionStatus;
      service_type: ServiceType;
      plan_kind: PlanKind;
      plan_tier: PlanTier;
      billing_type: BillingType;
    };
  };
}
