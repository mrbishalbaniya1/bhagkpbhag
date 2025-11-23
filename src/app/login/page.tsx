'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { initiateEmailSignIn, initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    try {
      initiateEmailSignIn(auth, email, password);
      // The onAuthStateChanged listener in FirebaseProvider will handle the redirect
      // on successful login. We can show a pending toast here.
       toast({
        title: 'Signing In...',
        description: 'Please wait while we verify your credentials.',
      });
    } catch (error: any) {
      console.error('Sign-in error:', error);
      toast({
        variant: 'destructive',
        title: 'Sign In Failed',
        description: error.message || 'An unexpected error occurred.',
      });
    }
  };
  
  const handleAnonymousSignIn = async () => {
    if (!auth) return;
    try {
      initiateAnonymousSignIn(auth);
      toast({
        title: 'Signing In...',
        description: 'You are being signed in as a guest.',
      });
      router.push('/');
    } catch (error: any) {
        console.error('Anonymous sign-in error:', error);
        toast({
            variant: 'destructive',
            title: 'Guest Sign In Failed',
            description: error.message || 'Could not sign in as guest.',
        });
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Admin Login</CardTitle>
          <CardDescription>
            Enter your email below to login to your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignIn}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full">Sign in</Button>
            <Button variant="outline" className="w-full" onClick={handleAnonymousSignIn} type="button">
              Continue as Guest
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
