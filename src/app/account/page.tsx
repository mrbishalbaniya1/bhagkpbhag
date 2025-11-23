
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';

interface UserProfile {
    displayName: string;
    email: string;
}

export default function AccountPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const userProfileRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

    const [displayName, setDisplayName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (!isUserLoading && (!user || user.isAnonymous)) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    useEffect(() => {
        if (userProfile) {
            setDisplayName(userProfile.displayName);
        }
    }, [userProfile]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfileRef || !displayName.trim()) {
            toast({
                variant: 'destructive',
                title: 'Invalid Username',
                description: 'Username cannot be empty.',
            });
            return;
        }

        setIsUpdating(true);
        try {
            await updateDocumentNonBlocking(userProfileRef, { displayName });
            toast({
                title: 'Success!',
                description: 'Your profile has been updated.',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Update Failed',
                description: error.message || 'Could not update your profile.',
            });
        } finally {
            setIsUpdating(false);
        }
    };
    
    if (isUserLoading || isProfileLoading || !user) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user || user.isAnonymous) {
        return null;
    }


    return (
        <div className="container mx-auto max-w-2xl p-4 md:p-8">
            <Button variant="outline" onClick={() => router.push('/')} className="mb-8">
                &larr; Back to Game
            </Button>
            <Card>
                <CardHeader>
                    <CardTitle>My Account</CardTitle>
                    <CardDescription>Manage your profile details and game settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUpdateProfile} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={userProfile?.email || ''} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="displayName">Username</Label>
                            <Input
                                id="displayName"
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Enter your new username"
                            />
                        </div>
                        <Button type="submit" disabled={isUpdating} className="w-full">
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
