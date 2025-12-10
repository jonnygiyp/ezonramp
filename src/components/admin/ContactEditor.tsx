import { useState, useEffect } from 'react';
import { useContactContent, useUpdateSiteContent, type ContactContent } from '@/hooks/useSiteContent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Json } from '@/integrations/supabase/types';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function ContactEditor() {
  const { data, isLoading } = useContactContent();
  const updateMutation = useUpdateSiteContent();
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (data) {
      setEmail(data.email || '');
      setDescription(data.description || '');
    }
  }, [data]);

  const handleSave = async () => {
    const content = { email, description } as unknown as Json;
    
    try {
      await updateMutation.mutateAsync({ section: 'contact', content });
      toast({ title: 'Contact section updated' });
    } catch (error) {
      toast({
        title: 'Failed to update',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Section</CardTitle>
        <CardDescription>Edit the contact page information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="contact-email">Support Email</Label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="support@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-description">Description</Label>
          <Textarea
            id="contact-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter contact page description..."
            rows={4}
          />
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}
