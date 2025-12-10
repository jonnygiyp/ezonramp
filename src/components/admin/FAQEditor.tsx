import { useState, useEffect } from 'react';
import { useFAQContent, useUpdateSiteContent, type FAQContent, type FAQItem } from '@/hooks/useSiteContent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Json } from '@/integrations/supabase/types';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';

export default function FAQEditor() {
  const { data, isLoading } = useFAQContent();
  const updateMutation = useUpdateSiteContent();
  const [items, setItems] = useState<FAQItem[]>([]);

  useEffect(() => {
    if (data?.items) {
      setItems(data.items);
    }
  }, [data]);

  const handleAddItem = () => {
    setItems([...items, { question: '', answer: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: 'question' | 'answer', value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === items.length - 1)
    ) return;

    const updated = [...items];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setItems(updated);
  };

  const handleSave = async () => {
    const content = { items } as unknown as Json;
    
    try {
      await updateMutation.mutateAsync({ section: 'faq', content });
      toast({ title: 'FAQ section updated' });
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
        <CardTitle>FAQ Section</CardTitle>
        <CardDescription>Manage frequently asked questions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map((item, index) => (
          <div key={index} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Question {index + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMoveItem(index, 'up')}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMoveItem(index, 'down')}
                  disabled={index === items.length - 1}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveItem(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Question</Label>
              <Input
                value={item.question}
                onChange={(e) => handleUpdateItem(index, 'question', e.target.value)}
                placeholder="Enter question..."
              />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea
                value={item.answer}
                onChange={(e) => handleUpdateItem(index, 'answer', e.target.value)}
                placeholder="Enter answer..."
                rows={3}
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={handleAddItem} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add FAQ Item
        </Button>

        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}
