import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  active: boolean;
  created_at?: string;
};

export type Conversation = {
  id: string;
  contact_name: string;
  contact_number: string;
  platform: string;
  last_message: string;
  created_at?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  is_from_me: boolean;
  created_at?: string;
};
