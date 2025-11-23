'use client';

import React, { useState, useEffect, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore, useUser, useCollection, useDoc, deleteDocumentNonBlocking } from '@/firebase';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { GameLevel } from '@/lib/game-config';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';
import Image from 'next/image';

type GameLevelData = Omit<GameLevel, 'id'>;

interface GameAsset {
    name: string;
    url: string;
}

interface GameAssets {
    bg?: GameAsset;
    player?: GameAsset;
    pipes?: GameAsset[];
    bgMusic?: GameAsset;
    coin?: GameAsset;
    shield?: GameAsset;
    slowMo?: GameAsset;
    doubleScore?: GameAsset;
}

const AdminPageContent: React.FC = () => {
    const { user, isUserLoading } = useUser();
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLevel, setEditingLevel] = useState<GameLevel | null>(null);
    const [uploadingStates, setUploadingStates] = useState<{[key: string]: boolean}>({});

    const gameLevelsRef = useMemoFirebase(() => firestore ? collection(firestore, 'game_levels') : null, [firestore]);
    const { data: gameLevels, isLoading: levelsLoading } = useCollection<GameLevel>(gameLevelsRef);

    const gameAssetsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'game_assets') : null, [firestore]);
    const { data: gameAssets, isLoading: assetsLoading } = useDoc<GameAssets>(gameAssetsRef);

    const [formData, setFormData] = useState<GameLevelData>({
        name: '',
        gravity: 0,
        lift: 0,
        gap: 0,
        speed: 0,
        spawnRate: 0,
    });
    
    useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login');
        }
    }, [user, isUserLoading, router]);

    useEffect(() => {
        if (editingLevel) {
            setFormData({
                name: editingLevel.name,
                gravity: editingLevel.gravity,
                lift: editingLevel.lift,
                gap: editingLevel.gap,
                speed: editingLevel.speed,
                spawnRate: editingLevel.spawnRate,
            });
        } else {
             setFormData({
                name: '',
                gravity: 0,
                lift: 0,
                gap: 0,
                speed: 0,
                spawnRate: 0,
            });
        }
    }, [editingLevel]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'name' ? value : Number(value) }));
    };

    const handleFileChange = (assetId: keyof GameAssets) => async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !firestore || !gameAssetsRef) return;
        
        const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;

        if (!cloudName) {
            toast({ variant: 'destructive', title: 'Upload Error', description: 'Cloudinary cloud name is not configured.' });
            return;
        }

        setUploadingStates(prev => ({ ...prev, [assetId]: true }));
        toast({ title: `Uploading ${assetId}...`, description: 'Please wait.' });

        const cloudinaryFormData = new FormData();
        cloudinaryFormData.append('file', file);
        cloudinaryFormData.append('upload_preset', 'ml_default');
        if (apiKey) {
            cloudinaryFormData.append('api_key', apiKey);
        }
        
        const resourceType = assetId === 'bgMusic' ? 'video' : 'image';

        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
                method: 'POST',
                body: cloudinaryFormData,
            });
            
            const cloudinaryData = await response.json();

            if (!response.ok || cloudinaryData.error) {
                 const errorMessage = cloudinaryData?.error?.message || `Failed to upload to Cloudinary. Status: ${response.status}`;
                 throw new Error(errorMessage);
            }
            
            const newAsset = { name: file.name, url: cloudinaryData.secure_url };
            
            const docSnap = await getDoc(gameAssetsRef);
            if (docSnap.exists()) {
                if (assetId === 'pipes') {
                    updateDocumentNonBlocking(gameAssetsRef, { pipes: arrayUnion(newAsset) });
                } else {
                    updateDocumentNonBlocking(gameAssetsRef, { [assetId]: newAsset });
                }
            } else {
                const initialData = assetId === 'pipes' ? { pipes: [newAsset] } : { [assetId]: newAsset };
                setDocumentNonBlocking(gameAssetsRef, initialData, {});
            }

            toast({ title: 'Success', description: `'${file.name}' uploaded for ${assetId}.` });

        } catch (error: any) {
            console.error("Cloudinary upload error:", error);
            toast({ variant: 'destructive', title: 'Upload Error', description: error.message || `Could not upload ${assetId}.` });
        } finally {
            setUploadingStates(prev => ({ ...prev, [assetId]: false }));
            const input = e.target as HTMLInputElement;
            if (input) input.value = '';
        }
    };
    
    const handleDeletePipeImage = (pipeAsset: GameAsset) => {
        if (!firestore || !gameAssetsRef) return;
        updateDocumentNonBlocking(gameAssetsRef, {
            pipes: arrayRemove(pipeAsset)
        });
        toast({ title: 'Success', description: `Pipe image '${pipeAsset.name}' deleted.` });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore) return;
        setIsSubmitting(true);

        try {
            if (editingLevel) {
                const levelRef = doc(firestore, 'game_levels', editingLevel.id);
                updateDocumentNonBlocking(levelRef, formData);
                toast({ title: 'Success', description: 'Game level updated successfully.' });
            } else {
                const newLevelId = formData.name.toLowerCase().replace(/\s/g, '-');
                 if (!newLevelId) {
                    toast({ variant: 'destructive', title: 'Error', description: 'Level name cannot be empty.' });
                    setIsSubmitting(false);
                    return;
                }
                const newLevelRef = doc(firestore, 'game_levels', newLevelId);
                const newLevelData = { ...formData };
                setDocumentNonBlocking(newLevelRef, newLevelData, { merge: true });
                toast({ title: 'Success', description: 'Game level added successfully.' });
            }
            setIsDialogOpen(false);
            setEditingLevel(null);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteLevel = (levelId: string) => {
        if (!firestore) return;
        const levelRef = doc(firestore, 'game_levels', levelId);
        deleteDocumentNonBlocking(levelRef);
        toast({ title: 'Success', description: 'Game level deleted.' });
    };

    const AssetUploadCard: React.FC<{assetId: keyof GameAssets, label: string, isUploading: boolean}> = ({ assetId, label, isUploading }) => (
        <div className="space-y-2">
            <Label htmlFor={`${assetId}File`} className="capitalize text-lg">{label}</Label>
            <div className='relative w-full h-40'>
                {gameAssets && gameAssets[assetId] && !Array.isArray(gameAssets[assetId]) ? (
                    <Image src={(gameAssets[assetId] as GameAsset).url} alt={`Current ${label}`} fill className="rounded-md border object-cover" />
                ) : <div className="w-full h-full flex items-center justify-center bg-muted rounded-md"><p className="text-sm text-muted-foreground">No custom image.</p></div>}
            </div>
            <Input id={`${assetId}File`} type="file" accept="image/*" onChange={handleFileChange(assetId)} disabled={isUploading}/>
            {isUploading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Uploading...</div>}
        </div>
    );

    if (isUserLoading || levelsLoading || assetsLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user) {
        return null;
    }

    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Admin Panel</h1>
                <Button onClick={() => auth?.signOut()}>Sign Out</Button>
            </header>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Game Visual Assets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-8">
                        <AssetUploadCard assetId="bg" label="Background Image" isUploading={!!uploadingStates['bg']} />
                        <AssetUploadCard assetId="player" label="Player Image" isUploading={!!uploadingStates['player']} />

                        {/* Pipe Images */}
                        <div className="space-y-4">
                             <Label htmlFor="pipesFile" className="text-lg">Pipe Images</Label>
                             <Input id="pipesFile" type="file" accept="image/*" onChange={handleFileChange('pipes')} disabled={uploadingStates['pipes']}/>
                            {uploadingStates['pipes'] && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Uploading new pipe...</div>}

                            <div className="space-y-4">
                                {gameAssets?.pipes && gameAssets.pipes.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {gameAssets.pipes.map((pipe, index) => (
                                             <div key={index} className="relative group">
                                                <div className="relative w-full h-24">
                                                    <Image src={pipe.url} alt={pipe.name} fill className="rounded-md border object-cover" />
                                                </div>
                                                <Button
                                                    variant="destructive"
                                                    size="icon"
                                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDeletePipeImage(pipe)}>
                                                    <Trash2 size={14} />
                                                </Button>
                                             </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="w-full h-24 flex items-center justify-center bg-muted rounded-md">
                                        <p className="text-sm text-muted-foreground">No pipe images.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Collectibles & Power-ups</CardTitle>
                </CardHeader>
                 <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-4 gap-8">
                        <AssetUploadCard assetId="coin" label="Coin" isUploading={!!uploadingStates['coin']} />
                        <AssetUploadCard assetId="shield" label="Shield" isUploading={!!uploadingStates['shield']} />
                        <AssetUploadCard assetId="slowMo" label="Slow-Mo" isUploading={!!uploadingStates['slowMo']} />
                        <AssetUploadCard assetId="doubleScore" label="Double Score" isUploading={!!uploadingStates['doubleScore']} />
                    </div>
                 </CardContent>
            </Card>

             <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Game Audio Assets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Background Music */}
                        <div className="space-y-2">
                             <Label htmlFor="bgMusicFile" className="text-lg">Background Music</Label>
                             {gameAssets?.bgMusic?.url && (
                                 <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground truncate">Current: {gameAssets.bgMusic.name}</p>
                                    <audio src={gameAssets.bgMusic.url} controls className="w-full" />
                                 </div>
                             )}
                             <Input id="bgMusicFile" type="file" accept="audio/*" onChange={handleFileChange('bgMusic')} disabled={uploadingStates['bgMusic']}/>
                            {uploadingStates['bgMusic'] && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Uploading...</div>}
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button onClick={() => { setEditingLevel(null); }}>Add New Level</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingLevel ? 'Edit Game Level' : 'Add New Game Level'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                        {Object.keys(formData).map(key => (
                            <div className="grid grid-cols-4 items-center gap-4" key={key}>
                                <Label htmlFor={key} className="text-right capitalize">{key.replace(/([A-Z])/g, ' $1')}</Label>
                                <Input
                                    id={key}
                                    name={key}
                                    value={formData[key as keyof GameLevelData]}
                                    onChange={handleInputChange}
                                    type={key === 'name' ? 'text' : 'number'}
                                    className="col-span-3"
                                    required
                                />
                            </div>
                        ))}
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'Save changes'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Game Levels</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Gravity</TableHead>
                                <TableHead>Lift</TableHead>
                                <TableHead>Gap</TableHead>
                                <TableHead>Speed</TableHead>
                                <TableHead>Spawn Rate</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {gameLevels && gameLevels.map(level => (
                                <TableRow key={level.id}>
                                    <TableCell>{level.name}</TableCell>
                                    <TableCell>{level.gravity}</TableCell>
                                    <TableCell>{level.lift}</TableCell>
                                    <TableCell>{level.gap}</TableCell>
                                    <TableCell>{level.speed}</TableCell>
                                    <TableCell>{level.spawnRate}</TableCell>
                                    <TableCell className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => { setEditingLevel(level); setIsDialogOpen(true); }}>Edit</Button>
                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteLevel(level.id)}><Trash2 size={16} /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

const AdminPage = () => {
    return <AdminPageContent />;
}

export default AdminPage;
