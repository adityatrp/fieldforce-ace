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
      attendance_daily_summary: {
        Row: {
          created_at: string
          id: string
          ping_count: number
          punched_in_at: string | null
          punched_out_at: string | null
          total_active_visit_minutes: number
          total_distance_km: number
          total_idle_minutes: number
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          ping_count?: number
          punched_in_at?: string | null
          punched_out_at?: string | null
          total_active_visit_minutes?: number
          total_distance_km?: number
          total_idle_minutes?: number
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          id?: string
          ping_count?: number
          punched_in_at?: string | null
          punched_out_at?: string | null
          total_active_visit_minutes?: number
          total_distance_km?: number
          total_idle_minutes?: number
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      attendance_punches: {
        Row: {
          battery_percent_in: number | null
          battery_percent_out: number | null
          created_at: string
          id: string
          punch_in_accuracy: number | null
          punch_in_latitude: number | null
          punch_in_longitude: number | null
          punch_out_accuracy: number | null
          punch_out_latitude: number | null
          punch_out_longitude: number | null
          punched_in_at: string
          punched_out_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          battery_percent_in?: number | null
          battery_percent_out?: number | null
          created_at?: string
          id?: string
          punch_in_accuracy?: number | null
          punch_in_latitude?: number | null
          punch_in_longitude?: number | null
          punch_out_accuracy?: number | null
          punch_out_latitude?: number | null
          punch_out_longitude?: number | null
          punched_in_at?: string
          punched_out_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          battery_percent_in?: number | null
          battery_percent_out?: number | null
          created_at?: string
          id?: string
          punch_in_accuracy?: number | null
          punch_in_latitude?: number | null
          punch_in_longitude?: number | null
          punch_out_accuracy?: number | null
          punch_out_latitude?: number | null
          punch_out_longitude?: number | null
          punched_in_at?: string
          punched_out_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          approval_status: string
          approved_by: string | null
          category: string
          created_at: string
          id: string
          notes: string | null
          receipt_photo_url: string | null
          updated_at: string
          user_id: string
          validation_result: string | null
        }
        Insert: {
          amount?: number
          approval_status?: string
          approved_by?: string | null
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          receipt_photo_url?: string | null
          updated_at?: string
          user_id: string
          validation_result?: string | null
        }
        Update: {
          amount?: number
          approval_status?: string
          approved_by?: string | null
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          receipt_photo_url?: string | null
          updated_at?: string
          user_id?: string
          validation_result?: string | null
        }
        Relationships: []
      }
      location_logs: {
        Row: {
          accuracy: number | null
          battery_charging: boolean | null
          battery_percent: number | null
          created_at: string
          id: string
          latitude: number
          logged_at: string
          longitude: number
          source: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          accuracy?: number | null
          battery_charging?: boolean | null
          battery_percent?: number | null
          created_at?: string
          id?: string
          latitude: number
          logged_at?: string
          longitude: number
          source?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          accuracy?: number | null
          battery_charging?: boolean | null
          battery_percent?: number | null
          created_at?: string
          id?: string
          latitude?: number
          logged_at?: string
          longitude?: number
          source?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: []
      }
      marketing_issuances: {
        Row: {
          created_at: string
          id: string
          issued_at: string
          issued_by: string
          issued_to: string
          material_id: string
          notes: string
          quantity: number
          returned_at: string | null
          returned_quantity: number
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by: string
          issued_to: string
          material_id: string
          notes?: string
          quantity?: number
          returned_at?: string | null
          returned_quantity?: number
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string
          issued_to?: string
          material_id?: string
          notes?: string
          quantity?: number
          returned_at?: string | null
          returned_quantity?: number
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_materials: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          description: string
          id: string
          name: string
          team_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          description?: string
          id?: string
          name: string
          team_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          name?: string
          team_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          name: string
          price: number
          sku: string
          team_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          name: string
          price?: number
          sku?: string
          team_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          name?: string
          price?: number
          sku?: string
          team_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          monthly_target: number | null
          team_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          monthly_target?: number | null
          team_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          monthly_target?: number | null
          team_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shop_assignments: {
        Row: {
          active: boolean
          assigned_by: string
          assigned_to: string
          created_at: string
          id: string
          shop_id: string
          updated_at: string
          visits_per_month: number
        }
        Insert: {
          active?: boolean
          assigned_by: string
          assigned_to: string
          created_at?: string
          id?: string
          shop_id: string
          updated_at?: string
          visits_per_month: number
        }
        Update: {
          active?: boolean
          assigned_by?: string
          assigned_to?: string
          created_at?: string
          id?: string
          shop_id?: string
          updated_at?: string
          visits_per_month?: number
        }
        Relationships: []
      }
      shops: {
        Row: {
          active: boolean
          address: string
          contact_person: string
          created_at: string
          created_by: string
          geocode_error: string
          geocode_status: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string
          team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address: string
          contact_person?: string
          created_at?: string
          created_by: string
          geocode_error?: string
          geocode_status?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          contact_person?: string
          created_at?: string
          created_by?: string
          geocode_error?: string
          geocode_status?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      targets: {
        Row: {
          achieved_value: number
          created_at: string
          id: string
          period: string
          period_start: string | null
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_value?: number
          created_at?: string
          id?: string
          period?: string
          period_start?: string | null
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          achieved_value?: number
          created_at?: string
          id?: string
          period?: string
          period_start?: string | null
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_extra_photos: {
        Row: {
          caption: string
          created_at: string
          id: string
          photo_path: string
          visit_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          id?: string
          photo_path: string
          visit_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          photo_path?: string
          visit_id?: string
        }
        Relationships: []
      }
      visit_order_items: {
        Row: {
          created_at: string
          id: string
          price_at_order: number
          product_id: string
          quantity: number
          visit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          price_at_order?: number
          product_id: string
          quantity?: number
          visit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          price_at_order?: number
          product_id?: string
          quantity?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_order_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          assignment_id: string | null
          auto_failed: boolean
          checked_in_at: string
          checked_out_at: string | null
          created_at: string
          customer_name: string
          due_date: string | null
          id: string
          latitude: number | null
          location_name: string | null
          longitude: number | null
          notes: string | null
          order_approval_status: string
          order_approved_at: string | null
          order_approved_by: string | null
          order_notes: string | null
          order_received: boolean | null
          period_end: string | null
          period_index: number | null
          period_start: string | null
          photo_url: string | null
          reassigned_to_visit_id: string | null
          scheduled_at: string | null
          shop_id: string | null
          target_latitude: number | null
          target_longitude: number | null
          updated_at: string
          user_id: string
          visit_status: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          assignment_id?: string | null
          auto_failed?: boolean
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          customer_name: string
          due_date?: string | null
          id?: string
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          notes?: string | null
          order_approval_status?: string
          order_approved_at?: string | null
          order_approved_by?: string | null
          order_notes?: string | null
          order_received?: boolean | null
          period_end?: string | null
          period_index?: number | null
          period_start?: string | null
          photo_url?: string | null
          reassigned_to_visit_id?: string | null
          scheduled_at?: string | null
          shop_id?: string | null
          target_latitude?: number | null
          target_longitude?: number | null
          updated_at?: string
          user_id: string
          visit_status?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          assignment_id?: string | null
          auto_failed?: boolean
          checked_in_at?: string
          checked_out_at?: string | null
          created_at?: string
          customer_name?: string
          due_date?: string | null
          id?: string
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          notes?: string | null
          order_approval_status?: string
          order_approved_at?: string | null
          order_approved_by?: string | null
          order_notes?: string | null
          order_received?: boolean | null
          period_end?: string | null
          period_index?: number | null
          period_start?: string | null
          photo_url?: string | null
          reassigned_to_visit_id?: string | null
          scheduled_at?: string | null
          shop_id?: string | null
          target_latitude?: number | null
          target_longitude?: number | null
          updated_at?: string
          user_id?: string
          visit_status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      users_share_team: {
        Args: { _user_a: string; _user_b: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "salesperson" | "team_lead" | "admin"
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
      app_role: ["salesperson", "team_lead", "admin"],
    },
  },
} as const
