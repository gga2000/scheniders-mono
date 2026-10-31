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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          consent_at: string | null
          consent_text_version: string | null
          created_at: string
          governorate: string | null
          id: string
          items: Json
          locale: string | null
          phone: string
          recovered_at: string | null
          recovery_kind: string | null
          reminded_at: string | null
          subtotal_iqd: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          consent_text_version?: string | null
          created_at?: string
          governorate?: string | null
          id?: string
          items?: Json
          locale?: string | null
          phone: string
          recovered_at?: string | null
          recovery_kind?: never
          reminded_at?: string | null
          subtotal_iqd?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          consent_text_version?: string | null
          created_at?: string
          governorate?: string | null
          id?: string
          items?: Json
          locale?: string | null
          phone?: string
          recovered_at?: string | null
          recovery_kind?: never
          reminded_at?: string | null
          subtotal_iqd?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      access_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_link_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          provider: string
          target_user_id: string
          tenant_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          provider?: string
          target_user_id: string
          tenant_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          provider?: string
          target_user_id?: string
          tenant_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_link_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_link_tokens_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_link_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          tenant_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          admin_label: string | null
          admin_user_id: string | null
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          admin_label?: string | null
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          admin_label?: string | null
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_commission_config: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["commission_type"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: Database["public"]["Enums"]["commission_type"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["commission_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_commission_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_employee_achievements: {
        Row: {
          achievement_key: string
          admin_user_id: string
          id: string
          metadata: Json
          unlocked_at: string
        }
        Insert: {
          achievement_key: string
          admin_user_id: string
          id?: string
          metadata?: Json
          unlocked_at?: string
        }
        Update: {
          achievement_key?: string
          admin_user_id?: string
          id?: string
          metadata?: Json
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_employee_achievements_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_employee_commissions: {
        Row: {
          admin_user_id: string
          amount_earned: number
          commission_config_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          notes: string | null
          order_revenue: number
          orders_count: number
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["commission_status"]
          tenant_id: string | null
        }
        Insert: {
          admin_user_id: string
          amount_earned?: number
          commission_config_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          order_revenue?: number
          orders_count?: number
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["commission_status"]
          tenant_id?: string | null
        }
        Update: {
          admin_user_id?: string
          amount_earned?: number
          commission_config_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          order_revenue?: number
          orders_count?: number
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["commission_status"]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_employee_commissions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_employee_commissions_commission_config_id_fkey"
            columns: ["commission_config_id"]
            isOneToOne: false
            referencedRelation: "admin_commission_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_employee_commissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_employee_commissions_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_employee_commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_employee_tracking: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "admin_employee_tracking_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          admin_label: string | null
          admin_user_id: string | null
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_label?: string | null
          admin_user_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_label?: string | null
          admin_user_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          admin_role: string
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string | null
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_role: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_role?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_watchlist: {
        Row: {
          admin_user_id: string
          created_at: string
          note: string | null
          tenant_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          note?: string | null
          tenant_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          note?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_watchlist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: string
          props: Json
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          props?: Json
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          props?: Json
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by_name: string
          id: string
          is_active: boolean
          is_pinned: boolean
          tenant_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by_name: string
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          tenant_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by_name?: string
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          bucket_key: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist: {
        Row: {
          added_by: string | null
          created_at: string
          notes: string | null
          phone: string
          reason: string
          tenant_id: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          notes?: string | null
          phone: string
          reason: string
          tenant_id?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          notes?: string | null
          phone?: string
          reason?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          supply_id: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          supply_id: string
          tenant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          supply_id?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          accent_color: string | null
          archived_at: string | null
          banner_url: string | null
          brand_id: string | null
          canonical_url: string | null
          created_at: string
          description: string | null
          description_ar: string | null
          description_en: string | null
          display_order: number
          icon: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          landing_page_url: string | null
          meta_description: string | null
          meta_title: string | null
          name: string
          name_ar: string | null
          name_en: string | null
          nav_variant: string
          og_image_url: string | null
          page_config: Json
          page_config_draft: Json | null
          parent_id: string | null
          published_at: string | null
          scope: string
          show_in_main_nav: boolean
          show_in_mega_menu: boolean
          show_in_mobile_drawer: boolean
          slug: string
          status: string
          tenant_id: string
          unpublish_at: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          archived_at?: string | null
          banner_url?: string | null
          brand_id?: string | null
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          landing_page_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          name_ar?: string | null
          name_en?: string | null
          nav_variant?: string
          og_image_url?: string | null
          page_config?: Json
          page_config_draft?: Json | null
          parent_id?: string | null
          published_at?: string | null
          scope?: string
          show_in_main_nav?: boolean
          show_in_mega_menu?: boolean
          show_in_mobile_drawer?: boolean
          slug: string
          status?: string
          tenant_id: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          archived_at?: string | null
          banner_url?: string | null
          brand_id?: string | null
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          landing_page_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          name_ar?: string | null
          name_en?: string | null
          nav_variant?: string
          og_image_url?: string | null
          page_config?: Json
          page_config_draft?: Json | null
          parent_id?: string | null
          published_at?: string | null
          scope?: string
          show_in_main_nav?: boolean
          show_in_mega_menu?: boolean
          show_in_mobile_drawer?: boolean
          slug?: string
          status?: string
          tenant_id?: string
          unpublish_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          is_private: boolean
          kind: string
          last_message_at: string | null
          name: string | null
          order_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_private?: boolean
          kind: string
          last_message_at?: string | null
          name?: string | null
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_private?: boolean
          kind?: string
          last_message_at?: string | null
          name?: string | null
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "chat_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "chat_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "chat_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string
          muted: boolean
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_attachments: {
        Row: {
          created_at: string
          file_name: string
          height: number | null
          id: string
          message_id: string
          mime: string | null
          size_bytes: number | null
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          file_name: string
          height?: number | null
          id?: string
          message_id: string
          mime?: string | null
          size_bytes?: number | null
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string
          height?: number | null
          id?: string
          message_id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_edits: {
        Row: {
          edited_at: string
          id: string
          message_id: string
          prev_body: string
        }
        Insert: {
          edited_at?: string
          id?: string
          message_id: string
          prev_body: string
        }
        Update: {
          edited_at?: string
          id?: string
          message_id?: string
          prev_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_mentions: {
        Row: {
          id: string
          mentioned_user_id: string
          message_id: string
        }
        Insert: {
          id?: string
          mentioned_user_id: string
          message_id: string
        }
        Update: {
          id?: string
          mentioned_user_id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_references: {
        Row: {
          id: string
          message_id: string
          ref_id: string
          ref_type: string
          snapshot: Json
        }
        Insert: {
          id?: string
          message_id: string
          ref_id: string
          ref_type: string
          snapshot?: Json
        }
        Update: {
          id?: string
          message_id?: string
          ref_id?: string
          ref_type?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_references_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          client_msg_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_system: boolean
          reply_to_id: string | null
          sender_id: string | null
          system_event: Json | null
          tenant_id: string
        }
        Insert: {
          body?: string
          client_msg_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_system?: boolean
          reply_to_id?: string | null
          sender_id?: string | null
          system_event?: Json | null
          tenant_id: string
        }
        Update: {
          body?: string
          client_msg_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_system?: boolean
          reply_to_id?: string | null
          sender_id?: string | null
          system_event?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_notification_prefs: {
        Row: {
          kind: string
          level: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          kind: string
          level?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          kind?: string
          level?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_notification_prefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pins: {
        Row: {
          conversation_id: string
          message_id: string
          pinned_at: string
          pinned_by: string | null
        }
        Insert: {
          conversation_id: string
          message_id: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Update: {
          conversation_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_pins_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_push_config: {
        Row: {
          edge_secret: string | null
          function_url: string | null
          id: number
          order_function_url: string | null
          updated_at: string
        }
        Insert: {
          edge_secret?: string | null
          function_url?: string | null
          id?: number
          order_function_url?: string | null
          updated_at?: string
        }
        Update: {
          edge_secret?: string | null
          function_url?: string | null
          id?: number
          order_function_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_user_status: {
        Row: {
          custom_emoji: string | null
          custom_text: string | null
          dnd: boolean
          expires_at: string | null
          last_seen_at: string | null
          preset: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          custom_emoji?: string | null
          custom_text?: string | null
          dnd?: boolean
          expires_at?: string | null
          last_seen_at?: string | null
          preset?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          custom_emoji?: string | null
          custom_text?: string | null
          dnd?: boolean
          expires_at?: string | null
          last_seen_at?: string | null
          preset?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_user_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_user_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_queue: {
        Row: {
          attempts: number
          checkout_id: string
          id: string
          last_error: string | null
          process_after: string
          processed_at: string | null
          queued_at: string
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          checkout_id: string
          id?: string
          last_error?: string | null
          process_after: string
          processed_at?: string | null
          queued_at?: string
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          checkout_id?: string
          id?: string
          last_error?: string | null
          process_after?: string
          processed_at?: string | null
          queued_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_ratings: {
        Row: {
          behavior_stars: number
          comment: string | null
          communication_stars: number
          created_at: string
          customer_phone: string
          dispute_reason: string | null
          disputed: boolean | null
          id: string
          is_anonymous: boolean | null
          order_id: string | null
          overall_type: string
          quick_tags: string[] | null
          rater_id: string | null
          rater_store_id: string | null
          tenant_id: string | null
          trust_stars: number
          updated_at: string | null
        }
        Insert: {
          behavior_stars: number
          comment?: string | null
          communication_stars: number
          created_at?: string
          customer_phone: string
          dispute_reason?: string | null
          disputed?: boolean | null
          id?: string
          is_anonymous?: boolean | null
          order_id?: string | null
          overall_type?: string
          quick_tags?: string[] | null
          rater_id?: string | null
          rater_store_id?: string | null
          tenant_id?: string | null
          trust_stars: number
          updated_at?: string | null
        }
        Update: {
          behavior_stars?: number
          comment?: string | null
          communication_stars?: number
          created_at?: string
          customer_phone?: string
          dispute_reason?: string | null
          disputed?: boolean | null
          id?: string
          is_anonymous?: boolean | null
          order_id?: string | null
          overall_type?: string
          quick_tags?: string[] | null
          rater_id?: string | null
          rater_store_id?: string | null
          tenant_id?: string | null
          trust_stars?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      customer_filter_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          filters: Json
          id?: string
          name: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_filter_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_links: {
        Row: {
          created_at: string
          id: string
          linked_by: string | null
          phone_a: string
          phone_b: string
          relationship_type: string
          similarity_hint: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          linked_by?: string | null
          phone_a: string
          phone_b: string
          relationship_type?: string
          similarity_hint?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          linked_by?: string | null
          phone_a?: string
          phone_b?: string
          relationship_type?: string
          similarity_hint?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      customer_metadata: {
        Row: {
          ai_summary: Json | null
          ai_summary_generated_at: string | null
          birthday: string | null
          created_at: string
          customer_phone: string
          manual_status: Database["public"]["Enums"]["customer_status"] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: Json | null
          ai_summary_generated_at?: string | null
          birthday?: string | null
          created_at?: string
          customer_phone: string
          manual_status?: Database["public"]["Enums"]["customer_status"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: Json | null
          ai_summary_generated_at?: string | null
          birthday?: string | null
          created_at?: string
          customer_phone?: string
          manual_status?: Database["public"]["Enums"]["customer_status"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_metadata_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          created_at: string
          customer_phone: string
          id: string
          note: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          customer_phone: string
          id?: string
          note: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          customer_phone?: string
          id?: string
          note?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_points: {
        Row: {
          balance: number
          phone: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          phone: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          phone?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_points_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_points_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          order_id: string | null
          phone: string
          reason: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          order_id?: string | null
          phone: string
          reason: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          order_id?: string | null
          phone?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_points_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_risk: {
        Row: {
          last_order_date: string | null
          last_updated: string
          phone: string
          reasons: string[] | null
          risk_level: string
          score: number
          stats: Json | null
          tenant_id: string | null
        }
        Insert: {
          last_order_date?: string | null
          last_updated?: string
          phone: string
          reasons?: string[] | null
          risk_level: string
          score?: number
          stats?: Json | null
          tenant_id?: string | null
        }
        Update: {
          last_order_date?: string | null
          last_updated?: string
          phone?: string
          reasons?: string[] | null
          risk_level?: string
          score?: number
          stats?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_risk_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag_assignments: {
        Row: {
          created_at: string
          customer_phone: string
          id: string
          tag_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          customer_phone: string
          id?: string
          tag_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          customer_phone?: string
          id?: string
          tag_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          color: Database["public"]["Enums"]["tag_color"]
          created_at: string
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          color?: Database["public"]["Enums"]["tag_color"]
          created_at?: string
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          color?: Database["public"]["Enums"]["tag_color"]
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_trust: {
        Row: {
          avg_basket: number | null
          cancelled_customer_count: number | null
          cancelled_merchant_count: number | null
          community_avg_rating: number | null
          community_rating_count: number | null
          delivered_count: number | null
          delivery_success_rate: number | null
          first_order_date: string | null
          last_order_date: string | null
          last_updated: string
          no_response_count: number | null
          phone: string
          preferred_city: string | null
          refund_count: number | null
          rejected_ambiguous_count: number | null
          rejected_customer_fault_count: number | null
          rejected_merchant_fault_count: number | null
          score_breakdown: Json | null
          tenant_id: string
          total_orders: number | null
          total_spent: number | null
          trust_score: number
          trust_tier: string
        }
        Insert: {
          avg_basket?: number | null
          cancelled_customer_count?: number | null
          cancelled_merchant_count?: number | null
          community_avg_rating?: number | null
          community_rating_count?: number | null
          delivered_count?: number | null
          delivery_success_rate?: number | null
          first_order_date?: string | null
          last_order_date?: string | null
          last_updated?: string
          no_response_count?: number | null
          phone: string
          preferred_city?: string | null
          refund_count?: number | null
          rejected_ambiguous_count?: number | null
          rejected_customer_fault_count?: number | null
          rejected_merchant_fault_count?: number | null
          score_breakdown?: Json | null
          tenant_id: string
          total_orders?: number | null
          total_spent?: number | null
          trust_score?: number
          trust_tier?: string
        }
        Update: {
          avg_basket?: number | null
          cancelled_customer_count?: number | null
          cancelled_merchant_count?: number | null
          community_avg_rating?: number | null
          community_rating_count?: number | null
          delivered_count?: number | null
          delivery_success_rate?: number | null
          first_order_date?: string | null
          last_order_date?: string | null
          last_updated?: string
          no_response_count?: number | null
          phone?: string
          preferred_city?: string | null
          refund_count?: number | null
          rejected_ambiguous_count?: number | null
          rejected_customer_fault_count?: number | null
          rejected_merchant_fault_count?: number | null
          score_breakdown?: Json | null
          tenant_id?: string
          total_orders?: number | null
          total_spent?: number | null
          trust_score?: number
          trust_tier?: string
        }
        Relationships: []
      }
      customer_trust_audit_log: {
        Row: {
          edited_at: string | null
          edited_by: string | null
          edited_reason: string | null
          event_date: string
          event_type: string
          id: string
          metadata: Json | null
          order_id: string | null
          original_reason: string | null
          phone: string
          reason: string | null
          score_after: number | null
          score_before: number | null
          score_change: number | null
          source: string | null
          tenant_id: string | null
        }
        Insert: {
          edited_at?: string | null
          edited_by?: string | null
          edited_reason?: string | null
          event_date?: string
          event_type: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          original_reason?: string | null
          phone: string
          reason?: string | null
          score_after?: number | null
          score_before?: number | null
          score_change?: number | null
          source?: string | null
          tenant_id?: string | null
        }
        Update: {
          edited_at?: string | null
          edited_by?: string | null
          edited_reason?: string | null
          event_date?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          original_reason?: string | null
          phone?: string
          reason?: string | null
          score_after?: number | null
          score_before?: number | null
          score_change?: number | null
          source?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      customer_voice_notes: {
        Row: {
          audio_url: string
          created_at: string
          customer_phone: string
          duration_seconds: number | null
          id: string
          recorded_by: string | null
          tenant_id: string | null
          text_note: string | null
        }
        Insert: {
          audio_url: string
          created_at?: string
          customer_phone: string
          duration_seconds?: number | null
          id?: string
          recorded_by?: string | null
          tenant_id?: string | null
          text_note?: string | null
        }
        Update: {
          audio_url?: string
          created_at?: string
          customer_phone?: string
          duration_seconds?: number | null
          id?: string
          recorded_by?: string | null
          tenant_id?: string | null
          text_note?: string | null
        }
        Relationships: []
      }
      customer_whitelist: {
        Row: {
          created_at: string
          phone: string
          reason: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          phone: string
          reason?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          phone?: string
          reason?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_whitelist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_import_items: {
        Row: {
          action: string | null
          created_at: string | null
          id: string
          import_id: string
          match_category: string
          match_details: Json | null
          new_status: string | null
          order_id: string | null
          pdf_amount: number | null
          pdf_delivery_fee: number | null
          pdf_item_count: number | null
          pdf_net_amount: number | null
          pdf_notes: string | null
          pdf_phone: string | null
          pdf_row_number: number
          pdf_shipment_number: string | null
          pdf_status: string | null
          previous_status: string | null
          tenant_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          id?: string
          import_id: string
          match_category: string
          match_details?: Json | null
          new_status?: string | null
          order_id?: string | null
          pdf_amount?: number | null
          pdf_delivery_fee?: number | null
          pdf_item_count?: number | null
          pdf_net_amount?: number | null
          pdf_notes?: string | null
          pdf_phone?: string | null
          pdf_row_number: number
          pdf_shipment_number?: string | null
          pdf_status?: string | null
          previous_status?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          id?: string
          import_id?: string
          match_category?: string
          match_details?: Json | null
          new_status?: string | null
          order_id?: string | null
          pdf_amount?: number | null
          pdf_delivery_fee?: number | null
          pdf_item_count?: number | null
          pdf_net_amount?: number | null
          pdf_notes?: string | null
          pdf_phone?: string | null
          pdf_row_number?: number
          pdf_shipment_number?: string | null
          pdf_status?: string | null
          previous_status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "delivery_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_import_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_imports: {
        Row: {
          actual_amount_received: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          failed_count: number | null
          id: string
          imported_by: string | null
          payment_date: string
          pdf_filename: string | null
          processed_count: number | null
          raw_data: Json
          receipt_number: string
          receiving_agent: string | null
          skipped_count: number | null
          status: string
          tenant_id: string | null
          total_amount: number
          total_orders: number
        }
        Insert: {
          actual_amount_received?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          imported_by?: string | null
          payment_date: string
          pdf_filename?: string | null
          processed_count?: number | null
          raw_data: Json
          receipt_number: string
          receiving_agent?: string | null
          skipped_count?: number | null
          status?: string
          tenant_id?: string | null
          total_amount: number
          total_orders: number
        }
        Update: {
          actual_amount_received?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          imported_by?: string | null
          payment_date?: string
          pdf_filename?: string | null
          processed_count?: number | null
          raw_data?: Json
          receipt_number?: string
          receiving_agent?: string | null
          skipped_count?: number | null
          status?: string
          tenant_id?: string | null
          total_amount?: number
          total_orders?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_configs: {
        Row: {
          base_monthly_salary: number
          created_at: string
          employee_id: string
          id: string
          per_order_bonus: number
          tenant_id: string | null
          updated_at: string
          use_role_defaults: boolean
        }
        Insert: {
          base_monthly_salary?: number
          created_at?: string
          employee_id: string
          id?: string
          per_order_bonus?: number
          tenant_id?: string | null
          updated_at?: string
          use_role_defaults?: boolean
        }
        Update: {
          base_monthly_salary?: number
          created_at?: string
          employee_id?: string
          id?: string
          per_order_bonus?: number
          tenant_id?: string | null
          updated_at?: string
          use_role_defaults?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_configs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          is_recurring: boolean | null
          notes: string | null
          order_id: string | null
          recurring_period: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          description?: string | null
          expense_date: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          order_id?: string | null
          recurring_period?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          order_id?: string | null
          recurring_period?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      filter_presets: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          name: string
          page: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          page?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          page?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filter_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_reminders: {
        Row: {
          created_at: string
          id: string
          is_completed: boolean | null
          note: string | null
          order_id: string
          reminder_date: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_completed?: boolean | null
          note?: string | null
          order_id: string
          reminder_date: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_completed?: boolean | null
          note?: string | null
          order_id?: string
          reminder_date?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "follow_up_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "follow_up_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "follow_up_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          avg_order_value_iqd: number | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          name_ar: string | null
          recommended_template_id: string | null
          sort_order: number
        }
        Insert: {
          avg_order_value_iqd?: number | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_ar?: string | null
          recommended_template_id?: string | null
          sort_order?: number
        }
        Update: {
          avg_order_value_iqd?: number | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_ar?: string | null
          recommended_template_id?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      inventory_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          message: string
          metadata_json: Json | null
          product_id: string | null
          snoozed_until: string | null
          tenant_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message: string
          metadata_json?: Json | null
          product_id?: string | null
          snoozed_until?: string | null
          tenant_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message?: string
          metadata_json?: Json | null
          product_id?: string | null
          snoozed_until?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_history: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity_after: number | null
          quantity_before: number | null
          quantity_change: number
          reference_id: string | null
          tenant_id: string | null
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_change: number
          reference_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_change?: number
          reference_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger: {
        Row: {
          created_at: string
          delta_open_box: number
          delta_reserved: number
          delta_stock: number
          id: string
          order_id: string | null
          product_id: string | null
          reason: string
          tenant_id: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          delta_open_box?: number
          delta_reserved?: number
          delta_stock?: number
          id?: string
          order_id?: string | null
          product_id?: string | null
          reason: string
          tenant_id?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          delta_open_box?: number
          delta_reserved?: number
          delta_stock?: number
          id?: string
          order_id?: string | null
          product_id?: string | null
          reason?: string
          tenant_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "inventory_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "inventory_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "inventory_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["lead_activity_type"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string
          metadata: Json
          title: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["lead_activity_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          title: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["lead_activity_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_competitors: {
        Row: {
          competitor_lead_id: string | null
          competitor_tenant_id: string | null
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          relationship_type: Database["public"]["Enums"]["competitor_relationship"]
        }
        Insert: {
          competitor_lead_id?: string | null
          competitor_tenant_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          relationship_type?: Database["public"]["Enums"]["competitor_relationship"]
        }
        Update: {
          competitor_lead_id?: string | null
          competitor_tenant_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          relationship_type?: Database["public"]["Enums"]["competitor_relationship"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_competitors_competitor_lead_id_fkey"
            columns: ["competitor_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_competitors_competitor_tenant_id_fkey"
            columns: ["competitor_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_competitors_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_follow_ups: {
        Row: {
          assigned_to: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          id: string
          is_completed: boolean
          lead_id: string
          scheduled_at: string
          title: string
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          lead_id: string
          scheduled_at: string
          title: string
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          lead_id?: string
          scheduled_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_follow_ups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_follow_ups_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_social_links: {
        Row: {
          created_at: string
          follower_count: number | null
          id: string
          lead_id: string
          platform: string
          url: string
          username: string | null
        }
        Insert: {
          created_at?: string
          follower_count?: number | null
          id?: string
          lead_id: string
          platform: string
          url: string
          username?: string | null
        }
        Update: {
          created_at?: string
          follower_count?: number | null
          id?: string
          lead_id?: string
          platform?: string
          url?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_social_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_at: string | null
          assigned_to: string | null
          avg_comments_count: number
          avg_like_count: number
          avg_order_count: number
          avg_view_count: number
          branches: Json
          city: string | null
          contact_via_dm: boolean
          converted_at: string | null
          converted_tenant_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          email: string | null
          estimated_daily_orders: number
          estimated_monthly_revenue: number
          follower_count: number
          governorate_code: string | null
          handle: string | null
          id: string
          industry_detail: string | null
          industry_id: string | null
          is_draft: boolean
          is_online_only: boolean
          last_contacted_at: string | null
          lead_score: number
          management_info: string | null
          management_name: string | null
          merchant_name: string
          next_follow_up_at: string | null
          normalized_name: string | null
          normalized_phone: string | null
          page_phone: string | null
          phone_numbers: Json
          platform: Database["public"]["Enums"]["lead_source_platform"]
          platform_url: string | null
          post_count: number
          priority: Database["public"]["Enums"]["lead_priority"]
          prospect_tenant_id: string | null
          score_breakdown: Json
          source_campaign: string | null
          source_medium: string | null
          source_referrer: string | null
          status: Database["public"]["Enums"]["lead_status"]
          store_built_at: string | null
          tags: string[] | null
          tier: Database["public"]["Enums"]["lead_tier"]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          avg_comments_count?: number
          avg_like_count?: number
          avg_order_count?: number
          avg_view_count?: number
          branches?: Json
          city?: string | null
          contact_via_dm?: boolean
          converted_at?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          estimated_daily_orders?: number
          estimated_monthly_revenue?: number
          follower_count?: number
          governorate_code?: string | null
          handle?: string | null
          id?: string
          industry_detail?: string | null
          industry_id?: string | null
          is_draft?: boolean
          is_online_only?: boolean
          last_contacted_at?: string | null
          lead_score?: number
          management_info?: string | null
          management_name?: string | null
          merchant_name: string
          next_follow_up_at?: string | null
          normalized_name?: string | null
          normalized_phone?: string | null
          page_phone?: string | null
          phone_numbers?: Json
          platform?: Database["public"]["Enums"]["lead_source_platform"]
          platform_url?: string | null
          post_count?: number
          priority?: Database["public"]["Enums"]["lead_priority"]
          prospect_tenant_id?: string | null
          score_breakdown?: Json
          source_campaign?: string | null
          source_medium?: string | null
          source_referrer?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          store_built_at?: string | null
          tags?: string[] | null
          tier?: Database["public"]["Enums"]["lead_tier"]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          avg_comments_count?: number
          avg_like_count?: number
          avg_order_count?: number
          avg_view_count?: number
          branches?: Json
          city?: string | null
          contact_via_dm?: boolean
          converted_at?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          estimated_daily_orders?: number
          estimated_monthly_revenue?: number
          follower_count?: number
          governorate_code?: string | null
          handle?: string | null
          id?: string
          industry_detail?: string | null
          industry_id?: string | null
          is_draft?: boolean
          is_online_only?: boolean
          last_contacted_at?: string | null
          lead_score?: number
          management_info?: string | null
          management_name?: string | null
          merchant_name?: string
          next_follow_up_at?: string | null
          normalized_name?: string | null
          normalized_phone?: string | null
          page_phone?: string | null
          phone_numbers?: Json
          platform?: Database["public"]["Enums"]["lead_source_platform"]
          platform_url?: string | null
          post_count?: number
          priority?: Database["public"]["Enums"]["lead_priority"]
          prospect_tenant_id?: string | null
          score_breakdown?: Json
          source_campaign?: string | null
          source_medium?: string | null
          source_referrer?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          store_built_at?: string | null
          tags?: string[] | null
          tier?: Database["public"]["Enums"]["lead_tier"]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_prospect_tenant_id_fkey"
            columns: ["prospect_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string | null
          content: string
          content_ar: string | null
          created_at: string
          discount_percentage: number | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          template_type: string | null
          tenant_id: string | null
          variables: string[] | null
        }
        Insert: {
          category?: string | null
          content: string
          content_ar?: string | null
          created_at?: string
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          template_type?: string | null
          tenant_id?: string | null
          variables?: string[] | null
        }
        Update: {
          category?: string | null
          content?: string
          content_ar?: string | null
          created_at?: string
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          template_type?: string | null
          tenant_id?: string | null
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          subscribed_at: string | null
          tenant_id: string
        }
        Insert: {
          email: string
          id?: string
          subscribed_at?: string | null
          tenant_id: string
        }
        Update: {
          email?: string
          id?: string
          subscribed_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          detail: string | null
          id: number
          notification_id: string | null
          status: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          detail?: string | null
          id?: number
          notification_id?: string | null
          status: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          detail?: string | null
          id?: number
          notification_id?: string | null
          status?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_feed_state: {
        Row: {
          cleared_before: string | null
          read_before: string | null
          user_id: string
        }
        Insert: {
          cleared_before?: string | null
          read_before?: string | null
          user_id: string
        }
        Update: {
          cleared_before?: string | null
          read_before?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_mutes: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_mutes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          category: string
          in_app: boolean
          push: boolean
          sound: boolean
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          in_app?: boolean
          push?: boolean
          sound?: boolean
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          in_app?: boolean
          push?: boolean
          sound?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          digest_last_sent_at: string | null
          digest_mode: string
          locale: string
          quiet_end: number
          quiet_hours_enabled: boolean
          quiet_start: number
          tenant_id: string
          time_zone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          digest_last_sent_at?: string | null
          digest_mode?: string
          locale?: string
          quiet_end?: number
          quiet_hours_enabled?: boolean
          quiet_start?: number
          tenant_id: string
          time_zone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          digest_last_sent_at?: string | null
          digest_mode?: string
          locale?: string
          quiet_end?: number
          quiet_hours_enabled?: boolean
          quiet_start?: number
          tenant_id?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_user_state: {
        Row: {
          dismissed_at: string | null
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_user_state_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_avatar: string | null
          actor_name: string | null
          audience: string
          category: string
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          group_key: string | null
          id: string
          payload: Json
          priority: string
          recipient_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          actor_avatar?: string | null
          actor_name?: string | null
          audience: string
          category: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          group_key?: string | null
          id?: string
          payload?: Json
          priority?: string
          recipient_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          actor_avatar?: string | null
          actor_name?: string | null
          audience?: string
          category?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          group_key?: string | null
          id?: string
          payload?: Json
          priority?: string
          recipient_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_deletion_log: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          deleted_by_email: string | null
          id: string
          order_count: number
          order_ids: string[]
          order_numbers: string[]
          tenant_id: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          order_count: number
          order_ids: string[]
          order_numbers?: string[]
          tenant_id: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          id?: string
          order_count?: number
          order_ids?: string[]
          order_numbers?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_deletion_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_generation_config: {
        Row: {
          enabled: boolean
          is_autonomous: boolean
          orders_weight: number
          tenant_id: string
        }
        Insert: {
          enabled?: boolean
          is_autonomous?: boolean
          orders_weight?: number
          tenant_id: string
        }
        Update: {
          enabled?: boolean
          is_autonomous?: boolean
          orders_weight?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_generation_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_merge_log: {
        Row: {
          archive_before: Json
          archive_order_id: string
          id: string
          keep_before: Json
          keep_order_id: string
          merged_at: string
          merged_by: string | null
          tenant_id: string
          undone_at: string | null
        }
        Insert: {
          archive_before: Json
          archive_order_id: string
          id?: string
          keep_before: Json
          keep_order_id: string
          merged_at?: string
          merged_by?: string | null
          tenant_id: string
          undone_at?: string | null
        }
        Update: {
          archive_before?: Json
          archive_order_id?: string
          id?: string
          keep_before?: Json
          keep_order_id?: string
          merged_at?: string
          merged_by?: string | null
          tenant_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_merge_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          order_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          order_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          order_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reasons: {
        Row: {
          aliases: string[]
          color: string | null
          created_at: string
          emoji: string | null
          id: string
          is_active: boolean
          is_system: boolean
          kind: string
          label_ar: string
          label_en: string | null
          requires_note: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind: string
          label_ar: string
          label_en?: string | null
          requires_note?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          color?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind?: string
          label_ar?: string
          label_en?: string | null
          requires_note?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_reasons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_split_log: {
        Row: {
          id: string
          original_before: Json
          original_order_id: string
          return_order_id: string
          split_at: string
          tenant_id: string
          undone_at: string | null
        }
        Insert: {
          id?: string
          original_before: Json
          original_order_id: string
          return_order_id: string
          split_at?: string
          tenant_id: string
          undone_at?: string | null
        }
        Update: {
          id?: string
          original_before?: Json
          original_order_id?: string
          return_order_id?: string
          split_at?: string
          tenant_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_split_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          notes: string | null
          order_id: string
          tenant_id: string | null
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id: string
          tenant_id?: string | null
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          tenant_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          abandoned_cart_at: string | null
          abandoned_cart_order_id: string | null
          abandoned_cart_outcome: string | null
          abandoned_cart_resolved_at: string | null
          abandoned_cart_resolved_by_name: string | null
          ad_channel: string | null
          address_details: string | null
          address_issues: string[] | null
          address_status: string | null
          assigned_at: string | null
          assigned_to: string | null
          attention_reasons: string[] | null
          attribution: Json | null
          cancelled_at: string | null
          city: string | null
          completed_at: string | null
          confirmation_dispatched_at: string | null
          contact_count: number | null
          created_at: string
          customer_name: string
          deleted_at: string | null
          delivered_at: string | null
          delivered_source: string | null
          delivery_company: string | null
          delivery_fee: number | null
          delivery_note: string | null
          delivery_order_id: string | null
          delivery_slot: string | null
          discount_amount: number | null
          governorate_code: string | null
          id: string
          idempotency_key: string | null
          internal_notes: string | null
          is_archived: boolean | null
          is_gift: boolean | null
          is_pinned: boolean | null
          is_replacement: boolean | null
          is_return: boolean | null
          is_reviewed: boolean | null
          is_shop_order: boolean | null
          is_test: boolean | null
          is_verified_customer: boolean | null
          items: Json
          last_batch_id: string | null
          last_contacted_at: string | null
          last_followup_at: string | null
          last_followup_by_avatar: string | null
          last_followup_by_name: string | null
          last_followup_type: string | null
          last_status_changed_by_avatar: string | null
          last_status_changed_by_name: string | null
          needs_attention: boolean | null
          net_profit: number | null
          notes: string | null
          order_id: string
          original_created_at: string | null
          original_order_id: string | null
          payment_status: string | null
          phone: string
          price: number
          print_count: number | null
          printed_at: string | null
          priority: string | null
          product_cost: number | null
          reason_id: string | null
          refund_status: Database["public"]["Enums"]["refund_status"]
          refunded_at: string | null
          rejection_reason: string | null
          risk_metadata: Json | null
          scheduled_date: string | null
          secondary_phone: string | null
          sequence_number: number | null
          source: string | null
          status: string
          tag_color: string | null
          tenant_id: string | null
          updated_at: string | null
          validated_governorate_code: string | null
          version: number
          waseet_company_price: number | null
          waseet_invoice_id: string | null
          waseet_merchant_price: number | null
          waseet_qr_id: string | null
          waseet_qr_link: string | null
          waseet_status_id: number | null
          waseet_status_text: string | null
          waseet_submit_started_at: string | null
          waseet_submitted_at: string | null
          whatsapp_contact_slot: string | null
          whatsapp_link: string | null
        }
        Insert: {
          abandoned_cart_at?: string | null
          abandoned_cart_order_id?: string | null
          abandoned_cart_outcome?: string | null
          abandoned_cart_resolved_at?: string | null
          abandoned_cart_resolved_by_name?: string | null
          ad_channel?: string | null
          address_details?: string | null
          address_issues?: string[] | null
          address_status?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attention_reasons?: string[] | null
          attribution?: Json | null
          cancelled_at?: string | null
          city?: string | null
          completed_at?: string | null
          confirmation_dispatched_at?: string | null
          contact_count?: number | null
          created_at?: string
          customer_name: string
          deleted_at?: string | null
          delivered_at?: string | null
          delivered_source?: string | null
          delivery_company?: string | null
          delivery_fee?: number | null
          delivery_note?: string | null
          delivery_order_id?: string | null
          delivery_slot?: string | null
          discount_amount?: number | null
          governorate_code?: string | null
          id?: string
          idempotency_key?: string | null
          internal_notes?: string | null
          is_archived?: boolean | null
          is_gift?: boolean | null
          is_pinned?: boolean | null
          is_replacement?: boolean | null
          is_return?: boolean | null
          is_reviewed?: boolean | null
          is_shop_order?: boolean | null
          is_test?: boolean | null
          is_verified_customer?: boolean | null
          items?: Json
          last_batch_id?: string | null
          last_contacted_at?: string | null
          last_followup_at?: string | null
          last_followup_by_avatar?: string | null
          last_followup_by_name?: string | null
          last_followup_type?: string | null
          last_status_changed_by_avatar?: string | null
          last_status_changed_by_name?: string | null
          needs_attention?: boolean | null
          net_profit?: number | null
          notes?: string | null
          order_id: string
          original_created_at?: string | null
          original_order_id?: string | null
          payment_status?: string | null
          phone: string
          price: number
          print_count?: number | null
          printed_at?: string | null
          priority?: string | null
          product_cost?: number | null
          reason_id?: string | null
          refund_status?: Database["public"]["Enums"]["refund_status"]
          refunded_at?: string | null
          rejection_reason?: string | null
          risk_metadata?: Json | null
          scheduled_date?: string | null
          secondary_phone?: string | null
          sequence_number?: number | null
          source?: string | null
          status?: string
          tag_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          validated_governorate_code?: string | null
          version?: number
          waseet_company_price?: number | null
          waseet_invoice_id?: string | null
          waseet_merchant_price?: number | null
          waseet_qr_id?: string | null
          waseet_qr_link?: string | null
          waseet_status_id?: number | null
          waseet_status_text?: string | null
          waseet_submit_started_at?: string | null
          waseet_submitted_at?: string | null
          whatsapp_contact_slot?: string | null
          whatsapp_link?: string | null
        }
        Update: {
          abandoned_cart_at?: string | null
          abandoned_cart_order_id?: string | null
          abandoned_cart_outcome?: string | null
          abandoned_cart_resolved_at?: string | null
          abandoned_cart_resolved_by_name?: string | null
          ad_channel?: string | null
          address_details?: string | null
          address_issues?: string[] | null
          address_status?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attention_reasons?: string[] | null
          attribution?: Json | null
          cancelled_at?: string | null
          city?: string | null
          completed_at?: string | null
          confirmation_dispatched_at?: string | null
          contact_count?: number | null
          created_at?: string
          customer_name?: string
          deleted_at?: string | null
          delivered_at?: string | null
          delivered_source?: string | null
          delivery_company?: string | null
          delivery_fee?: number | null
          delivery_note?: string | null
          delivery_order_id?: string | null
          delivery_slot?: string | null
          discount_amount?: number | null
          governorate_code?: string | null
          id?: string
          idempotency_key?: string | null
          internal_notes?: string | null
          is_archived?: boolean | null
          is_gift?: boolean | null
          is_pinned?: boolean | null
          is_replacement?: boolean | null
          is_return?: boolean | null
          is_reviewed?: boolean | null
          is_shop_order?: boolean | null
          is_test?: boolean | null
          is_verified_customer?: boolean | null
          items?: Json
          last_batch_id?: string | null
          last_contacted_at?: string | null
          last_followup_at?: string | null
          last_followup_by_avatar?: string | null
          last_followup_by_name?: string | null
          last_followup_type?: string | null
          last_status_changed_by_avatar?: string | null
          last_status_changed_by_name?: string | null
          needs_attention?: boolean | null
          net_profit?: number | null
          notes?: string | null
          order_id?: string
          original_created_at?: string | null
          original_order_id?: string | null
          payment_status?: string | null
          phone?: string
          price?: number
          print_count?: number | null
          printed_at?: string | null
          priority?: string | null
          product_cost?: number | null
          reason_id?: string | null
          refund_status?: Database["public"]["Enums"]["refund_status"]
          refunded_at?: string | null
          rejection_reason?: string | null
          risk_metadata?: Json | null
          scheduled_date?: string | null
          secondary_phone?: string | null
          sequence_number?: number | null
          source?: string | null
          status?: string
          tag_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          validated_governorate_code?: string | null
          version?: number
          waseet_company_price?: number | null
          waseet_invoice_id?: string | null
          waseet_merchant_price?: number | null
          waseet_qr_id?: string | null
          waseet_qr_link?: string | null
          waseet_status_id?: number | null
          waseet_status_text?: string | null
          waseet_submit_started_at?: string | null
          waseet_submitted_at?: string | null
          whatsapp_contact_slot?: string | null
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_abandoned_cart_order_id_fkey"
            columns: ["abandoned_cart_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "order_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          absence_days: number
          absence_deduction: number
          advances_deducted: number
          base_salary: number
          completed_orders_count: number
          created_at: string
          employee_id: string
          gross_salary: number
          id: string
          net_salary: number
          notes: string | null
          order_bonus: number
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          pdf_url: string | null
          penalties_deducted: number
          performance_bonuses_total: number
          period_end: string
          period_start: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          absence_days?: number
          absence_deduction?: number
          advances_deducted?: number
          base_salary?: number
          completed_orders_count?: number
          created_at?: string
          employee_id: string
          gross_salary?: number
          id?: string
          net_salary?: number
          notes?: string | null
          order_bonus?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          penalties_deducted?: number
          performance_bonuses_total?: number
          period_end: string
          period_start: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          absence_days?: number
          absence_deduction?: number
          advances_deducted?: number
          base_salary?: number
          completed_orders_count?: number
          created_at?: string
          employee_id?: string
          gross_salary?: number
          id?: string
          net_salary?: number
          notes?: string | null
          order_bonus?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          penalties_deducted?: number
          performance_bonuses_total?: number
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_bonuses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          is_applied: boolean
          payroll_id: string | null
          reason: string | null
          tenant_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          is_applied?: boolean
          payroll_id?: string | null
          reason?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          is_applied?: boolean
          payroll_id?: string | null
          reason?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_bonuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_bonuses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_bonuses_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_bonuses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          base_price_iqd: number
          created_at: string
          features: Json
          id: string
          max_orders_per_month: number
          max_team_members: number
          order_price_iqd: number
          overage_price_iqd: number
          plan: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
        }
        Insert: {
          base_price_iqd?: number
          created_at?: string
          features?: Json
          id?: string
          max_orders_per_month: number
          max_team_members: number
          order_price_iqd?: number
          overage_price_iqd?: number
          plan: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Update: {
          base_price_iqd?: number
          created_at?: string
          features?: Json
          id?: string
          max_orders_per_month?: number
          max_team_members?: number
          order_price_iqd?: number
          overage_price_iqd?: number
          plan?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      print_batches: {
        Row: {
          cities: string[] | null
          context_switches: number | null
          created_at: string | null
          efficiency_score: number | null
          id: string
          invoice_template: string | null
          name: string
          order_count: number | null
          order_ids: string[] | null
          pdf_url: string | null
          pick_list: Json | null
          print_type: string | null
          sequence_order: string[] | null
          strategy: string | null
          tenant_id: string | null
          total_value: number | null
        }
        Insert: {
          cities?: string[] | null
          context_switches?: number | null
          created_at?: string | null
          efficiency_score?: number | null
          id?: string
          invoice_template?: string | null
          name: string
          order_count?: number | null
          order_ids?: string[] | null
          pdf_url?: string | null
          pick_list?: Json | null
          print_type?: string | null
          sequence_order?: string[] | null
          strategy?: string | null
          tenant_id?: string | null
          total_value?: number | null
        }
        Update: {
          cities?: string[] | null
          context_switches?: number | null
          created_at?: string | null
          efficiency_score?: number | null
          id?: string
          invoice_template?: string | null
          name?: string
          order_count?: number | null
          order_ids?: string[] | null
          pdf_url?: string | null
          pick_list?: Json | null
          print_type?: string | null
          sequence_order?: string[] | null
          strategy?: string | null
          tenant_id?: string | null
          total_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "print_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_history: {
        Row: {
          batch_id: string | null
          id: string
          label_size: string | null
          order_id: string | null
          print_type: string | null
          printed_at: string | null
          printed_by: string | null
          tenant_id: string | null
        }
        Insert: {
          batch_id?: string | null
          id?: string
          label_size?: string | null
          order_id?: string | null
          print_type?: string | null
          printed_at?: string | null
          printed_by?: string | null
          tenant_id?: string | null
        }
        Update: {
          batch_id?: string | null
          id?: string
          label_size?: string | null
          order_id?: string | null
          print_type?: string | null
          printed_at?: string | null
          printed_by?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "print_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_activity_log: {
        Row: {
          action: string
          changes_json: Json | null
          created_at: string
          id: string
          product_id: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes_json?: Json | null
          created_at?: string
          id?: string
          product_id: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes_json?: Json | null
          created_at?: string
          id?: string
          product_id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_activity_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_defs: {
        Row: {
          created_at: string
          display_order: number
          group_keys: Json | null
          id: string
          is_comparable: boolean
          is_filterable: boolean
          key: string
          kind: string
          name_i18n: Json
          options: Json | null
          range_max: number | null
          range_min: number | null
          tenant_id: string
          unit_i18n: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          group_keys?: Json | null
          id?: string
          is_comparable?: boolean
          is_filterable?: boolean
          key: string
          kind: string
          name_i18n?: Json
          options?: Json | null
          range_max?: number | null
          range_min?: number | null
          tenant_id: string
          unit_i18n?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          group_keys?: Json | null
          id?: string
          is_comparable?: boolean
          is_filterable?: boolean
          key?: string
          kind?: string
          name_i18n?: Json
          options?: Json | null
          range_max?: number | null
          range_min?: number | null
          tenant_id?: string
          unit_i18n?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_defs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_def_id: string
          created_at: string
          product_id: string
          tenant_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          attribute_def_id: string
          created_at?: string
          product_id: string
          tenant_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          attribute_def_id?: string
          created_at?: string
          product_id?: string
          tenant_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_def_id_fkey"
            columns: ["attribute_def_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          batch_number: string
          cost_per_unit: number | null
          created_at: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          received_at: string | null
          status: string | null
          tenant_id: string
          variant_id: string | null
        }
        Insert: {
          batch_number: string
          cost_per_unit?: number | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          received_at?: string | null
          status?: string | null
          tenant_id: string
          variant_id?: string | null
        }
        Update: {
          batch_number?: string
          cost_per_unit?: number | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          received_at?: string | null
          status?: string | null
          tenant_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundle_items: {
        Row: {
          child_product_id: string
          created_at: string
          display_order: number
          id: string
          product_id: string
          quantity: number
          tenant_id: string | null
        }
        Insert: {
          child_product_id: string
          created_at?: string
          display_order?: number
          id?: string
          product_id: string
          quantity?: number
          tenant_id?: string | null
        }
        Update: {
          child_product_id?: string
          created_at?: string
          display_order?: number
          id?: string
          product_id?: string
          quantity?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_child_product_id_fkey"
            columns: ["child_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundle_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          featured_order: number | null
          id: string
          is_featured: boolean
          is_primary: boolean
          product_id: string
          rule_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          featured_order?: number | null
          id?: string
          is_featured?: boolean
          is_primary?: boolean
          product_id: string
          rule_id?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          featured_order?: number | null
          id?: string
          is_featured?: boolean
          is_primary?: boolean
          product_id?: string
          rule_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          product_id: string
          tenant_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          option_type: string | null
          product_id: string
          tenant_id: string | null
          values: Json
          values_metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          option_type?: string | null
          product_id: string
          tenant_id?: string | null
          values?: Json
          values_metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          option_type?: string | null
          product_id?: string
          tenant_id?: string | null
          values?: Json
          values_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_order_bumps: {
        Row: {
          bump_product_id: string
          created_at: string
          description: string | null
          discount_percentage: number
          display_order: number
          headline: string | null
          id: string
          is_active: boolean
          product_id: string
          tenant_id: string | null
        }
        Insert: {
          bump_product_id: string
          created_at?: string
          description?: string | null
          discount_percentage?: number
          display_order?: number
          headline?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          tenant_id?: string | null
        }
        Update: {
          bump_product_id?: string
          created_at?: string
          description?: string | null
          discount_percentage?: number
          display_order?: number
          headline?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_order_bumps_bump_product_id_fkey"
            columns: ["bump_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_order_bumps_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_order_bumps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_price: number
          old_price: number | null
          product_id: string
          reason: string | null
          tenant_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price: number
          old_price?: number | null
          product_id: string
          reason?: string | null
          tenant_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number
          old_price?: number | null
          product_id?: string
          reason?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_related: {
        Row: {
          created_at: string
          display_order: number
          id: string
          product_id: string
          related_product_id: string
          relation_type: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          product_id: string
          related_product_id: string
          relation_type?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          product_id?: string
          related_product_id?: string
          relation_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_related_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_related_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_related_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          author_name: string | null
          body: string | null
          created_at: string
          id: string
          photo_urls: string[]
          product_id: string
          rating: number
          status: string
          tenant_id: string
          title: string | null
        }
        Insert: {
          author_name?: string | null
          body?: string | null
          created_at?: string
          id?: string
          photo_urls?: string[]
          product_id: string
          rating: number
          status?: string
          tenant_id: string
          title?: string | null
        }
        Update: {
          author_name?: string | null
          body?: string | null
          created_at?: string
          id?: string
          photo_urls?: string[]
          product_id?: string
          rating?: number
          status?: string
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_storage: {
        Row: {
          id: string
          location_id: string
          product_id: string
          quantity: number
          tenant_id: string
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          id?: string
          location_id: string
          product_id: string
          quantity?: number
          tenant_id: string
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          id?: string
          location_id?: string
          product_id?: string
          quantity?: number
          tenant_id?: string
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_storage_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_storage_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_storage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_storage_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suppliers: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          lead_time_days: number | null
          minimum_order_quantity: number | null
          notes: string | null
          product_id: string
          supplier_contact: string | null
          supplier_email: string | null
          supplier_name: string
          tenant_id: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          notes?: string | null
          product_id: string
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name: string
          tenant_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          notes?: string | null
          product_id?: string
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string
          tenant_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tag_assignments: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tag_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tiered_pricing: {
        Row: {
          created_at: string
          id: string
          max_quantity: number | null
          min_quantity: number
          price: number
          product_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity: number
          price: number
          product_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          price?: number
          product_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_tiered_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tiered_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          cost: number | null
          created_at: string
          dimensions_json: Json | null
          display_order: number | null
          id: string
          image_url: string | null
          is_enabled: boolean | null
          low_stock_threshold: number | null
          name: string
          open_box_quantity: number
          option_values: Json | null
          price: number | null
          product_id: string
          reserved_quantity: number | null
          sku: string | null
          stock_quantity: number | null
          tenant_id: string | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          dimensions_json?: Json | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean | null
          low_stock_threshold?: number | null
          name: string
          open_box_quantity?: number
          option_values?: Json | null
          price?: number | null
          product_id: string
          reserved_quantity?: number | null
          sku?: string | null
          stock_quantity?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          dimensions_json?: Json | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean | null
          low_stock_threshold?: number | null
          name?: string
          open_box_quantity?: number
          option_values?: Json | null
          price?: number | null
          product_id?: string
          reserved_quantity?: number | null
          sku?: string | null
          stock_quantity?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          bestseller_rank: number | null
          booking_enabled: boolean
          brand: string | null
          category_id: string | null
          compare_at_price: number | null
          cost: number | null
          cost_breakdown_json: Json | null
          created_at: string
          description: string | null
          dimensions_json: Json | null
          display_name: string | null
          display_order: number
          download_url: string | null
          duration_minutes: number | null
          feature_cards: Json
          gender: string | null
          file_size: string | null
          gallery_urls: Json
          id: string
          image_url: string | null
          is_archived: boolean | null
          is_filler: boolean
          is_supply: boolean
          is_visible: boolean
          license_key_pattern: string | null
          lightfunnels_aliases: string[] | null
          low_stock_threshold: number | null
          name: string
          open_box_quantity: number
          price: number
          product_type: string
          reorder_point: number | null
          reserved_quantity: number
          short_description: string | null
          short_name: string | null
          size_ml: number | null
          sku: string | null
          slug: string | null
          status: string
          stock_quantity: number | null
          tag_color: string | null
          tenant_id: string | null
          updated_at: string | null
          website_price: number | null
          weight: number | null
        }
        Insert: {
          barcode?: string | null
          bestseller_rank?: number | null
          booking_enabled?: boolean
          brand?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          cost?: number | null
          cost_breakdown_json?: Json | null
          created_at?: string
          description?: string | null
          dimensions_json?: Json | null
          display_name?: string | null
          display_order?: number
          download_url?: string | null
          duration_minutes?: number | null
          feature_cards?: Json
          gender?: string | null
          file_size?: string | null
          gallery_urls?: Json
          id?: string
          image_url?: string | null
          is_archived?: boolean | null
          is_filler?: boolean
          is_supply?: boolean
          is_visible?: boolean
          license_key_pattern?: string | null
          lightfunnels_aliases?: string[] | null
          low_stock_threshold?: number | null
          name: string
          open_box_quantity?: number
          price?: number
          product_type?: string
          reorder_point?: number | null
          reserved_quantity?: number
          short_description?: string | null
          short_name?: string | null
          size_ml?: number | null
          sku?: string | null
          slug?: string | null
          status?: string
          stock_quantity?: number | null
          tag_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          website_price?: number | null
          weight?: number | null
        }
        Update: {
          barcode?: string | null
          bestseller_rank?: number | null
          booking_enabled?: boolean
          brand?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          cost?: number | null
          cost_breakdown_json?: Json | null
          created_at?: string
          description?: string | null
          dimensions_json?: Json | null
          display_name?: string | null
          display_order?: number
          download_url?: string | null
          duration_minutes?: number | null
          feature_cards?: Json
          gender?: string | null
          file_size?: string | null
          gallery_urls?: Json
          id?: string
          image_url?: string | null
          is_archived?: boolean | null
          is_filler?: boolean
          is_supply?: boolean
          is_visible?: boolean
          license_key_pattern?: string | null
          lightfunnels_aliases?: string[] | null
          low_stock_threshold?: number | null
          name?: string
          open_box_quantity?: number
          price?: number
          product_type?: string
          reorder_point?: number | null
          reserved_quantity?: number
          short_description?: string | null
          short_name?: string | null
          size_ml?: number | null
          sku?: string | null
          slug?: string | null
          status?: string
          stock_quantity?: number | null
          tag_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          website_price?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          po_id: string
          product_id: string
          product_name: string
          quantity_ordered: number
          quantity_received: number | null
          sku: string | null
          unit_cost: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          po_id: string
          product_id: string
          product_name: string
          quantity_ordered: number
          quantity_received?: number | null
          sku?: string | null
          unit_cost?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          po_id?: string
          product_id?: string
          product_name?: string
          quantity_ordered?: number
          quantity_received?: number | null
          sku?: string | null
          unit_cost?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          expected_date: string | null
          id: string
          notes: string | null
          po_number: string
          received_at: string | null
          sent_at: string | null
          status: string
          supplier_contact: string | null
          supplier_email: string | null
          supplier_name: string
          tenant_id: string
          total_cost: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          po_number: string
          received_at?: string | null
          sent_at?: string | null
          status?: string
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name: string
          tenant_id: string
          total_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          po_number?: string
          received_at?: string | null
          sent_at?: string | null
          status?: string
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string
          tenant_id?: string
          total_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_quarantine: {
        Row: {
          assigned_to: string | null
          created_at: string
          credit_expected: number | null
          id: string
          inspection_checklist: Json | null
          notes: string | null
          order_id: string | null
          photos: Json
          product_id: string | null
          quantity: number
          reason: string
          reason_category: string | null
          resolved_at: string | null
          resolved_by: string | null
          rma_number: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          credit_expected?: number | null
          id?: string
          inspection_checklist?: Json | null
          notes?: string | null
          order_id?: string | null
          photos?: Json
          product_id?: string | null
          quantity: number
          reason: string
          reason_category?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rma_number?: string | null
          status: string
          tenant_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          credit_expected?: number | null
          id?: string
          inspection_checklist?: Json | null
          notes?: string | null
          order_id?: string | null
          photos?: Json
          product_id?: string | null
          quantity?: number
          reason?: string
          reason_category?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rma_number?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_quarantine_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "qc_quarantine_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "qc_quarantine_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_quarantine_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "qc_quarantine_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_quarantine_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_quarantine_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_quarantine_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          qc_item_id: string
          tenant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          qc_item_id: string
          tenant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          qc_item_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_quarantine_events_qc_item_id_fkey"
            columns: ["qc_item_id"]
            isOneToOne: false
            referencedRelation: "qc_quarantine"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          phone: string
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          phone: string
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          phone?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          discount_iqd: number
          id: string
          order_id: string
          referee_phone: string
          referrer_phone: string
          reversed_points: number
          rewarded_points: number
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          discount_iqd?: number
          id?: string
          order_id: string
          referee_phone: string
          referrer_phone: string
          reversed_points?: number
          rewarded_points?: number
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          discount_iqd?: number
          id?: string
          order_id?: string
          referee_phone?: string
          referrer_phone?: string
          reversed_points?: number
          rewarded_points?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "referrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "referrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "referrals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          permission?: string
          role?: string
        }
        Relationships: []
      }
      role_salary_defaults: {
        Row: {
          base_monthly_salary: number
          created_at: string
          id: string
          per_order_bonus: number
          role: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          base_monthly_salary?: number
          created_at?: string
          id?: string
          per_order_bonus?: number
          role: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          base_monthly_salary?: number
          created_at?: string
          id?: string
          per_order_bonus?: number
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_salary_defaults_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_advances: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          is_deducted: boolean
          payroll_id: string | null
          reason: string | null
          tenant_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          is_deducted?: boolean
          payroll_id?: string | null
          reason?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          is_deducted?: boolean
          payroll_id?: string | null
          reason?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_advances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_config_history: {
        Row: {
          changed_by: string | null
          created_at: string
          employee_id: string
          id: string
          new_base_salary: number | null
          new_per_order: number | null
          note: string | null
          old_base_salary: number | null
          old_per_order: number | null
          tenant_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          employee_id: string
          id?: string
          new_base_salary?: number | null
          new_per_order?: number | null
          note?: string | null
          old_base_salary?: number | null
          old_per_order?: number | null
          tenant_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          new_base_salary?: number | null
          new_per_order?: number | null
          note?: string | null
          old_base_salary?: number | null
          old_per_order?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_config_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_config_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_config_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_penalties: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          is_applied: boolean
          payroll_id: string | null
          reason: string
          tenant_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          is_applied?: boolean
          payroll_id?: string | null
          reason: string
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          is_applied?: boolean
          payroll_id?: string | null
          reason?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_penalties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_penalties_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_penalties_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_penalties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      seed_customers: {
        Row: {
          address_details: string
          city: string
          governorate_code: string
          id: number
          name: string
          phone: string
        }
        Insert: {
          address_details: string
          city: string
          governorate_code: string
          id?: number
          name: string
          phone: string
        }
        Update: {
          address_details?: string
          city?: string
          governorate_code?: string
          id?: number
          name?: string
          phone?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          tenant_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          tenant_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          tenant_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_export_log: {
        Row: {
          company: string
          created_at: string
          error_message: string | null
          exported_by: string | null
          failure_stage: string | null
          id: string
          order_count: number
          succeeded: boolean
          tenant_id: string
        }
        Insert: {
          company: string
          created_at?: string
          error_message?: string | null
          exported_by?: string | null
          failure_stage?: string | null
          id?: string
          order_count: number
          succeeded: boolean
          tenant_id: string
        }
        Update: {
          company?: string
          created_at?: string
          error_message?: string | null
          exported_by?: string | null
          failure_stage?: string | null
          id?: string
          order_count?: number
          succeeded?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_export_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_collections: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          rules_json: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rules_json: Json
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rules_json?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_take_items: {
        Row: {
          counted_at: string | null
          counted_quantity: number | null
          created_at: string | null
          expected_quantity: number
          id: string
          location_id: string | null
          product_id: string
          reason: string | null
          stock_take_id: string
          variance: number | null
          variant_id: string | null
        }
        Insert: {
          counted_at?: string | null
          counted_quantity?: number | null
          created_at?: string | null
          expected_quantity?: number
          id?: string
          location_id?: string | null
          product_id: string
          reason?: string | null
          stock_take_id: string
          variance?: number | null
          variant_id?: string | null
        }
        Update: {
          counted_at?: string | null
          counted_quantity?: number | null
          created_at?: string | null
          expected_quantity?: number
          id?: string
          location_id?: string | null
          product_id?: string
          reason?: string | null
          stock_take_id?: string
          variance?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_take_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_items_stock_take_id_fkey"
            columns: ["stock_take_id"]
            isOneToOne: false
            referencedRelation: "stock_takes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_takes: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          started_by: string | null
          status: string
          tenant_id: string
          total_counted: number | null
          total_variance: number | null
          updated_at: string | null
          variance_value: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          started_by?: string | null
          status?: string
          tenant_id: string
          total_counted?: number | null
          total_variance?: number | null
          updated_at?: string | null
          variance_value?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_by?: string | null
          status?: string
          tenant_id?: string
          total_counted?: number | null
          total_variance?: number | null
          updated_at?: string | null
          variance_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_takes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          capacity: number | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          parent_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          capacity?: number | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          tenant_id: string
          type?: string
        }
        Update: {
          capacity?: number | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_config_experiment_events: {
        Row: {
          arm_id: string
          created_at: string
          event_type: string
          experiment_id: string
          id: string
          revenue_iqd: number | null
          tenant_id: string
          visitor_key: string
        }
        Insert: {
          arm_id: string
          created_at?: string
          event_type: string
          experiment_id: string
          id?: string
          revenue_iqd?: number | null
          tenant_id: string
          visitor_key: string
        }
        Update: {
          arm_id?: string
          created_at?: string
          event_type?: string
          experiment_id?: string
          id?: string
          revenue_iqd?: number | null
          tenant_id?: string
          visitor_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_config_experiment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_config_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          label: string
          starts_at: string
          status: string
          targets: Json
          tenant_id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          label: string
          starts_at: string
          status?: string
          targets?: Json
          tenant_id: string
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          label?: string
          starts_at?: string
          status?: string
          targets?: Json
          tenant_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_config_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_config_versions: {
        Row: {
          author_name: string | null
          config: Json
          created_at: string
          created_by: string | null
          diff_summary: Json | null
          id: string
          is_named: boolean
          label: string | null
          tenant_id: string
        }
        Insert: {
          author_name?: string | null
          config: Json
          created_at?: string
          created_by?: string | null
          diff_summary?: Json | null
          id?: string
          is_named?: boolean
          label?: string | null
          tenant_id: string
        }
        Update: {
          author_name?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          diff_summary?: Json | null
          id?: string
          is_named?: boolean
          label?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_config_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_pages: {
        Row: {
          body: string | null
          created_at: string
          display_order: number
          id: string
          is_visible: boolean
          slug: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_visible?: boolean
          slug: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_visible?: boolean
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_performance_audits: {
        Row: {
          breakpoint: string
          cls: number | null
          created_at: string
          fid_ms: number | null
          font_bytes: number | null
          id: string
          image_bytes: number | null
          js_bytes: number | null
          lcp_ms: number | null
          network_profile: string
          page_id: string
          raw: Json | null
          score_a11y: number | null
          score_best_practices: number | null
          score_perf: number | null
          score_seo: number | null
          tenant_id: string
          total_bytes: number | null
          tti_ms: number | null
        }
        Insert: {
          breakpoint: string
          cls?: number | null
          created_at?: string
          fid_ms?: number | null
          font_bytes?: number | null
          id?: string
          image_bytes?: number | null
          js_bytes?: number | null
          lcp_ms?: number | null
          network_profile?: string
          page_id: string
          raw?: Json | null
          score_a11y?: number | null
          score_best_practices?: number | null
          score_perf?: number | null
          score_seo?: number | null
          tenant_id: string
          total_bytes?: number | null
          tti_ms?: number | null
        }
        Update: {
          breakpoint?: string
          cls?: number | null
          created_at?: string
          fid_ms?: number | null
          font_bytes?: number | null
          id?: string
          image_bytes?: number | null
          js_bytes?: number | null
          lcp_ms?: number | null
          network_profile?: string
          page_id?: string
          raw?: Json | null
          score_a11y?: number | null
          score_best_practices?: number | null
          score_perf?: number | null
          score_seo?: number | null
          tenant_id?: string
          total_bytes?: number | null
          tti_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "store_performance_audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_section_presets: {
        Row: {
          created_at: string
          id: string
          instance: Json
          name: string
          section_type: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance: Json
          name: string
          section_type: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance?: Json
          name?: string
          section_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_section_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_visual_baselines: {
        Row: {
          breakpoint: string
          config_version_id: string | null
          created_at: string
          id: string
          page_id: string
          screenshot_path: string
          tenant_id: string
        }
        Insert: {
          breakpoint: string
          config_version_id?: string | null
          created_at?: string
          id?: string
          page_id: string
          screenshot_path: string
          tenant_id: string
        }
        Update: {
          breakpoint?: string
          config_version_id?: string | null
          created_at?: string
          id?: string
          page_id?: string
          screenshot_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_visual_baselines_config_version_id_fkey"
            columns: ["config_version_id"]
            isOneToOne: false
            referencedRelation: "store_config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_visual_baselines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          order_id: string | null
          page_id: string | null
          product_id: string | null
          tenant_id: string
          value_iqd: number | null
          visitor_key: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: never
          order_id?: string | null
          page_id?: string | null
          product_id?: string | null
          tenant_id: string
          value_iqd?: number | null
          visitor_key: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: never
          order_id?: string | null
          page_id?: string | null
          product_id?: string | null
          tenant_id?: string
          value_iqd?: number | null
          visitor_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          cancel_at: string | null
          cancellation_feedback: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          pending_plan: Database["public"]["Enums"]["plan_tier"] | null
          plan: Database["public"]["Enums"]["plan_tier"]
          plan_change_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          cancel_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          pending_plan?: Database["public"]["Enums"]["plan_tier"] | null
          plan: Database["public"]["Enums"]["plan_tier"]
          plan_change_at?: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          cancel_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          pending_plan?: Database["public"]["Enums"]["plan_tier"] | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          plan_change_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_checks: {
        Row: {
          check_name: string
          detail: string | null
          failing_since: string | null
          observed_at: string
          status: string
        }
        Insert: {
          check_name: string
          detail?: string | null
          failing_since?: string | null
          observed_at?: string
          status: string
        }
        Update: {
          check_name?: string
          detail?: string | null
          failing_since?: string | null
          observed_at?: string
          status?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          invited_by: string | null
          role: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_employee_link: {
        Row: {
          linked_at: string
          telegram_user_id: number
          telegram_username: string | null
          tenant_id: string
          user_profile_id: string
        }
        Insert: {
          linked_at?: string
          telegram_user_id: number
          telegram_username?: string | null
          tenant_id: string
          user_profile_id: string
        }
        Update: {
          linked_at?: string
          telegram_user_id?: number
          telegram_username?: string | null
          tenant_id?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_employee_link_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_employee_link_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          tenant_id: string
          used_at: string | null
          used_by_tg_id: number | null
          user_profile_id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          tenant_id: string
          used_at?: string | null
          used_by_tg_id?: number | null
          user_profile_id: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          tenant_id?: string
          used_at?: string | null
          used_by_tg_id?: number | null
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_link_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_link_codes_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_pending_orders: {
        Row: {
          cancelled_at: string | null
          chat_id: number
          confirmed_at: string | null
          confirmed_order_id: string | null
          created_at: string
          extracted: Json
          id: number
          message_id: number
          state: string
          telegram_user_id: number
          tenant_id: string
          user_profile_id: string
        }
        Insert: {
          cancelled_at?: string | null
          chat_id: number
          confirmed_at?: string | null
          confirmed_order_id?: string | null
          created_at?: string
          extracted: Json
          id?: number
          message_id: number
          state?: string
          telegram_user_id: number
          tenant_id: string
          user_profile_id: string
        }
        Update: {
          cancelled_at?: string | null
          chat_id?: number
          confirmed_at?: string | null
          confirmed_order_id?: string | null
          created_at?: string
          extracted?: Json
          id?: number
          message_id?: number
          state?: string
          telegram_user_id?: number
          tenant_id?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_pending_orders_confirmed_order_id_fkey"
            columns: ["confirmed_order_id"]
            isOneToOne: false
            referencedRelation: "customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "telegram_pending_orders_confirmed_order_id_fkey"
            columns: ["confirmed_order_id"]
            isOneToOne: false
            referencedRelation: "mv_customer_aggregates"
            referencedColumns: ["last_order_id"]
          },
          {
            foreignKeyName: "telegram_pending_orders_confirmed_order_id_fkey"
            columns: ["confirmed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_pending_orders_confirmed_order_id_fkey"
            columns: ["confirmed_order_id"]
            isOneToOne: false
            referencedRelation: "v_order_time_to_confirm"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "telegram_pending_orders_confirmed_order_id_fkey"
            columns: ["confirmed_order_id"]
            isOneToOne: false
            referencedRelation: "v_orders_with_risk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_pending_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_pending_orders_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          tenant_id: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          tenant_id: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          tenant_id?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          connected_at: string | null
          created_at: string | null
          credentials: Json
          id: string
          is_active: boolean | null
          provider: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string | null
          credentials?: Json
          id?: string
          is_active?: boolean | null
          provider: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string | null
          credentials?: Json
          id?: string
          is_active?: boolean | null
          provider?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          id: string
          invited_at: string
          invited_by: string | null
          joined_at: string | null
          role: string
          status: Database["public"]["Enums"]["member_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string
          invited_by?: string | null
          joined_at?: string | null
          role: string
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_public_stats: {
        Row: {
          completed_orders: number
          customers: number
          first_order_at: string | null
          governorates_served: number
          refreshed_at: string
          tenant_id: string
        }
        Insert: {
          completed_orders?: number
          customers?: number
          first_order_at?: string | null
          governorates_served?: number
          refreshed_at?: string
          tenant_id: string
        }
        Update: {
          completed_orders?: number
          customers?: number
          first_order_at?: string | null
          governorates_served?: number
          refreshed_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_public_stats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_slug_history: {
        Row: {
          created_at: string
          old_slug: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          old_slug: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          old_slug?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_slug_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          branding: Json
          business_name: string
          city: string | null
          config_version: number
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          display_id: number
          id: string
          is_prospect: boolean
          metadata: Json
          plan: Database["public"]["Enums"]["plan_tier"]
          prospect_lead_id: string | null
          restrictions: Json
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          store_config: Json | null
          store_config_draft: Json | null
          store_config_rev: number
          store_config_v2: Json | null
          store_config_v2_draft: Json | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branding?: Json
          business_name: string
          city?: string | null
          config_version?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_id?: number
          id?: string
          is_prospect?: boolean
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          prospect_lead_id?: string | null
          restrictions?: Json
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          store_config?: Json | null
          store_config_draft?: Json | null
          store_config_rev?: number
          store_config_v2?: Json | null
          store_config_v2_draft?: Json | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branding?: Json
          business_name?: string
          city?: string | null
          config_version?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_id?: number
          id?: string
          is_prospect?: boolean
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          prospect_lead_id?: string | null
          restrictions?: Json
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          store_config?: Json | null
          store_config_draft?: Json | null
          store_config_rev?: number
          store_config_v2?: Json | null
          store_config_v2_draft?: Json | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_prospect_lead_id_fkey"
            columns: ["prospect_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_tracking: {
        Row: {
          id: string
          last_updated_at: string
          month: number
          orders_charged: number
          orders_count: number
          team_members_count: number
          tenant_id: string
          year: number
        }
        Insert: {
          id?: string
          last_updated_at?: string
          month: number
          orders_charged?: number
          orders_count?: number
          team_members_count?: number
          tenant_id: string
          year: number
        }
        Update: {
          id?: string
          last_updated_at?: string
          month?: number
          orders_charged?: number
          orders_count?: number
          team_members_count?: number
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          is_granted: boolean
          permission: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_granted?: boolean
          permission: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_granted?: boolean
          permission?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          current_tenant_id: string | null
          display_name: string | null
          email: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          monthly_actions_count: number | null
          role: string | null
          total_actions_count: number | null
          updated_at: string | null
          weekly_actions_count: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          current_tenant_id?: string | null
          display_name?: string | null
          email: string
          id: string
          is_active?: boolean | null
          last_login_at?: string | null
          monthly_actions_count?: number | null
          role?: string | null
          total_actions_count?: number | null
          updated_at?: string | null
          weekly_actions_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          current_tenant_id?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          monthly_actions_count?: number | null
          role?: string | null
          total_actions_count?: number | null
          updated_at?: string | null
          weekly_actions_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_current_tenant_id_fkey"
            columns: ["current_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet: {
        Row: {
          balance_iqd: number
          id: string
          tenant_id: string
          threshold_iqd: number
          total_charged_iqd: number
          total_topped_up_iqd: number
          updated_at: string
        }
        Insert: {
          balance_iqd?: number
          id?: string
          tenant_id: string
          threshold_iqd?: number
          total_charged_iqd?: number
          total_topped_up_iqd?: number
          updated_at?: string
        }
        Update: {
          balance_iqd?: number
          id?: string
          tenant_id?: string
          threshold_iqd?: number
          total_charged_iqd?: number
          total_topped_up_iqd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_iqd: number
          balance_after_iqd: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          payment_method: string | null
          reference_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          amount_iqd: number
          balance_after_iqd: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          reference_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          amount_iqd?: number
          balance_after_iqd?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          reference_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waseet_api_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          http_status: number | null
          id: string
          method: string
          order_id: string | null
          request_data: Json | null
          response_data: Json | null
          success: boolean
          tenant_id: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          method: string
          order_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          success?: boolean
          tenant_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          method?: string
          order_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          success?: boolean
          tenant_id?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waseet_api_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waseet_city_mappings: {
        Row: {
          created_at: string
          governorate_code: string
          governorate_name_ar: string
          id: string
          is_active: boolean | null
          tenant_id: string | null
          updated_at: string
          waseet_city_id: number
          waseet_city_name: string
          waseet_default_region_id: number | null
          waseet_default_region_name: string | null
        }
        Insert: {
          created_at?: string
          governorate_code: string
          governorate_name_ar: string
          id?: string
          is_active?: boolean | null
          tenant_id?: string | null
          updated_at?: string
          waseet_city_id: number
          waseet_city_name: string
          waseet_default_region_id?: number | null
          waseet_default_region_name?: string | null
        }
        Update: {
          created_at?: string
          governorate_code?: string
          governorate_name_ar?: string
          id?: string
          is_active?: boolean | null
          tenant_id?: string | null
          updated_at?: string
          waseet_city_id?: number
          waseet_city_name?: string
          waseet_default_region_id?: number | null
          waseet_default_region_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waseet_city_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_logs: {
        Row: {
          created_at: string | null
          direction: string
          id: string
          interakt_message_id: string | null
          order_id: string
          order_uuid: string | null
          payload: Json | null
          phone: string
          recipient_type: string | null
          status: string
          template_name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string
          id?: string
          interakt_message_id?: string | null
          order_id: string
          order_uuid?: string | null
          payload?: Json | null
          phone: string
          recipient_type?: string | null
          status?: string
          template_name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          id?: string
          interakt_message_id?: string | null
          order_id?: string
          order_uuid?: string | null
          payload?: Json | null
          phone?: string
          recipient_type?: string | null
          status?: string
          template_name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outreach_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          message_template: string
          name: string
          stage: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message_template: string
          name: string
          stage: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          stage?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outreach_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_aggregates: {
        Row: {
          customer_phone: string | null
          first_order_date: string | null
          last_order_date: string | null
          last_order_id: string | null
          last_order_status: string | null
          latest_address_details: string | null
          latest_city: string | null
          latest_governorate: string | null
          latest_name: string | null
          latest_secondary_phone: string | null
          tenant_id: string | null
          total_items: number | null
          total_orders: number | null
          total_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_customer_aggregates: {
        Row: {
          customer_phone: string | null
          first_order_date: string | null
          last_order_date: string | null
          last_order_id: string | null
          last_order_status: string | null
          latest_address_details: string | null
          latest_city: string | null
          latest_governorate: string | null
          latest_name: string | null
          latest_secondary_phone: string | null
          tenant_id: string | null
          total_items: number | null
          total_orders: number | null
          total_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_order_confirmations_by_agent: {
        Row: {
          agent: string | null
          day: string | null
          orders_confirmed: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_order_time_to_confirm: {
        Row: {
          confirmed_at: string | null
          created_at: string | null
          hours_to_confirm: number | null
          order_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_orders_with_risk: {
        Row: {
          abandoned_cart_at: string | null
          abandoned_cart_order_id: string | null
          abandoned_cart_outcome: string | null
          abandoned_cart_resolved_at: string | null
          abandoned_cart_resolved_by_name: string | null
          address_details: string | null
          address_issues: string[] | null
          address_status: string | null
          assigned_at: string | null
          assigned_to: string | null
          attention_reasons: string[] | null
          cancelled_at: string | null
          city: string | null
          completed_at: string | null
          contact_count: number | null
          created_at: string | null
          customer_name: string | null
          deleted_at: string | null
          delivered_at: string | null
          delivered_source: string | null
          delivery_company: string | null
          delivery_fee: number | null
          delivery_note: string | null
          delivery_order_id: string | null
          delivery_slot: string | null
          discount_amount: number | null
          governorate_code: string | null
          id: string | null
          internal_notes: string | null
          is_archived: boolean | null
          is_gift: boolean | null
          is_pinned: boolean | null
          is_replacement: boolean | null
          is_return: boolean | null
          is_reviewed: boolean | null
          is_shop_order: boolean | null
          is_test: boolean | null
          is_verified_customer: boolean | null
          items: Json | null
          last_batch_id: string | null
          last_contacted_at: string | null
          last_status_changed_by_avatar: string | null
          last_status_changed_by_name: string | null
          needs_attention: boolean | null
          net_profit: number | null
          notes: string | null
          order_id: string | null
          original_created_at: string | null
          original_order_id: string | null
          payment_status: string | null
          phone: string | null
          price: number | null
          print_count: number | null
          printed_at: string | null
          priority: string | null
          product_cost: number | null
          reason_id: string | null
          refund_status: Database["public"]["Enums"]["refund_status"] | null
          refunded_at: string | null
          rejection_reason: string | null
          risk_data: Json | null
          risk_metadata: Json | null
          scheduled_date: string | null
          secondary_phone: string | null
          sequence_number: number | null
          source: string | null
          status: string | null
          tag_color: string | null
          tenant_id: string | null
          updated_at: string | null
          validated_governorate_code: string | null
          version: number | null
          waseet_company_price: number | null
          waseet_invoice_id: string | null
          waseet_merchant_price: number | null
          waseet_qr_id: string | null
          waseet_qr_link: string | null
          waseet_status_id: number | null
          waseet_status_text: string | null
          waseet_submitted_at: string | null
          whatsapp_link: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "order_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shipping_export_outcomes: {
        Row: {
          attempts: number | null
          company: string | null
          day: string | null
          failed: number | null
          failed_producing_file: number | null
          failed_recording_batch: number | null
          orders_exported: number | null
          succeeded: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_export_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_whatsapp_delivery_rate: {
        Row: {
          day: string | null
          delivered: number | null
          failed: number | null
          last_receipt_at: string | null
          read: number | null
          sent: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_whatsapp_message_outcomes: {
        Row: {
          delivered_at: string | null
          failed_at: string | null
          message_id: string | null
          order_id: string | null
          order_uuid: string | null
          read_at: string | null
          sent_at: string | null
          template_name: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_customer_points: {
        Args: {
          _delta: number
          _order_id?: string
          _phone: string
          _reason: string
          _tenant_id: string
        }
        Returns: number
      }
      admin_topup_wallet: {
        Args: {
          _amount: number
          _created_by?: string
          _description?: string
          _payment_method?: string
          _tenant_id: string
        }
        Returns: Json
      }
      aggregate_experiment_stats: {
        Args: { p_experiment_id: string; p_tenant_id: string }
        Returns: {
          add_to_cart: number
          arm_id: string
          checkout_start: number
          orders: number
          revenue_iqd: number
          visitors: number
        }[]
      }
      apply_store_config_v2_patch: {
        Args: {
          p_is_draft: boolean
          p_path: string[]
          p_tenant_id: string
          p_value: Json
        }
        Returns: undefined
      }
      calculate_customer_trust: {
        Args: { target_phone: string }
        Returns: undefined
      }
      calculate_lead_score: { Args: { p_lead_id: string }; Returns: number }
      capture_abandoned_cart: {
        Args: {
          _consent_text_version?: string
          _governorate?: string
          _items: Json
          _locale?: string
          _phone: string
          _reopen_after_seconds: number
          _subtotal_iqd: number
          _tenant_id: string
        }
        Returns: boolean
      }
      charge_wallet_atomic: {
        Args: {
          _amount: number
          _description?: string
          _order_id?: string
          _tenant_id: string
        }
        Returns: Json
      }
      chat_add_members: {
        Args: { p_conversation_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      chat_archive_conversation: {
        Args: { p_archived?: boolean; p_conversation_id: string }
        Returns: undefined
      }
      chat_assign_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      chat_auto_archive_threads: { Args: { p_limit?: number }; Returns: number }
      chat_auto_resolve_threads: { Args: { p_limit?: number }; Returns: number }
      chat_create_channel: {
        Args: {
          p_icon?: string
          p_is_private: boolean
          p_name: string
          p_topic: string
        }
        Returns: string
      }
      chat_create_group: {
        Args: { p_name: string; p_user_ids: string[] }
        Returns: string
      }
      chat_delete_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      chat_find_or_create_dm: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      chat_find_or_create_order_conversation: {
        Args: { p_order_id: string }
        Returns: string
      }
      chat_is_conversation_admin: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      chat_is_member: { Args: { p_conversation_id: string }; Returns: boolean }
      chat_leave_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      chat_mark_all_read: { Args: never; Returns: undefined }
      chat_mark_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      chat_post_order_event: {
        Args: { p_event: Json; p_order_id: string }
        Returns: undefined
      }
      chat_remove_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      chat_rename_conversation: {
        Args: { p_conversation_id: string; p_name: string; p_topic?: string }
        Returns: undefined
      }
      chat_search_messages: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          body: string
          conversation_id: string
          conversation_kind: string
          conversation_name: string
          created_at: string
          message_id: string
          sender_id: string
          snippet: string
        }[]
      }
      chat_send_message: {
        Args: {
          p_attachments?: Json
          p_body: string
          p_client_msg_id?: string
          p_conversation_id: string
          p_mentions?: string[]
          p_references?: Json
          p_reply_to_id?: string
        }
        Returns: {
          body: string
          client_msg_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_system: boolean
          reply_to_id: string | null
          sender_id: string | null
          system_event: Json | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chat_set_conversation_icon: {
        Args: { p_conversation_id: string; p_icon: string }
        Returns: undefined
      }
      chat_set_conversation_resolved: {
        Args: { p_conversation_id: string; p_resolved: boolean }
        Returns: undefined
      }
      chat_thread_lifecycle_policy: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      chat_topic_conv_id: { Args: { p_topic: string }; Returns: string }
      chat_topic_conversation: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      chat_topic_user: { Args: { p_user_id: string }; Returns: string }
      chat_unread_counts: {
        Args: never
        Returns: {
          conversation_id: string
          unread: number
        }[]
      }
      check_notification_pipeline: { Args: never; Returns: string }
      check_order_sla: {
        Args: {
          p_hours?: number
          p_quiet_hours?: number
          p_window_hours?: number
        }
        Returns: number
      }
      clear_notification_feed: { Args: never; Returns: undefined }
      cod_risk_signals: {
        Args: { _address: string; _phone: string; _tenant_id: string }
        Returns: Json
      }
      compute_lead_predictions: {
        Args: {
          p_avg_order_count?: number
          p_avg_view_count: number
          p_industry_id: string
        }
        Returns: {
          daily_orders: number
          monthly_revenue: number
        }[]
      }
      compute_lead_tier: {
        Args: { p_follower_count: number }
        Returns: Database["public"]["Enums"]["lead_tier"]
      }
      consume_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      create_order_atomic:
        | { Args: { _order_data: Json }; Returns: Json }
        | { Args: { _order_data: Json; _tenant_id?: string }; Returns: Json }
      create_storefront_order: {
        Args: {
          _duplicate_window_minutes: number
          _order_data: Json
          _paid_product_ids: string[]
          _tenant_id: string
        }
        Returns: Json
      }
      generate_seed_orders: { Args: never; Returns: undefined }
      get_current_tenant_id: { Args: never; Returns: string }
      get_abandoned_cart_recovery: {
        Args: { _days?: number; _tenant_id: string }
        Returns: Json
      }
      get_customer_dashboard_stats: {
        Args: never
        Returns: {
          avg_trust_score: number
          first_delivery_pending_count: number
          new_this_month: number
          repeat_customer_count: number
          risk_blocked: number
          risk_caution: number
          risk_clean: number
          risk_high: number
          top_governorate: string
          top_governorate_count: number
          total_customers: number
          total_revenue: number
          val_good: number
          val_newcomer: number
          val_vip: number
          vips_quiet_count: number
        }[]
      }
      get_customer_order_counts: {
        Args: { _phones: string[]; _tenant_id: string }
        Returns: {
          normalized_phone: string
          order_count: number
        }[]
      }
      get_customer_percentile: {
        Args: { target_city?: string; target_phone: string }
        Returns: {
          city_name: string
          percentile: number
          total_in_group: number
        }[]
      }
      get_customer_order_history: {
        Args: { p_phone: string }
        Returns: {
          address_details: string
          city: string
          created_at: string
          customer_name: string
          delivery_fee: number
          discount_amount: number
          governorate_code: string
          id: string
          is_return: boolean
          items: Json
          notes: string
          order_id: string
          payment_status: string
          price: number
          secondary_phone: string
          status: string
        }[]
      }
      get_customer_reliability: {
        Args: { p_phone: string }
        Returns: {
          cancelled_count: number
          completed_count: number
          customer_phone: string
          is_blacklisted: boolean
          moderate_count: number
          no_response_count: number
          recent_moderate_count: number
          recent_severe_count: number
          refund_count: number
          rejected_count: number
          returned_count: number
          risk_level: string
          severe_count: number
          total_orders: number
          total_spent: number
          value_tier: string
        }[]
      }
      get_customer_score_audit_log: {
        Args: { log_limit?: number; log_offset?: number; target_phone: string }
        Returns: {
          edited_at: string
          edited_by: string
          edited_reason: string
          event_date: string
          event_type: string
          id: string
          order_id: string
          original_reason: string
          reason: string
          score_after: number
          score_before: number
          score_change: number
          source: string
          total_count: number
        }[]
      }
      get_customer_trust_history: {
        Args: { months?: number; target_phone: string }
        Returns: {
          avg_score: number
          event_count: number
          month: string
        }[]
      }
      get_dashboard_metrics: { Args: { p_range?: string }; Returns: Json }
      get_order_duplicate_flags: {
        Args: { _order_ids: string[]; _tenant_id: string }
        Returns: {
          has_duplicates: boolean
          order_id: string
          previous_order: Json
        }[]
      }
      get_orders_aggregates: {
        Args: {
          _city?: string
          _date_from?: string
          _date_to?: string
          _is_return?: boolean
          _order_type?: string
          _payment_status?: string
          _priority?: string
          _product?: string
          _tenant_id: string
        }
        Returns: Json
      }
      get_paginated_customers: {
        Args: {
          city_filter?: string
          first_delivery_pending?: boolean
          first_order_within_days?: number
          last_order_before_days?: number
          last_order_within_days?: number
          max_ltv?: number
          max_trust_score?: number
          min_ltv?: number
          min_trust_score?: number
          page_limit?: number
          page_offset?: number
          risk_filter?: string
          search_query?: string
          sort_by?: string
          sort_desc?: boolean
          status_filter?: string
          tag_id_filter?: string
          trust_tier_filter?: string
          value_filter?: string
        }
        Returns: {
          address_details: string
          calculated_status: string
          cancelled_count: number
          city: string
          community_avg_rating: number
          completed_count: number
          delivery_success_rate: number
          first_order_date: string
          governorate: string
          is_blacklisted: boolean
          last_order_date: string
          last_order_id: string
          last_order_status: string
          moderate_count: number
          name: string
          no_response_count: number
          phone: string
          recent_moderate_count: number
          recent_severe_count: number
          refund_count: number
          rejected_count: number
          returned_count: number
          risk_level: string
          secondary_phone: string
          severe_count: number
          total_count: number
          total_items: number
          total_orders: number
          total_spent: number
          trust_score: number
          trust_tier: string
          value_tier: string
        }[]
      }
      adjust_product_stock: {
        Args: {
          p_delta: number
          p_notes?: string
          p_product_id: string
          p_reason: string
          p_variant_id?: string
        }
        Returns: number
      }
      get_product_sales: {
        Args: { p_tenant_id: string }
        Returns: {
          order_count: number
          product_id: string
          revenue: number
          revenue_30d: number
          units_sold: number
          units_sold_30d: number
        }[]
      }
      get_seed_automation_status: { Args: never; Returns: Json }
      get_stock_today: {
        Args: { p_tenant_id: string }
        Returns: {
          image_url: string
          is_filler: boolean
          low_stock_threshold: number
          name: string
          ob_left: number
          ob_reserved: number
          on_hand: number
          product_id: string
          reserved: number
          sku: string
          today_new: number
          today_ob: number
          variant_id: string
          variant_name: string
          waiting_new: number
          waiting_ob: number
        }[]
      }
      get_user_tenant_ids: { Args: never; Returns: string[] }
      in_quiet_hours: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: boolean
      }
      increment_order_usage: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      increment_usage_tracking: {
        Args: { _month: number; _tenant_id: string; _year: number }
        Returns: undefined
      }
      inv_apply: {
        Args: {
          p_items: Json
          p_order_id: string
          p_sign: number
          p_status: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      inv_phase: { Args: { p_status: string }; Returns: string }
      is_tenant_admin: { Args: { p_tenant_id: string }; Returns: boolean }
      log_shipping_export: {
        Args: {
          p_company: string
          p_error_message?: string
          p_failure_stage?: string
          p_order_count: number
          p_succeeded: boolean
          p_tenant_id: string
        }
        Returns: string
      }
      lookup_order: {
        Args: { p_order_number: string; p_phone: string; p_tenant_id: string }
        Returns: {
          customer_name: string
          governorate: string
          order_number: string
          review_product_slug: string
          stage: string
          status: string
        }[]
      }
      loyalty_phone_key: { Args: { _phone: string }; Returns: string }
      loyalty_points_for_order: {
        Args: { _subtotal: number; _tenant_id: string }
        Returns: number
      }
      mark_notifications_read: { Args: never; Returns: undefined }
      merge_orders_atomic: {
        Args: {
          _archive_order_id: string
          _changed_by?: string
          _keep_order_id: string
          _tenant_id?: string
        }
        Returns: Json
      }
      mint_referral_code: {
        Args: { _phone: string; _tenant_id: string }
        Returns: string
      }
      normalize_arabic_text_for_search: {
        Args: { _text: string }
        Returns: string
      }
      normalize_phone: { Args: { input_phone: string }; Returns: string }
      normalize_phone_for_search: { Args: { _phone: string }; Returns: string }
      notification_channel_enabled: {
        Args: {
          p_category: string
          p_channel: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      notification_feed: {
        Args: { p_before?: string; p_filter?: string; p_limit?: number }
        Returns: {
          actor_avatar: string
          actor_name: string
          category: string
          created_at: string
          entity_id: string
          entity_label: string
          entity_type: string
          group_key: string
          id: string
          is_read: boolean
          payload: Json
          priority: string
          type: string
        }[]
      }
      notification_stats: {
        Args: { p_days?: number }
        Returns: {
          category: string
          day: string
          notifications: number
          push_failed: number
          push_sent: number
        }[]
      }
      notification_unread_count: { Args: never; Returns: number }
      order_base_id: { Args: { _order_id: string }; Returns: string }
      order_search_matches: {
        Args: {
          _address_details: string
          _city: string
          _customer_name: string
          _delivery_order_id: string
          _notes: string
          _order_id: string
          _phone: string
          _secondary_phone: string
          _sequence_number: number
          _term: string
        }
        Returns: boolean
      }
      order_source_actor_label: { Args: { p_source: string }; Returns: string }
      process_return: {
        Args: {
          _changed_by_avatar: string
          _changed_by_name: string
          _destinations: Json
          _order_id: string
          _reason_label: string
          _tenant_id: string
        }
        Returns: undefined
      }
      progress_seed_orders: { Args: never; Returns: undefined }
      prune_notification_deliveries: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      prune_order_notifications: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      publish_store_config_v2: {
        Args: {
          p_config: Json
          p_diff_summary?: Json
          p_expected_rev?: number
          p_tenant_id: string
        }
        Returns: {
          author_name: string | null
          config: Json
          created_at: string
          created_by: string | null
          diff_summary: Json | null
          id: string
          is_named: boolean
          label: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "store_config_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_product_children: {
        Args: { p_children: Json; p_product_id: string }
        Returns: undefined
      }
      set_counted_open_box: {
        Args: {
          p_counted: number
          p_notes?: string
          p_product_id: string
          p_variant_id?: string
        }
        Returns: number
      }
      set_counted_stock: {
        Args: {
          p_counted: number
          p_notes?: string
          p_product_id: string
          p_variant_id?: string
        }
        Returns: number
      }
      recompute_inventory: {
        Args: { p_tenant_id?: string }
        Returns: undefined
      }
      referral_check: {
        Args: { _code: string; _phone: string; _tenant_id: string }
        Returns: {
          ok: boolean
          reason: string
          referrer_phone: string
        }[]
      }
      refresh_bestseller_ranks: {
        Args: { p_top_n?: number; p_window_days?: number }
        Returns: number
      }
      refresh_customer_aggregates: { Args: never; Returns: undefined }
      refresh_tenant_public_stats: { Args: never; Returns: undefined }
      renew_subscription_atomic: {
        Args: { _expected_period_end: string; _subscription_id: string }
        Returns: Json
      }
      resolve_order_creation_actor: {
        Args: { p_order: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: Record<string, unknown>
      }
      resolve_status_actor: {
        Args: { p_changed_by: string }
        Returns: Record<string, unknown>
      }
      risk_level_calc: {
        Args: {
          p_blocked: boolean
          p_moderate: number
          p_recent_moderate: number
          p_recent_severe: number
          p_severe: number
        }
        Returns: string
      }
      search_orders: {
        Args: { p_limit?: number; p_term: string }
        Returns: {
          city: string
          created_at: string
          customer_name: string
          governorate_code: string
          id: string
          order_id: string
          phone: string
          price: number
          status: string
        }[]
      }
      seed_store_config_v2_draft: {
        Args: { p_config: Json; p_tenant_id: string }
        Returns: boolean
      }
      send_notification_digests: { Args: { p_mode: string }; Returns: number }
      set_team_member_active: {
        Args: { p_is_active: boolean; p_user_id: string }
        Returns: undefined
      }
      split_order_atomic:
        | {
            Args: {
              _kept_items: Json
              _original_order_id: string
              _returned_items: Json
            }
            Returns: Json
          }
        | {
            Args: {
              _kept_items: Json
              _original_order_id: string
              _returned_items: Json
              _tenant_id?: string
            }
            Returns: Json
          }
      storage_object_writable: {
        Args: { p_bucket: string; p_name: string; p_owner_id: string }
        Returns: boolean
      }
      storefront_funnel: {
        Args: { _from: string; _tenant_id: string; _to: string }
        Returns: Json
      }
      sweep_abandoned_carts: {
        Args: { _expire_after?: unknown }
        Returns: {
          outcome: string
          removed: number
          tenant_id: string
        }[]
      }
      tenant_block_active: {
        Args: { p_block: string; p_tenant_id: string }
        Returns: boolean
      }
      toggle_seed_automation: { Args: { _active: boolean }; Returns: Json }
      undo_return: {
        Args: { _order_id: string; _tenant_id: string }
        Returns: undefined
      }
      unmerge_orders_atomic: {
        Args: { _merge_log_id: string; _tenant_id?: string }
        Returns: Json
      }
      unsplit_order_atomic: {
        Args: { _split_log_id: string; _tenant_id?: string }
        Returns: Json
      }
      uuid_generate_v4: { Args: never; Returns: string }
      value_tier_calc: { Args: { p_completed: number }; Returns: string }
    }
    Enums: {
      commission_status: "pending" | "approved" | "paid"
      commission_type: "per_order" | "percentage" | "tiered_bonus" | "custom"
      competitor_relationship: "direct" | "indirect" | "substitute"
      customer_status: "new" | "regular" | "vip"
      lead_activity_type:
        | "note"
        | "call"
        | "whatsapp"
        | "email"
        | "meeting"
        | "status_change"
        | "assignment_change"
        | "store_created"
        | "follow_up"
        | "conversion"
        | "score_change"
        | "tag_change"
      lead_priority: "low" | "medium" | "high" | "urgent"
      lead_source_platform:
        | "instagram"
        | "facebook"
        | "tiktok"
        | "snapchat"
        | "youtube"
        | "twitter"
        | "linkedin"
        | "website"
        | "referral"
        | "cold_call"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "interested"
        | "store_built"
        | "converted"
        | "lost"
      lead_tier: "bronze" | "silver" | "gold" | "diamond" | "legendary"
      member_status: "pending" | "active" | "suspended"
      plan_tier:
        | "starter"
        | "growth"
        | "professional"
        | "enterprise"
        | "internal"
      refund_status: "none" | "pending" | "refunded" | "failed"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "incomplete"
      tag_color:
        | "yellow"
        | "green"
        | "blue"
        | "pink"
        | "purple"
        | "orange"
        | "red"
        | "gray"
      tenant_status: "trial" | "active" | "suspended" | "cancelled" | "limited"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      commission_status: ["pending", "approved", "paid"],
      commission_type: ["per_order", "percentage", "tiered_bonus", "custom"],
      competitor_relationship: ["direct", "indirect", "substitute"],
      customer_status: ["new", "regular", "vip"],
      lead_activity_type: [
        "note",
        "call",
        "whatsapp",
        "email",
        "meeting",
        "status_change",
        "assignment_change",
        "store_created",
        "follow_up",
        "conversion",
        "score_change",
        "tag_change",
      ],
      lead_priority: ["low", "medium", "high", "urgent"],
      lead_source_platform: [
        "instagram",
        "facebook",
        "tiktok",
        "snapchat",
        "youtube",
        "twitter",
        "linkedin",
        "website",
        "referral",
        "cold_call",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "interested",
        "store_built",
        "converted",
        "lost",
      ],
      lead_tier: ["bronze", "silver", "gold", "diamond", "legendary"],
      member_status: ["pending", "active", "suspended"],
      plan_tier: [
        "starter",
        "growth",
        "professional",
        "enterprise",
        "internal",
      ],
      refund_status: ["none", "pending", "refunded", "failed"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "incomplete",
      ],
      tag_color: [
        "yellow",
        "green",
        "blue",
        "pink",
        "purple",
        "orange",
        "red",
        "gray",
      ],
      tenant_status: ["trial", "active", "suspended", "cancelled", "limited"],
    },
  },
} as const
