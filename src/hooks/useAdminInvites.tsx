import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminInvite {
  id: string;
  email: string;
  token: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export function useAdminInvites() {
  return useQuery({
    queryKey: ['admin_invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_invites')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as AdminInvite[];
    },
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (email: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('admin_invites')
        .insert({ email, invited_by: user?.id })
        .select()
        .single();
      
      if (error) throw error;
      return data as AdminInvite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_invites'] });
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('admin_invites')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_invites'] });
    },
  });
}
