
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { initiateEmailSignIn, initiateGoogleSignIn } from '@/firebase/non-blocking-login';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { signInAnonymously } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !firestore || isLoading) return;

    setIsLoading(true);

    if (isSigningUp) {
      if (!displayName) {
        toast({
            variant: 'destructive',
            title: 'Display Name Required',
            description: 'Please enter a display name to create an account.',
        });
        setIsLoading(false);
        return;
      }
      await initiateEmailSignIn(auth, email, password, toast, router, { firestore, displayName });
    } else {
      await initiateEmailSignIn(auth, email, password, toast, router);
    }
    
    setIsLoading(false);
  };
  
  const handleAnonymousSignIn = async () => {
    if (!auth || isLoading) return;
    setIsLoading(true);
    try {
      await signInAnonymously(auth);
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
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleGoogleSignIn = async () => {
    if (!auth || !firestore || isLoading) return;
    setIsLoading(true);
    await initiateGoogleSignIn(auth, firestore, toast, router);
    setIsLoading(false);
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{isSigningUp ? 'Create an Account' : 'Admin Login'}</CardTitle>
          <CardDescription>
            {isSigningUp 
              ? 'Enter your details to create a new account.' 
              : "Enter your email below to login. New users will be prompted to sign up."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleAuthAction}>
          <CardContent className="grid gap-4">
            {isSigningUp && (
               <div className="grid gap-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Your Name"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={isLoading}
                  />
               </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
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
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSigningUp ? 'Sign Up' : 'Sign In'}
            </Button>
             <Button variant="link" type="button" onClick={() => setIsSigningUp(!isSigningUp)} disabled={isLoading}>
                {isSigningUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
             </Button>
            <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} type="button" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In with Google
            </Button>
            <Button variant="outline" className="w-full" onClick={handleAnonymousSignIn} type="button" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue as Guest
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
