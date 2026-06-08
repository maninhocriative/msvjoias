import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Category {
  id: string;
  slug: string;
  label: string;
  active: boolean;
  agent_line?: 'aline' | 'keila' | 'kate' | 'malu' | 'human' | null;
  search_aliases?: string[] | null;
  ai_notes?: string | null;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('id, slug, label, active, agent_line, search_aliases, ai_notes')
      .eq('active', true)
      .order('label', { ascending: true });
    if (!error && data) setCategories(data as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  /**
   * Cria uma nova categoria (gera slug normalizado a partir do label).
   * Retorna o slug criado ou existente em caso de duplicata.
   */
  const createCategory = useCallback(async (
    label: string,
    options?: {
      agent_line?: Category['agent_line'];
      search_aliases?: string[];
      ai_notes?: string | null;
    },
  ): Promise<string | null> => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const slug = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!slug) return null;

    const { data, error } = await supabase
      .from('categories')
      .insert({
        slug,
        label: trimmed,
        agent_line: options?.agent_line || null,
        search_aliases: options?.search_aliases || [],
        ai_notes: options?.ai_notes || null,
      })
      .select('slug')
      .single();

    if (error) {
      // Duplicata: retorna slug existente
      if (error.code === '23505') {
        await fetchCategories();
        return slug;
      }
      throw error;
    }
    await fetchCategories();
    return data?.slug ?? slug;
  }, [fetchCategories]);

  return { categories, loading, refetch: fetchCategories, createCategory };
}
