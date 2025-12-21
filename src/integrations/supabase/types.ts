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
      catalog_items_sent: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          media_type: string
          media_url: string
          name: string
          position: number
          price: number | null
          price_formatted: string | null
          session_id: string
          sizes: Json | null
          sku: string
          stock_total: number | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          media_type: string
          media_url: string
          name: string
          position: number
          price?: number | null
          price_formatted?: string | null
          session_id: string
          sizes?: Json | null
          sku: string
          stock_total?: number | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          media_type?: string
          media_url?: string
          name?: string
          position?: number
          price?: number | null
          price_formatted?: string | null
          session_id?: string
          sizes?: Json | null
          sku?: string
          stock_total?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_sent_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "catalog_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sessions: {
        Row: {
          budget_max: number | null
          created_at: string
          id: string
          intent: string | null
          line: string
          phone: string
          preferred_color: string | null
          session_status: string
        }
        Insert: {
          budget_max?: number | null
          created_at?: string
          id?: string
          intent?: string | null
          line: string
          phone: string
          preferred_color?: string | null
          session_status?: string
        }
        Update: {
          budget_max?: number | null
          created_at?: string
          id?: string
          intent?: string | null
          line?: string
          phone?: string
          preferred_color?: string | null
          session_status?: string
        }
        Relationships: []
      }
      conversation_events: {
        Row: {
          direction: string
          id: string
          payload: Json | null
          phone: string
          ts: string | null
          type: string
        }
        Insert: {
          direction: string
          id?: string
          payload?: Json | null
          phone: string
          ts?: string | null
          type: string
        }
        Update: {
          direction?: string
          id?: string
          payload?: Json | null
          phone?: string
          ts?: string | null
          type?: string
        }
        Relationships: []
      }
      conversation_state: {
        Row: {
          last_catalog: Json | null
          last_intent: string | null
          last_step: string | null
          phone: string
          selected_index: number | null
          selected_sku: string | null
          updated_at: string | null
        }
        Insert: {
          last_catalog?: Json | null
          last_intent?: string | null
          last_step?: string | null
          phone: string
          selected_index?: number | null
          selected_sku?: string | null
          updated_at?: string | null
        }
        Update: {
          last_catalog?: Json | null
          last_intent?: string | null
          last_step?: string | null
          phone?: string
          selected_index?: number | null
          selected_sku?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          contact_name: string | null
          contact_number: string
          created_at: string
          id: string
          last_message: string | null
          lead_status: string | null
          platform: string | null
          unread_count: number | null
        }
        Insert: {
          contact_name?: string | null
          contact_number: string
          created_at?: string
          id?: string
          last_message?: string | null
          lead_status?: string | null
          platform?: string | null
          unread_count?: number | null
        }
        Update: {
          contact_name?: string | null
          contact_number?: string
          created_at?: string
          id?: string
          last_message?: string | null
          lead_status?: string | null
          platform?: string | null
          unread_count?: number | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          cpf: string | null
          created_at: string
          id: string
          name: string
          total_orders: number
          updated_at: string
          wallet_balance: number
          whatsapp: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          total_orders?: number
          updated_at?: string
          wallet_balance?: number
          whatsapp: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          total_orders?: number
          updated_at?: string
          wallet_balance?: number
          whatsapp?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          order_reference: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          order_reference?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          order_reference?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          is_from_me: boolean | null
          media_url: string | null
          message_type: string | null
          product_interest: string | null
          status: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_from_me?: boolean | null
          media_url?: string | null
          message_type?: string | null
          product_interest?: string | null
          status?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_from_me?: boolean | null
          media_url?: string | null
          message_type?: string | null
          product_interest?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_product_interest_fkey"
            columns: ["product_interest"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          active: boolean
          created_at: string
          end_date: string
          gift_description: string | null
          id: string
          product_id: string
          promotional_price: number
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date: string
          gift_description?: string | null
          id?: string
          product_id: string
          promotional_price: number
          start_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string
          gift_description?: string | null
          id?: string
          product_id?: string
          promotional_price?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string
          delivery_address: string | null
          delivery_method: string | null
          external_reference: string | null
          id: string
          notes: string | null
          payment_method: string | null
          product_id: string | null
          quantity: number
          selected_name: string | null
          selected_size_1: string | null
          selected_size_2: string | null
          selected_sku: string | null
          session_id: string | null
          source: string | null
          status: string
          summary_text: string | null
          total_price: number
          unit_or_pair: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone: string
          delivery_address?: string | null
          delivery_method?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          product_id?: string | null
          quantity?: number
          selected_name?: string | null
          selected_size_1?: string | null
          selected_size_2?: string | null
          selected_sku?: string | null
          session_id?: string | null
          source?: string | null
          status?: string
          summary_text?: string | null
          total_price: number
          unit_or_pair?: string | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string
          delivery_address?: string | null
          delivery_method?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          product_id?: string | null
          quantity?: number
          selected_name?: string | null
          selected_size_1?: string | null
          selected_size_2?: string | null
          selected_sku?: string | null
          session_id?: string | null
          source?: string | null
          status?: string
          summary_text?: string | null
          total_price?: number
          unit_or_pair?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "catalog_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          product_id: string
          size: string
          stock: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          size: string
          stock?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          size?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          category: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[] | null
          min_stock_alert: number | null
          name: string
          price: number | null
          sku: string | null
          tags: string[] | null
          video_url: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          min_stock_alert?: number | null
          name: string
          price?: number | null
          sku?: string | null
          tags?: string[] | null
          video_url?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          min_stock_alert?: number | null
          name?: string
          price?: number | null
          sku?: string | null
          tags?: string[] | null
          video_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          first_name: string | null
          full_name: string | null
          id: string
          instagram: string | null
          last_name: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id: string
          instagram?: string | null
          last_name?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          instagram?: string | null
          last_name?: string | null
          phone?: string | null
          role?: string | null
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      [_ in never]: never
    }
    Functions: {
      add_customer_cashback: {
        Args: {
          p_customer_id: string
          p_order_reference: string
          p_order_value: number
        }
        Returns: number
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      redeem_customer_cashback: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_order_reference: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor"
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
      app_role: ["admin", "gerente", "vendedor"],
    },
  },
} as const
