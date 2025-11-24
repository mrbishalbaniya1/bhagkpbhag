
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useCollection, useAuth } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { doc, collection } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';
import { GameLevel, defaultGameLevels } from '@/lib/game-config';

interface UserProfile {
    displayName: string;
    email: string;
    highScore: number;
    gameMode?: 'classic' | 'timeAttack' | 'zen' | 'insane';
    difficulty?: string;
    lastGame?: {
        score: number;
        coins: number;
        difficulty: string;
    }
}

type GameMode = 'classic' | 'timeAttack' | 'zen' | 'insane';

export default function AccountPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const auth = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const gameLevelsRef = useMemoFirebase(() => firestore ? collection(firestore, 'published_game_levels') : null, [firestore]);
    const { data: firebaseLevels, isLoading: levelsLoading } = useCollection<GameLevel>(gameLevelsRef);

    const userProfileRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

    const [displayName, setDisplayName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [gameMode, setGameMode] = useState<GameMode>('classic');
    const [difficulty, setDifficulty] = useState('easy');
    const [gameLevels, setGameLevels] = useState<GameLevel[]>(defaultGameLevels);

    useEffect(() => {
        if (!isUserLoading && (!user || user.isAnonymous)) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    useEffect(() => {
        if (firebaseLevels && firebaseLevels.length > 0) {
            const combinedLevels = [...defaultGameLevels];
            firebaseLevels.forEach(fbLevel => {
                const existingIndex = combinedLevels.findIndex(l => l.id === fbLevel.id);
                if (existingIndex !== -1) {
                    combinedLevels[existingIndex] = fbLevel;
                } else {
                    combinedLevels.push(fbLevel);
                }
            });
            setGameLevels(combinedLevels);
        } else if (!levelsLoading) {
            setGameLevels(defaultGameLevels);
        }
    }, [firebaseLevels, levelsLoading]);

    useEffect(() => {
        if (userProfile) {
            setDisplayName(userProfile.displayName);
            setGameMode(userProfile.gameMode || 'classic');
            setDifficulty(userProfile.difficulty || 'easy');
        }
    }, [userProfile]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfileRef || !userProfile) return;

        setIsUpdating(true);

        const updateData: Partial<UserProfile> = {
             highScore: userProfile.highScore || 0,
             lastGame: userProfile.lastGame || null,
        };
        let hasChanges = false;
        
        if (displayName.trim() && displayName.trim() !== userProfile?.displayName) {
            updateData.displayName = displayName.trim();
            hasChanges = true;
        }
        if (gameMode !== userProfile?.gameMode) {
            updateData.gameMode = gameMode;
            hasChanges = true;
        }
        if (difficulty !== userProfile?.difficulty) {
            updateData.difficulty = difficulty;
             hasChanges = true;
        }

        if (!hasChanges) {
            toast({
                title: 'No Changes',
                description: 'You haven\'t made any changes to save.',
            });
            setIsUpdating(false);
            return;
        }

        updateDocumentNonBlocking(userProfileRef, updateData);
        
        toast({
            title: 'Success!',
            description: 'Your profile and settings have been updated.',
        });
        
        setIsUpdating(false);
    };
    
    if (isUserLoading || isProfileLoading || !user || levelsLoading) {
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
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div className="space-y-2">
                                <Label>Game Mode</Label>
                                <Select onValueChange={(value: GameMode) => setGameMode(value)} value={gameMode}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select mode" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="classic"><span className="capitalize">Classic</span></SelectItem>
                                        <SelectItem value="timeAttack"><span className="capitalize">Time Attack</span></SelectItem>
                                        <SelectItem value="zen"><span className="capitalize">Zen Mode</span></SelectItem>
                                        <SelectItem value="insane"><span className="capitalize">Insane</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Difficulty</Label>
                                <Select onValueChange={setDifficulty} value={difficulty} disabled={gameMode === 'insane'}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select level" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {gameLevels?.filter(l => l.id !== 'insane').map(l => (
                                            <SelectItem key={l.id} value={l.id}>
                                                <span className="capitalize">{l.name}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Button type="submit" disabled={isUpdating} className="w-full">
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </form>
                </CardContent>
                <CardFooter>
                    <Button variant="ghost" size="lg" onClick={() => auth?.signOut()} className="w-full">
                        Sign Out
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

    