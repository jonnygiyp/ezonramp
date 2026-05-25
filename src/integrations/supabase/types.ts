export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      coinbase_transactions: {
        Row: {
          asset: string | null
          created_at: string
          crypto_currency: string | null
          crypto_value: number | null
          failure_reason_code: string | null
          failure_reason_raw: string | null
          fiat_currency: string | null
          fiat_value: number | null
          id: string
          intermediate_statuses: Json | null
          last_synced_at: string
          network: string | null
          partner_user_ref: string | null
          payload: Json | null
          source: string | null
          status: string
          transaction_id: string
          tx_created_at: string | null
          tx_updated_at: string | null
          updated_at: string
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          asset?: string | null
          created_at?: string
          crypto_currency?: string | null
          crypto_value?: number | null
          failure_reason_code?: string | null
          failure_reason_raw?: string | null
          fiat_currency?: string | null
          fiat_value?: number | null
          id?: string
          intermediate_statuses?: Json | null
          last_synced_at?: string
          network?: string | null
          partner_user_ref?: string | null
          payload?: Json | null
          source?: string | null
          status?: string
          transaction_id: string
          tx_created_at?: string | null
          tx_updated_at?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          asset?: string | null
          created_at?: string
          crypto_currency?: string | null
          crypto_value?: number | null
          failure_reason_code?: string | null
          failure_reason_raw?: string | null
          fiat_currency?: string | null
          fiat_value?: number | null
          id?: string
          intermediate_statuses?: Json | null
          last_synced_at?: string
          network?: string | null
          partner_user_ref?: string | null
          payload?: Json | null
          source?: string | null
          status?: string
          transaction_id?: string
          tx_created_at?: string | null
          tx_updated_at?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      inbound_tracking_attributions: {
        Row: {
          campaign_id: string
          chain: string | null
          created_at: string
          crypto_amount: number | null
          crypto_currency: string | null
          fiat_amount: number | null
          fiat_currency: string | null
          id: string
          onramp_provider: string
          purchase_status: string | null
          session_id: string | null
          tracking_code: string
          transaction_id: string
          updated_at: string
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          campaign_id: string
          chain?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string | null
          fiat_amount?: number | null
          fiat_currency?: string | null
          id?: string
          onramp_provider: string
          purchase_status?: string | null
          session_id?: string | null
          tracking_code: string
          transaction_id: string
          updated_at?: string
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          campaign_id?: string
          chain?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string | null
          fiat_amount?: number | null
          fiat_currency?: string | null
          id?: string
          onramp_provider?: string
          purchase_status?: string | null
          session_id?: string | null
          tracking_code?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_tracking_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inbound_campaign_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_tracking_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inbound_tracking_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_tracking_attributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inbound_tracking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_tracking_campaigns: {
        Row: {
          campaign_name: string
          created_at: string
          created_by: string | null
          destination_path: string
          id: string
          is_active: boolean
          notes: string | null
          tracking_code: string
          updated_at: string
        }
        Insert: {
          campaign_name: string
          created_at?: string
          created_by?: string | null
          destination_path?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tracking_code: string
          updated_at?: string
        }
        Update: {
          campaign_name?: string
          created_at?: string
          created_by?: string | null
          destination_path?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tracking_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_tracking_events: {
        Row: {
          campaign_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["inbound_event_type"]
          id: string
          metadata: Json | null
          session_id: string
          tracking_code: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["inbound_event_type"]
          id?: string
          metadata?: Json | null
          session_id: string
          tracking_code: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["inbound_event_type"]
          id?: string
          metadata?: Json | null
          session_id?: string
          tracking_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_tracking_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inbound_campaign_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_tracking_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inbound_tracking_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_tracking_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inbound_tracking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_tracking_sessions: {
        Row: {
          campaign_id: string
          country: string | null
          created_at: string
          first_seen_at: string
          full_landing_url: string | null
          id: string
          landing_path: string | null
          last_seen_at: string
          referrer_url: string | null
          session_duration_seconds: number
          sign_in_at: string | null
          signed_in_user_id: string | null
          tracking_code: string
          updated_at: string
          user_agent: string | null
          wallet_address: string | null
        }
        Insert: {
          campaign_id: string
          country?: string | null
          created_at?: string
          first_seen_at?: string
          full_landing_url?: string | null
          id?: string
          landing_path?: string | null
          last_seen_at?: string
          referrer_url?: string | null
          session_duration_seconds?: number
          sign_in_at?: string | null
          signed_in_user_id?: string | null
          tracking_code: string
          updated_at?: string
          user_agent?: string | null
          wallet_address?: string | null
        }
        Update: {
          campaign_id?: string
          country?: string | null
          created_at?: string
          first_seen_at?: string
          full_landing_url?: string | null
          id?: string
          landing_path?: string | null
          last_seen_at?: string
          referrer_url?: string | null
          session_duration_seconds?: number
          sign_in_at?: string | null
          signed_in_user_id?: string | null
          tracking_code?: string
          updated_at?: string
          user_agent?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_tracking_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inbound_campaign_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_tracking_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "inbound_tracking_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      onramp_providers: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          enabled: boolean
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          enabled?: boolean
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          enabled?: boolean
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          wallet_address: string | null
          wallet_network: string | null
        }
        Insert: {
          created_at?: string
          id: string
          updated_at?: string
          wallet_address?: string | null
          wallet_network?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          wallet_address?: string | null
          wallet_network?: string | null
        }
        Relationships: []
      }
      purchase_attempts: {
        Row: {
          amount: number
          coinbase_transaction_id: string | null
          completed_at: string | null
          created_at: string
          crypto_currency: string
          currency: string
          failure_detected_at: string | null
          failure_reason_code: string | null
          failure_reason_raw: string | null
          id: string
          last_sdk_callback_at: string | null
          lifecycle_state: string | null
          network: string
          partner_user_ref: string
          popup_closed_at: string | null
          popup_opened_at: string | null
          provider: string
          source: string | null
          status: string
          status_source: string | null
          updated_at: string
          user_id: string
          visibility_events: Json | null
          wallet_address: string
          webhook_received_at: string | null
        }
        Insert: {
          amount?: number
          coinbase_transaction_id?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_currency?: string
          currency?: string
          failure_detected_at?: string | null
          failure_reason_code?: string | null
          failure_reason_raw?: string | null
          id?: string
          last_sdk_callback_at?: string | null
          lifecycle_state?: string | null
          network?: string
          partner_user_ref: string
          popup_closed_at?: string | null
          popup_opened_at?: string | null
          provider?: string
          source?: string | null
          status?: string
          status_source?: string | null
          updated_at?: string
          user_id: string
          visibility_events?: Json | null
          wallet_address: string
          webhook_received_at?: string | null
        }
        Update: {
          amount?: number
          coinbase_transaction_id?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_currency?: string
          currency?: string
          failure_detected_at?: string | null
          failure_reason_code?: string | null
          failure_reason_raw?: string | null
          id?: string
          last_sdk_callback_at?: string | null
          lifecycle_state?: string | null
          network?: string
          partner_user_ref?: string
          popup_closed_at?: string | null
          popup_opened_at?: string | null
          provider?: string
          source?: string | null
          status?: string
          status_source?: string | null
          updated_at?: string
          user_id?: string
          visibility_events?: Json | null
          wallet_address?: string
          webhook_received_at?: string | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: Json
          id: string
          published: boolean
          section: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          id?: string
          published?: boolean
          section: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          id?: string
          published?: boolean
          section?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stripe_onramp_sessions: {
        Row: {
          callback_data: Json | null
          created_at: string
          destination_currency: string | null
          destination_network: string | null
          id: string
          last_stripe_event_id: string | null
          source: string | null
          source_amount: number | null
          status: string
          stripe_session_id: string
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          callback_data?: Json | null
          created_at?: string
          destination_currency?: string | null
          destination_network?: string | null
          id?: string
          last_stripe_event_id?: string | null
          source?: string | null
          source_amount?: number | null
          status?: string
          stripe_session_id: string
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          callback_data?: Json | null
          created_at?: string
          destination_currency?: string | null
          destination_network?: string | null
          id?: string
          last_stripe_event_id?: string | null
          source?: string | null
          source_amount?: number | null
          status?: string
          stripe_session_id?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_type: string
          id: string
          livemode: boolean
          payload: Json | null
          processed_at: string
          stripe_event_id: string
        }
        Insert: {
          event_type: string
          id?: string
          livemode?: boolean
          payload?: Json | null
          processed_at?: string
          stripe_event_id: string
        }
        Update: {
          event_type?: string
          id?: string
          livemode?: boolean
          payload?: Json | null
          processed_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      transaction_audit_log: {
        Row: {
          amount: number
          callback_data: Json | null
          client_ip_hash: string | null
          created_at: string
          crypto_currency: string
          currency: string
          email_hash: string | null
          error_message: string | null
          id: string
          payment_url: string | null
          provider: string
          request_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          updated_at: string
          wallet_address: string
        }
        Insert: {
          amount: number
          callback_data?: Json | null
          client_ip_hash?: string | null
          created_at?: string
          crypto_currency?: string
          currency?: string
          email_hash?: string | null
          error_message?: string | null
          id?: string
          payment_url?: string | null
          provider: string
          request_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          updated_at?: string
          wallet_address: string
        }
        Update: {
          amount?: number
          callback_data?: Json | null
          client_ip_hash?: string | null
          created_at?: string
          crypto_currency?: string
          currency?: string
          email_hash?: string | null
          error_message?: string | null
          id?: string
          payment_url?: string | null
          provider?: string
          request_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      inbound_campaign_stats: {
        Row: {
          campaign_name: string | null
          created_at: string | null
          destination_path: string | null
          id: string | null
          is_active: boolean | null
          purchase_rate: number | null
          purchases: number | null
          sign_in_rate: number | null
          sign_ins: number | null
          tracking_code: string | null
          visits: number | null
          volume: number | null
          wallets: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_public_onramp_providers: {
        Args: never
        Returns: {
          display_name: string
          enabled: boolean
          id: string
          name: string
          sort_order: number
        }[]
      }
      get_public_site_content: {
        Args: never
        Returns: {
          content: Json
          id: string
          section: string
          updated_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      validate_tracking_code: {
        Args: { _code: string }
        Returns: {
          campaign_id: string
          destination_path: string
          is_active: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      inbound_event_type:
        | "landing"
        | "page_view"
        | "sign_in"
        | "wallet_connected"
        | "onramp_started"
        | "purchase_completed"
        | "purchase_failed"
        | "session_heartbeat"
      transaction_status: "pending" | "success" | "failed" | "callback_received"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      inbound_event_type: [
        "landing",
        "page_view",
        "sign_in",
        "wallet_connected",
        "onramp_started",
        "purchase_completed",
        "purchase_failed",
        "session_heartbeat",
      ],
      transaction_status: ["pending", "success", "failed", "callback_received"],
    },
  },
} as const
