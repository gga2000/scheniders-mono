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
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_visible: boolean
          name: string
          parent_id: string | null
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_visible?: boolean
          name: string
          parent_id?: string | null
          slug: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_visible?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          tenant_id?: string
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
      product_variants: {
        Row: {
          cost: number | null
          created_at: string
          id: string
          name: string
          price: number | null
          product_id: string
          sku: string | null
          stock_quantity: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          id?: string
          name: string
          price?: number | null
          product_id: string
          sku?: string | null
          stock_quantity?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          id?: string
          name?: string
          price?: number | null
          product_id?: string
          sku?: string | null
          stock_quantity?: number | null
          tenant_id?: string | null
          updated_at?: string | null
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
          category_id: string | null
          compare_at_price: number | null
          cost: number | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_archived: boolean | null
          is_supply: boolean
          is_visible: boolean
          lightfunnels_aliases: string[] | null
          low_stock_threshold: number | null
          name: string
          price: number
          reserved_quantity: number
          short_description: string | null
          sku: string | null
          slug: string | null
          stock_quantity: number | null
          tag_color: string | null
          tenant_id: string | null
          updated_at: string | null
          website_price: number | null
        }
        Insert: {
          category_id?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_archived?: boolean | null
          is_supply?: boolean
          is_visible?: boolean
          lightfunnels_aliases?: string[] | null
          low_stock_threshold?: number | null
          name: string
          price?: number
          reserved_quantity?: number
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          stock_quantity?: number | null
          tag_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          website_price?: number | null
        }
        Update: {
          category_id?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_archived?: boolean | null
          is_supply?: boolean
          is_visible?: boolean
          lightfunnels_aliases?: string[] | null
          low_stock_threshold?: number | null
          name?: string
          price?: number
          reserved_quantity?: number
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          stock_quantity?: number | null
          tag_color?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          website_price?: number | null
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
      qc_quarantine: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string | null
          product_id: string | null
          quantity: number
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity: number
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
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
          metadata: Json
          plan: Database["public"]["Enums"]["plan_tier"]
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          store_config: Json | null
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
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          store_config?: Json | null
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
          metadata?: Json
          plan?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          store_config?: Json | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
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
      create_order_atomic:
        | { Args: { _order_data: Json }; Returns: Json }
        | { Args: { _order_data: Json; _tenant_id?: string }; Returns: Json }
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
      get_user_tenant_ids: { Args: never; Returns: string[] }
      increment_order_usage: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      is_tenant_admin: { Args: { p_tenant_id: string }; Returns: boolean }
      normalize_phone: { Args: { input_phone: string }; Returns: string }
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
      uuid_generate_v4: { Args: never; Returns: string }
    }
    Enums: {
      customer_status: "new" | "regular" | "vip"
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
      customer_status: ["new", "regular", "vip"],
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
