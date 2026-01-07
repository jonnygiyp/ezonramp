import { useState, useEffect } from 'react';
import { useAboutContent, useUpdateSiteContent, type AboutContent } from '@/hooks/useSiteContent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Json } from '@/integrations/supabase/types';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function AboutEditor() {
  const { data, isLoading } = useAboutContent();
  const updateMutation = useUpdateSiteContent();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (data) {
      setTitle(data.title || '');
      setDescription(data.description || '');
    }
  }, [data]);

  const handleSave = async () => {
    const content = { title, description } as unknown as Json;
    
    try {
      await updateMutation.mutateAsync({ section: 'about', content });
      toast({ title: 'About section updated' });
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
        <CardTitle>About Section</CardTitle>
        <CardDescription>Edit the content displayed on the About page</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="about-title">Title</Label>
          <Input
            id="about-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="About Us"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="about-description">Description</Label>
          <RichTextEditor
            value={description}
            onChange={(value) => setDescription(value)}
            placeholder="Enter about section content..."
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
