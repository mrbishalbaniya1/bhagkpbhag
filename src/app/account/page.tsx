'use client';

import React, { useState, useEffect, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useAuth } from '@/firebase';
import { updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { doc, collection, increment, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';
import { GameLevel, defaultGameLevels } from '@/lib/game-config';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';
import { generateUsername } from '@/ai/flows/generate-username-flow';
import { generateAvatar } from '@/ai/flows/generate-avatar-flow';
import { useCollection } from '@/firebase';
import { Switch } from '@/components/ui/switch';

const XP_PER_LEVEL = 1000; // 1000 XP to level up

const achievementsConfig = {
    'first-50': 'First 50 Points',
    'flawless-run': 'Flawless Run (no collisions)',
    'slow-mo-master': 'Slow-Mo Master',
    'veteran-player': 'Veteran Player (100 games played)',
};
type AchievementId = keyof typeof achievementsConfig;

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
    };
    xp?: number;
    level?: number;
    avatarUrl?: string;
    achievements?: AchievementId[];
    gamesPlayed?: number;
}

type GameMode = 'classic' | 'timeAttack' | 'zen' | 'insane';

const Achievements = ({ achievementIds }: { achievementIds?: AchievementId[] }) => {
    if (!achievementIds || achievementIds.length === 0) {
        return <p className="text-sm text-muted-foreground">No achievements yet. Keep playing!</p>;
    }

    return (
        <TooltipProvider>
            <div className="flex flex-wrap gap-2">
                {achievementIds.map(id => (
                    <Tooltip key={id}>
                        <TooltipTrigger asChild>
                            <Badge variant="secondary">{achievementsConfig[id]}</Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{achievementsConfig[id]}</p>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    );
};

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
    const [isGeneratingUsername, setIsGeneratingUsername] = useState(false);
    const [gameMode, setGameMode] = useState<GameMode>('classic');
    const [difficulty, setDifficulty] = useState('easy');
    const [gameLevels, setGameLevels] = useState<GameLevel[]>(defaultGameLevels);
    
    // Audio settings
    const [isBgmMuted, setIsBgmMuted] = useState(false);
    const [areSfxMuted, setAreSfxMuted] = useState(false);
    
    // Avatar state
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

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
        // Load audio settings from localStorage
        const bgm = localStorage.getItem('bhagkp-bgm-muted') === 'true';
        const sfx = localStorage.getItem('bhagkp-sfx-muted') === 'true';
        setIsBgmMuted(bgm);
        setAreSfxMuted(sfx);
    }, [userProfile]);

    const handleBgmToggle = (checked: boolean) => {
        setIsBgmMuted(checked);
        localStorage.setItem('bhagkp-bgm-muted', String(checked));
    };

    const handleSfxToggle = (checked: boolean) => {
        setAreSfxMuted(checked);
        localStorage.setItem('bhagkp-sfx-muted', String(checked));
    };
    
    const handleGenerateUsername = async () => {
        if (!firestore) return;
        setIsGeneratingUsername(true);
        try {
            // This is the problematic line that violates security rules.
            // We will pass an empty array to the AI flow instead.
            const result = await generateUsername({ usedUsernames: [] });
            setDisplayName(result.username);
            toast({ title: "Username Generated!", description: `New username: ${result.username}` });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not generate a new username.' });
        } finally {
            setIsGeneratingUsername(false);
        }
    };
    
    const handleAvatarUpload = async () => {
        if (!avatarFile || !userProfileRef) return;
        
        setIsUploading(true);
        toast({ title: 'Uploading Avatar...' });
        
        const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
        if (!cloudName) {
            toast({ variant: 'destructive', title: 'Upload Error', description: 'Cloudinary cloud name is not configured.' });
            setIsUploading(false);
            return;
        }

        const formData = new FormData();
        formData.append('file', avatarFile);
        formData.append('upload_preset', 'ml_default');
        
        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                updateDocumentNonBlocking(userProfileRef, { avatarUrl: data.secure_url });
                toast({ title: 'Success!', description: 'Your avatar has been updated.' });
            } else {
                throw new Error(data.error?.message || 'Failed to upload image.');
            }
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
        } finally {
            setIsUploading(false);
            setAvatarFile(null);
        }
    };
    
    const handleGenerateAvatar = async (style: 'Pixel' | 'Anime' | 'Cartoon') => {
        if (!userProfile?.avatarUrl || !userProfileRef) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please upload a base image first.' });
            return;
        }
        setIsGeneratingAvatar(true);
        toast({ title: `Generating ${style} Avatar...`, description: 'This may take a moment.' });
        
        try {
            // Need to fetch the image and convert to data URI for the AI model
            const response = await fetch(userProfile.avatarUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64data = reader.result as string;
                const result = await generateAvatar({ imageDataUri: base64data, style });
                updateDocumentNonBlocking(userProfileRef, { avatarUrl: result.imageUrl });
                toast({ title: 'Success!', description: `Your new ${style} avatar is ready.` });
                setIsGeneratingAvatar(false);
            };
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
            setIsGeneratingAvatar(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userProfileRef || !userProfile) return;

        setIsUpdating(true);

        const updateData: Partial<UserProfile> = {};
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
    
    const currentXP = userProfile?.xp || 0;
    const currentLevel = userProfile?.level || 1;
    const progress = (currentXP / (XP_PER_LEVEL * currentLevel)) * 100;

    return (
        <div className="container mx-auto max-w-4xl p-4 md:p-8">
            <Button variant="outline" onClick={() => router.push('/')} className="mb-8">
                &larr; Back to Game
            </Button>
            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>My Avatar</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden border-2 border-primary">
                                <Image 
                                    src={userProfile?.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user.uid}`}
                                    alt="User Avatar"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <Input 
                                id="avatarFile"
                                type="file"
                                accept="image/*"
                                onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                                disabled={isUploading || isGeneratingAvatar}
                            />
                            <Button onClick={handleAvatarUpload} disabled={!avatarFile || isUploading || isGeneratingAvatar} className="w-full">
                                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Upload Picture
                            </Button>
                             <div className="flex gap-2 justify-center">
                                <Button size="sm" variant="secondary" onClick={() => handleGenerateAvatar('Pixel')} disabled={!userProfile?.avatarUrl || isGeneratingAvatar || isUploading}>Pixel</Button>
                                <Button size="sm" variant="secondary" onClick={() => handleGenerateAvatar('Anime')} disabled={!userProfile?.avatarUrl || isGeneratingAvatar || isUploading}>Anime</Button>
                                <Button size="sm" variant="secondary" onClick={() => handleGenerateAvatar('Cartoon')} disabled={!userProfile?.avatarUrl || isGeneratingAvatar || isUploading}>Cartoon</Button>
                            </div>
                            {isGeneratingAvatar && <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Generating...</div>}
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Account</CardTitle>
                            <CardDescription>Manage your profile details and game settings.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label>Level {currentLevel}</Label>
                                <Progress value={progress} />
                                <p className="text-sm text-muted-foreground text-center">{currentXP} / {XP_PER_LEVEL * currentLevel} XP</p>
                            </div>
                            
                             <div className="space-y-2">
                                <Label>Achievements</Label>
                                <Achievements achievementIds={userProfile?.achievements} />
                            </div>

                            <form onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" value={userProfile?.email || ''} disabled />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="displayName">Username</Label>
                                    <div className="flex gap-2">
                                    <Input
                                        id="displayName"
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Enter your new username"
                                    />
                                     <Button type="button" variant="outline" onClick={handleGenerateUsername} disabled={isGeneratingUsername}>
                                        {isGeneratingUsername ? <Loader2 className="h-4 w-4 animate-spin" /> : 'AI'}
                                    </Button>
                                    </div>
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
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                    <div className="flex items-center space-x-2">
                                        <Switch id="bgm-mute" checked={isBgmMuted} onCheckedChange={handleBgmToggle} />
                                        <Label htmlFor="bgm-mute">Mute Background Music</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Switch id="sfx-mute" checked={areSfxMuted} onCheckedChange={handleSfxToggle} />
                                        <Label htmlFor="sfx-mute">Mute Sound Effects</Label>
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
            </div>
        </div>
    );
}

    