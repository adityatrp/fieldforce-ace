import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, MapPin, Receipt } from 'lucide-react';

const TeamPage: React.FC = () => {
  const { user } = useAuth();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      // Admins can see roles via their policy
      const { data } = await supabase.from('user_roles').select('*');
      return data || [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">Team Management</h1>
        <p className="text-muted-foreground mt-1">View and manage your team members</p>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Loading team...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(p => {
            const userRole = roles.find(r => r.user_id === p.user_id);
            return (
              <Card key={p.id} className="field-card">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {(p.full_name || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{p.full_name || 'Unnamed'}</p>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="capitalize text-xs">
                          {(userRole?.role || 'salesperson').replace('_', ' ')}
                        </Badge>
                        {p.team_name && <Badge variant="outline" className="text-xs">{p.team_name}</Badge>}
                      </div>
                      {p.monthly_target && (
                        <p className="text-xs text-muted-foreground mt-2">Target: ₹{Number(p.monthly_target).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamPage;
