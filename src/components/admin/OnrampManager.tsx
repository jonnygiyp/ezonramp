import { useState } from 'react';
import { useOnrampProviders, useUpdateProvider, useCreateProvider, useDeleteProvider, type OnrampProvider } from '@/hooks/useOnrampProviders';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function OnrampManager() {
  const { data: providers, isLoading } = useOnrampProviders(true);
  const updateMutation = useUpdateProvider();
  const createMutation = useCreateProvider();
  const deleteMutation = useDeleteProvider();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: '', display_name: '' });

  const handleToggleEnabled = async (provider: OnrampProvider) => {
    try {
      await updateMutation.mutateAsync({
        id: provider.id,
        updates: { enabled: !provider.enabled },
      });
      toast({ title: `${provider.display_name} ${!provider.enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
      toast({
        title: 'Failed to update',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleMoveProvider = async (provider: OnrampProvider, direction: 'up' | 'down') => {
    if (!providers) return;
    
    const currentIndex = providers.findIndex(p => p.id === provider.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= providers.length) return;
    
    const otherProvider = providers[newIndex];
    
    try {
      await Promise.all([
        updateMutation.mutateAsync({
          id: provider.id,
          updates: { sort_order: otherProvider.sort_order },
        }),
        updateMutation.mutateAsync({
          id: otherProvider.id,
          updates: { sort_order: provider.sort_order },
        }),
      ]);
      toast({ title: 'Order updated' });
    } catch (error) {
      toast({
        title: 'Failed to reorder',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleAddProvider = async () => {
    if (!newProvider.name || !newProvider.display_name) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    
    const maxOrder = providers?.reduce((max, p) => Math.max(max, p.sort_order), 0) || 0;
    
    try {
      await createMutation.mutateAsync({
        name: newProvider.name.toLowerCase().replace(/\s+/g, '_'),
        display_name: newProvider.display_name,
        sort_order: maxOrder + 1,
        config: {},
      });
      toast({ title: 'Provider added' });
      setNewProvider({ name: '', display_name: '' });
      setShowAddDialog(false);
    } catch (error) {
      toast({
        title: 'Failed to add provider',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteProvider = async (provider: OnrampProvider) => {
    if (!confirm(`Are you sure you want to delete ${provider.display_name}?`)) return;
    
    try {
      await deleteMutation.mutateAsync(provider.id);
      toast({ title: 'Provider deleted' });
    } catch (error) {
      toast({
        title: 'Failed to delete',
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
        <CardTitle>Onramp Providers</CardTitle>
        <CardDescription>Manage available payment providers and their display order</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {providers?.map((provider, index) => (
          <div key={provider.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleMoveProvider(provider, 'up')}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleMoveProvider(provider, 'down')}
                  disabled={index === (providers?.length || 0) - 1}
                >
                  ↓
                </Button>
              </div>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">{provider.display_name}</p>
                <p className="text-sm text-muted-foreground">{provider.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor={`enabled-${provider.id}`} className="text-sm">
                  {provider.enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id={`enabled-${provider.id}`}
                  checked={provider.enabled}
                  onCheckedChange={() => handleToggleEnabled(provider)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteProvider(provider)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Provider</DialogTitle>
              <DialogDescription>Add a new onramp provider to the list</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="provider-name">Internal Name</Label>
                <Input
                  id="provider-name"
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  placeholder="e.g., stripe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-display">Display Name</Label>
                <Input
                  id="provider-display"
                  value={newProvider.display_name}
                  onChange={(e) => setNewProvider({ ...newProvider, display_name: e.target.value })}
                  placeholder="e.g., Stripe Payments"
                />
              </div>
              <Button onClick={handleAddProvider} disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Provider
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
