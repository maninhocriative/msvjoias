import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'gerente' | 'vendedor' | null;

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserRole();
    } else {
      setRole(null);
      setLoading(false);
    }
  }, [user]);

  const fetchUserRole = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setRole(data?.role as AppRole || null);
    } catch (error) {
      console.error('Error fetching user role:', error);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = role === 'admin';
  const isGerente = role === 'gerente';
  const isVendedor = role === 'vendedor';

  // Permission helpers
  const canManageUsers = isAdmin;
  const canManageProducts = isAdmin || isGerente;
  const canManageStock = isAdmin || isGerente;
  const canManageOrders = isAdmin || isGerente || isVendedor;
  const canViewReports = isAdmin || isGerente;

  return {
    role,
    loading,
    isAdmin,
    isGerente,
    isVendedor,
    canManageUsers,
    canManageProducts,
    canManageStock,
    canManageOrders,
    canViewReports,
    refetch: fetchUserRole,
  };
};
