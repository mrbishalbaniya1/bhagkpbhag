'use client';

import React from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface GameEvent {
    id: string;
    score: number;
    difficulty: string;
    timestamp: {
        seconds: number;
        nanoseconds: number;
    };
}

const AnalyticsPage = () => {
    const { isAdmin, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    
    const gameEventsRef = useMemoFirebase(
        () => firestore && isAdmin ? collection(firestore, 'game_events') : null,
        [firestore, isAdmin]
    );

    const { data: gameEvents, isLoading } = useCollection<GameEvent>(gameEventsRef);

    if (isUserLoading || isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
             <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
                <p className="text-2xl text-destructive font-bold">Access Denied</p>
                <p className="text-muted-foreground mt-2">You do not have permission to view this page.</p>
                <Button onClick={() => router.push('/')} className="mt-6">Go to Homepage</Button>
            </div>
        )
    }
    
    const formatDate = (timestamp: GameEvent['timestamp']) => {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="container mx-auto p-4 md:p-8">
            <h1 className="text-3xl font-bold mb-8">Analytics Dashboard</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Recent Game Events</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Difficulty</TableHead>
                                <TableHead>Score</TableHead>
                                <TableHead className="text-right">Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {gameEvents && gameEvents.length > 0 ? (
                                gameEvents.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds).map(event => (
                                    <TableRow key={event.id}>
                                        <TableCell className="capitalize">{event.difficulty}</TableCell>
                                        <TableCell>{event.score}</TableCell>
                                        <TableCell className="text-right">{formatDate(event.timestamp)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center">No game events yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default AnalyticsPage;
