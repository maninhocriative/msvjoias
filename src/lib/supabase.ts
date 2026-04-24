import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ahbjwpkpxqqrpvpzmqwa.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYmp3cGtweHFxcnB2cHptcXdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTY5NzUsImV4cCI6MjA4MTEzMjk3NX0.jdH0gleC9mcB1ezewdobxCp-yKmM37dixfkMyzzhhaQ';

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isConfigured) {
  console.warn('Supabase credentials not found. Please check your Supabase URL and anon key configuration.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = isConfigured;

export type Product = {
  id: string;
  name: string;
  sku?: string | null;
  description: string;
  price: number;
  category: string;
  image_url: string;
  video_url?: string | null;
  images?: string[];
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LeadStatus =
  | 'novo'
  | 'frio'
  | 'quente'
  | 'comprador'
  | 'sem_interesse'
  | 'qualificado'
  | 'vendido'
  | 'perdido';

export type Conversation = {
  id: string;
  contact_name: string;
  contact_number: string;
  platform: string;
  last_message: string;
  last_message_at?: string;
  unread_count: number;
  lead_status?: LeadStatus;
  created_at?: string;
  updated_at?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  is_from_me: boolean;
  zapi_message_id?: string;
  status?: string;
  created_at?: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRole = {
  id: string;
  user_id: string;
  role: 'admin' | 'moderator' | 'user';
  created_at: string;
};

export type ChatSaleRecord = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  selected_name: string | null;
  selected_sku: string | null;
  quantity: number;
  total_price: number | null;
  assigned_to: string | null;
  created_at: string;
  source?: string | null;
  status?: string | null;
  external_reference?: string | null;
  notes?: string | null;
  summary_text?: string | null;
};
