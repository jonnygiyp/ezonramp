import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface AboutContent {
  title: string;
  description: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQContent {
  items: FAQItem[];
}

interface ContactContent {
  email: string;
  description: string;
}

export function useSiteContent<T>(section: string) {
  return useQuery({
    queryKey: ['site_content', section],
    queryFn: async () => {
      // Use RPC function to avoid exposing admin user IDs (updated_by column)
      const { data, error } = await supabase
        .rpc('get_public_site_content')
        .eq('section', section)
        .maybeSingle();
      
      if (error) throw error;
      return data?.content as T | null;
    },
  });
}

export function useUpdateSiteContent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ section, content }: { section: string; content: Json }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('site_content')
        .update({ content, updated_by: user?.id })
        .eq('section', section);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['site_content', variables.section] });
    },
  });
}

export function useAboutContent() {
  return useSiteContent<AboutContent>('about');
}

export function useFAQContent() {
  return useSiteContent<FAQContent>('faq');
}

export function useContactContent() {
  return useSiteContent<ContactContent>('contact');
}

export type { AboutContent, FAQContent, FAQItem, ContactContent };
