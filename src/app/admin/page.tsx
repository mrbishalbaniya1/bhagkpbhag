'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore, useUser, useCollection } from '@/firebase';
import { addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc } from 'firebase/firestore';
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

type GameLevelData = Omit<GameLevel, 'id'>;

const AdminPageContent: React.FC = () => {
    const { user, isUserLoading } = useUser();
    const auth = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLevel, setEditingLevel] = useState<GameLevel | null>(null);

    const gameLevelsRef = useMemoFirebase(() => firestore ? collection(firestore, 'game_levels') : null, [firestore]);
    const { data: gameLevels, isLoading: levelsLoading } = useCollection<GameLevel>(gameLevelsRef);
    
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
                addDocumentNonBlocking(collection(firestore, 'game_levels'), { ...formData, id: newLevelId });
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
    
    const handleDelete = (levelId: string) => {
        if (!firestore) return;
        const levelRef = doc(firestore, 'game_levels', levelId);
        deleteDocumentNonBlocking(levelRef);
        toast({ title: 'Success', description: 'Game level deleted.' });
    };

    if (isUserLoading || levelsLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!user) {
        // This is a fallback, the useEffect above should handle redirection.
        return null;
    }


    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Admin Panel</h1>
                <Button onClick={() => auth?.signOut()}>Sign Out</Button>
            </header>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button onClick={() => setEditingLevel(null)}>Add New Level</Button>
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
                                        <Button variant="destructive" size="sm" onClick={() => handleDelete(level.id)}><Trash2 size={16} /></Button>
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

// This wrapper component is necessary to avoid issues with Next.js's new `searchParams` handling.
// The page itself can't be a client component if it receives searchParams, but the content can.
const AdminPage = () => {
    return <AdminPageContent />;
}

export default AdminPage;
