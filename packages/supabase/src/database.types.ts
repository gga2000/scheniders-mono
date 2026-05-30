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
      customer_metadata: {
        Row: {
          birthday: string | null
          created_at: string
          customer_phone: string
          manual_status: Database["public"]["Enums"]["customer_status"] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          customer_phone: string
          manual_status?: Database["public"]["Enums"]["customer_status"] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
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
            isOneToOne: true
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
          city: string | null
          converted_at: string | null
          converted_tenant_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          estimated_daily_orders: number
          estimated_monthly_revenue: number
          follower_count: number
          governorate_code: string | null
          id: string
          industry_id: string | null
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
        }
        Insert: {
          address?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          avg_comments_count?: number
          avg_like_count?: number
          avg_order_count?: number
          avg_view_count?: number
          city?: string | null
          converted_at?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          estimated_daily_orders?: number
          estimated_monthly_revenue?: number
          follower_count?: number
          governorate_code?: string | null
          id?: string
          industry_id?: string | null
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
        }
        Update: {
          address?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          avg_comments_count?: number
          avg_like_count?: number
          avg_order_count?: number
          avg_view_count?: number
          city?: string | null
          converted_at?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          estimated_daily_orders?: number
          estimated_monthly_revenue?: number
          follower_count?: number
          governorate_code?: string | null
          id?: string
          industry_id?: string | null
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
      order_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          new_status: string | null
          old_status: string | null
          order_display_id: string
          order_id: string | null
          tenant_id: string | null
          type: string
          user_avatar: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          new_status?: string | null
          old_status?: string | null
          order_display_id: string
          order_id?: string | null
          tenant_id?: string | null
          type: string
          user_avatar?: string | null
          user_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          new_status?: string | null
          old_status?: string | null
          order_display_id?: string
          order_id?: string | null
          tenant_id?: string | null
          type?: string
          user_avatar?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_tenant_id_fkey"
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
          created_at: string
          customer_name: string
          delivered_at: string | null
          delivery_company: string | null
          delivery_fee: number | null
          delivery_note: string | null
          delivery_order_id: string | null
          delivery_slot: string | null
          discount_amount: number | null
          governorate_code: string | null
          id: string
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
          waseet_submitted_at: string | null
          whatsapp_link: string | null
        }
        Insert: {
          address_details?: string | null
          address_issues?: string[] | null
          address_status?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attention_reasons?: string[] | null
          cancelled_at?: string | null
          city?: string | null
          completed_at?: string | null
          contact_count?: number | null
          created_at?: string
          customer_name: string
          delivered_at?: string | null
          delivery_company?: string | null
          delivery_fee?: number | null
          delivery_note?: string | null
          delivery_order_id?: string | null
          delivery_slot?: string | null
          discount_amount?: number | null
          governorate_code?: string | null
          id?: string
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
          waseet_submitted_at?: string | null
          whatsapp_link?: string | null
        }
        Update: {
          address_details?: string | null
          address_issues?: string[] | null
          address_status?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attention_reasons?: string[] | null
          cancelled_at?: string | null
          city?: string | null
          completed_at?: string | null
          contact_count?: number | null
          created_at?: string
          customer_name?: string
          delivered_at?: string | null
          delivery_company?: string | null
          delivery_fee?: number | null
          delivery_note?: string | null
          delivery_order_id?: string | null
          delivery_slot?: string | null
          discount_amount?: number | null
          governorate_code?: string | null
          id?: string
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
          waseet_submitted_at?: string | null
          whatsapp_link?: string | null
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
          booking_enabled: boolean
          category_id: string | null
          compare_at_price: number | null
          cost: number | null
          cost_breakdown_json: Json | null
          created_at: string
          description: string | null
          dimensions_json: Json | null
          display_order: number
          download_url: string | null
          duration_minutes: number | null
          file_size: string | null
          id: string
          image_url: string | null
          is_archived: boolean | null
          is_supply: boolean
          is_visible: boolean
          license_key_pattern: string | null
          lightfunnels_aliases: string[] | null
          low_stock_threshold: number | null
          name: string
          price: number
          product_type: string
          reorder_point: number | null
          reserved_quantity: number
          short_description: string | null
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
          booking_enabled?: boolean
          category_id?: string | null
          compare_at_price?: number | null
          cost?: number | null
          cost_breakdown_json?: Json | null
          created_at?: string
          description?: string | null
          dimensions_json?: Json | null
          display_order?: number
          download_url?: string | null
          duration_minutes?: number | null
          file_size?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean | null
          is_supply?: boolean
          is_visible?: boolean
          license_key_pattern?: string | null
          lightfunnels_aliases?: string[] | null
          low_stock_threshold?: number | null
          name: string
          price?: number
          product_type?: string
          reorder_point?: number | null
          reserved_quantity?: number
          short_description?: string | null
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
          booking_enabled?: boolean
          category_id?: string | null
          compare_at_price?: number | null
          cost?: number | null
          cost_breakdown_json?: Json | null
          created_at?: string
          description?: string | null
          dimensions_json?: Json | null
          display_order?: number
          download_url?: string | null
          duration_minutes?: number | null
          file_size?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean | null
          is_supply?: boolean
          is_visible?: boolean
          license_key_pattern?: string | null
          lightfunnels_aliases?: string[] | null
          low_stock_threshold?: number | null
          name?: string
          price?: number
          product_type?: string
          reorder_point?: number | null
          reserved_quantity?: number
          short_description?: string | null
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
      rejection_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          label: string
          label_ar: string | null
          sort_order: number | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          label: string
          label_ar?: string | null
          sort_order?: number | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          label?: string
          label_ar?: string | null
          sort_order?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rejection_reasons_tenant_id_fkey"
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
      subscriptions: {
        Row: {
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
      tenants: {
        Row: {
          address: string | null
          branding: Json
          business_name: string
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_prospect: boolean
          metadata: Json
          plan: Database["public"]["Enums"]["plan_tier"]
          prospect_lead_id: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          store_config: Json | null
          store_config_draft: Json | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branding?: Json
          business_name: string
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_prospect?: boolean
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          prospect_lead_id?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          store_config?: Json | null
          store_config_draft?: Json | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branding?: Json
          business_name?: string
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_prospect?: boolean
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          prospect_lead_id?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          store_config?: Json | null
          store_config_draft?: Json | null
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
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_granted?: boolean
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_granted?: boolean
          permission?: string
          user_id?: string
        }
        Relationships: []
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
          total_items: number | null
          total_orders: number | null
          total_spent: number | null
        }
        Relationships: []
      }
      v_orders_with_risk: {
        Row: {
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
          delivered_at: string | null
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
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_lead_score: { Args: { p_lead_id: string }; Returns: number }
      charge_wallet_atomic: {
        Args: {
          _amount: number
          _description?: string
          _order_id?: string
          _tenant_id: string
        }
        Returns: Json
      }
      compute_lead_predictions: {
        Args: { p_avg_view_count: number; p_industry_id: string }
        Returns: {
          daily_orders: number
          monthly_revenue: number
        }[]
      }
      compute_lead_tier: {
        Args: { p_follower_count: number }
        Returns: Database["public"]["Enums"]["lead_tier"]
      }
      create_order_atomic:
        | { Args: { _order_data: Json }; Returns: Json }
        | { Args: { _order_data: Json; _tenant_id?: string }; Returns: Json }
      generate_seed_orders: { Args: never; Returns: undefined }
      get_current_tenant_id: { Args: never; Returns: string }
      get_customer_dashboard_stats: {
        Args: never
        Returns: {
          new_count: number
          regular_count: number
          total_customers: number
          total_revenue: number
          vip_count: number
        }[]
      }
      get_paginated_customers: {
        Args: {
          city_filter?: string
          last_order_within_days?: number
          max_ltv?: number
          min_ltv?: number
          page_limit?: number
          page_offset?: number
          search_query?: string
          sort_by?: string
          sort_desc?: boolean
          status_filter?: string
          tag_id_filter?: string
        }
        Returns: {
          address_details: string
          calculated_status: string
          city: string
          first_order_date: string
          governorate: string
          is_blacklisted: boolean
          last_order_date: string
          last_order_id: string
          last_order_status: string
          name: string
          phone: string
          secondary_phone: string
          total_count: number
          total_items: number
          total_orders: number
          total_spent: number
        }[]
      }
      get_seed_automation_status: { Args: never; Returns: Json }
      get_user_tenant_ids: { Args: never; Returns: string[] }
      increment_order_usage: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      increment_usage_tracking: {
        Args: { _month: number; _tenant_id: string; _year: number }
        Returns: undefined
      }
      is_tenant_admin: { Args: { p_tenant_id: string }; Returns: boolean }
      normalize_phone: { Args: { input_phone: string }; Returns: string }
      progress_seed_orders: { Args: never; Returns: undefined }
      refresh_customer_aggregates: { Args: never; Returns: undefined }
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
      toggle_seed_automation: { Args: { _active: boolean }; Returns: Json }
      uuid_generate_v4: { Args: never; Returns: string }
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
      plan_tier: "starter" | "growth" | "professional" | "enterprise"
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
      tenant_status: "trial" | "active" | "suspended" | "cancelled"
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
      plan_tier: ["starter", "growth", "professional", "enterprise"],
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
      tenant_status: ["trial", "active", "suspended", "cancelled"],
    },
  },
} as const
