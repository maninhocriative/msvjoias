import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = supabaseUrl && supabaseAnonKey;

if (!isConfigured) {
  console.warn('Supabase credentials not found. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
}

export const supabase: SupabaseClient = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key');

export const isSupabaseConfigured = isConfigured;

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Conversation = {
  id: string;
  contact_name: string;
  contact_number: string;
  platform: string;
  last_message: string;
  last_message_at?: string;
  unread_count: number;
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
