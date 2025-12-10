import { useState } from 'react';
import { useAdminInvites, useCreateInvite, useDeleteInvite, type AdminInvite } from '@/hooks/useAdminInvites';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Copy, CheckCircle, Clock, X } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Invalid email address');

export default function AdminInvites() {
  const { data: invites, isLoading } = useAdminInvites();
  const createMutation = useCreateInvite();
  const deleteMutation = useDeleteInvite();
  
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');

  const handleCreateInvite = async () => {
    const result = emailSchema.safeParse(newEmail);
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }
    setError('');
    
    try {
      const invite = await createMutation.mutateAsync(newEmail);
      toast({ title: 'Invite created', description: `Invite sent to ${newEmail}` });
      setNewEmail('');
      
      // Copy signup link to clipboard
      const signupUrl = `${window.location.origin}/auth?invite=${invite.token}`;
      await navigator.clipboard.writeText(signupUrl);
      toast({ title: 'Signup link copied to clipboard' });
    } catch (error) {
      toast({
        title: 'Failed to create invite',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLink = async (invite: AdminInvite) => {
    const signupUrl = `${window.location.origin}/auth?invite=${invite.token}`;
    await navigator.clipboard.writeText(signupUrl);
    toast({ title: 'Signup link copied to clipboard' });
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: 'Invite deleted' });
    } catch (error) {
      toast({
        title: 'Failed to delete invite',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const getInviteStatus = (invite: AdminInvite) => {
    if (invite.used_at) {
      return { label: 'Used', variant: 'default' as const, icon: CheckCircle };
    }
    if (new Date(invite.expires_at) < new Date()) {
      return { label: 'Expired', variant: 'destructive' as const, icon: X };
    }
    return { label: 'Pending', variant: 'secondary' as const, icon: Clock };
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
        <CardTitle>Admin Invites</CardTitle>
        <CardDescription>Invite new administrators to the dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@example.com"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex items-end">
            <Button onClick={handleCreateInvite} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2">Invite</span>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Existing Invites</h3>
          {invites?.length === 0 && (
            <p className="text-sm text-muted-foreground">No invites yet</p>
          )}
          {invites?.map((invite) => {
            const status = getInviteStatus(invite);
            return (
              <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires: {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={status.variant}>
                    <status.icon className="h-3 w-3 mr-1" />
                    {status.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {!invite.used_at && new Date(invite.expires_at) > new Date() && (
                    <Button variant="ghost" size="sm" onClick={() => handleCopyLink(invite)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteInvite(invite.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
