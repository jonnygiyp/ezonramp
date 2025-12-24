import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface OnrampProvider {
  id: string;
  name: string;
  display_name: string;
  enabled: boolean;
  sort_order: number;
  config: Json;
}

export function useOnrampProviders(showAll = false) {
  return useQuery({
    queryKey: ['onramp_providers', showAll],
    queryFn: async () => {
      if (showAll) {
        // Admins can access the full table directly (requires admin role via RLS)
        const { data, error } = await supabase
          .from('onramp_providers')
          .select('*')
          .order('sort_order', { ascending: true });
        
        if (error) throw error;
        return data as OnrampProvider[];
      } else {
        // Public access uses secure RPC function that excludes sensitive config
        const { data, error } = await supabase.rpc('get_public_onramp_providers');
        
        if (error) throw error;
        // Map to OnrampProvider type with empty config for public view
        return (data || []).map((p: { id: string; name: string; display_name: string; enabled: boolean; sort_order: number }) => ({
          ...p,
          config: {} as Json, // Config is hidden from public access
        })) as OnrampProvider[];
      }
    },
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { enabled?: boolean; sort_order?: number; display_name?: string; config?: Json } }) => {
      const { error } = await supabase
        .from('onramp_providers')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onramp_providers'] });
    },
  });
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (provider: { name: string; display_name: string; enabled?: boolean; sort_order?: number; config?: Json }) => {
      const { error } = await supabase
        .from('onramp_providers')
        .insert(provider);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onramp_providers'] });
    },
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('onramp_providers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onramp_providers'] });
    },
  });
}
