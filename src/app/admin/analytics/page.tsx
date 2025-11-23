'use client';

import React from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';

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
    const firestore = useFirestore();
    
    const gameEventsRef = useMemoFirebase(
        () => firestore ? collection(firestore, 'game_events') : null,
        [firestore]
    );

    const { data: gameEvents, isLoading } = useCollection<GameEvent>(gameEventsRef);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
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