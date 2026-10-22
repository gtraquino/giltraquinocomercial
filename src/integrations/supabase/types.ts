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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          nif: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          nif?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          nif?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          iva_amount: number
          iva_rate: number
          line_subtotal: number
          line_total: number
          quantity: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          iva_amount?: number
          iva_rate?: number
          line_subtotal?: number
          line_total?: number
          quantity: number
          unit_price: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          iva_amount?: number
          iva_rate?: number
          line_subtotal?: number
          line_total?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          next_number: number
          series_key: string
          store_id: string
        }
        Insert: {
          next_number?: number
          series_key: string
          store_id: string
        }
        Update: {
          next_number?: number
          series_key?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          corrected_invoice_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_id: string | null
          customer_name: string
          customer_nif: string | null
          doc_type: string
          id: string
          issue_date: string
          iva_amount: number
          iva_rate: number
          notes: string | null
          number: number
          reason: string | null
          series: string
          source_order_id: string | null
          status: string
          store_id: string
          subtotal: number
          total: number
        }
        Insert: {
          corrected_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_id?: string | null
          customer_name: string
          customer_nif?: string | null
          doc_type: string
          id?: string
          issue_date?: string
          iva_amount?: number
          iva_rate?: number
          notes?: string | null
          number: number
          reason?: string | null
          series: string
          source_order_id?: string | null
          status?: string
          store_id: string
          subtotal?: number
          total?: number
        }
        Update: {
          corrected_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_nif?: string | null
          doc_type?: string
          id?: string
          issue_date?: string
          iva_amount?: number
          iva_rate?: number
          notes?: string | null
          number?: number
          reason?: string | null
          series?: string
          source_order_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_corrected_invoice_id_fkey"
            columns: ["corrected_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_name: string
          customer_phone: string
          id: string
          items: Json
          store_id: string
          total: number
        }
        Insert: {
          created_at?: string
          currency: string
          customer_name: string
          customer_phone: string
          id?: string
          items?: Json
          store_id: string
          total?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          items?: Json
          store_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          in_stock: boolean
          name: string
          price: number
          store_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean
          name: string
          price: number
          store_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean
          name?: string
          price?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_managers: {
        Row: {
          created_at: string
          id: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_managers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_payments: {
        Row: {
          amount: number
          covers_until: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string
          period: string
          store_id: string
        }
        Insert: {
          amount: number
          covers_until: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          period: string
          store_id: string
        }
        Update: {
          amount?: number
          covers_until?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          period?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accent_color: string | null
          address: string | null
          closing_time: string | null
          created_at: string
          created_by: string | null
          currency: string
          hero_title: string | null
          id: string
          is_blocked: boolean
          logo_url: string | null
          name: string
          nif: string | null
          opening_time: string | null
          paid_until: string | null
          primary_color: string | null
          subscription_amount: number | null
          subscription_period: string | null
          type: string
          updated_at: string
          whatsapp: string
          whatsapp_2: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          closing_time?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          hero_title?: string | null
          id?: string
          is_blocked?: boolean
          logo_url?: string | null
          name: string
          nif?: string | null
          opening_time?: string | null
          paid_until?: string | null
          primary_color?: string | null
          subscription_amount?: number | null
          subscription_period?: string | null
          type: string
          updated_at?: string
          whatsapp: string
          whatsapp_2?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          closing_time?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          hero_title?: string | null
          id?: string
          is_blocked?: boolean
          logo_url?: string | null
          name?: string
          nif?: string | null
          opening_time?: string | null
          paid_until?: string | null
          primary_color?: string | null
          subscription_amount?: number | null
          subscription_period?: string | null
          type?: string
          updated_at?: string
          whatsapp?: string
          whatsapp_2?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_invoice: {
        Args: {
          p_corrected_invoice_id?: string
          p_customer_address?: string
          p_customer_id?: string
          p_customer_name: string
          p_customer_nif?: string
          p_doc_type: string
          p_issue_date?: string
          p_items?: Json
          p_iva_rate?: number
          p_notes?: string
          p_reason?: string
          p_source_order_id?: string
          p_store_id: string
        }
        Returns: Json
      }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_store_manager: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
