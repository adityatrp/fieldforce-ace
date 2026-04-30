import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Shield, Users } from 'lucide-react';

const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <MapPin className="h-8 w-8" />
            <h1 className="text-3xl font-bold tracking-tight">FieldForce Pro</h1>
          </div>
          <p className="text-muted-foreground">Enterprise Trip & Sales Management</p>
        </div>

        <div className="flex justify-center gap-6 text-muted-foreground text-sm">
          <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> GPS Tracking</div>
          <div className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Team Mgmt</div>
          <div className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> Secure</div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-center">Sign in to your account</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
              <p className="text-xs text-center text-muted-foreground pt-2">
                New accounts are created by your team lead or admin. Contact them if you need access.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
