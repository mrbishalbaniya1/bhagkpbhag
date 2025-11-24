
'use client';

import React, { useState } from 'react';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface GameEvent {
    id: string;
    score: number;
    difficulty: string;
    timestamp: {
        seconds: number;
        nanoseconds: number;
    };
    userId: string;
    // Let's assume we might add event types later
    eventType?: 'game_over' | 'powerup_collected'; 
    eventDetails?: any;
}

const AnalyticsPage = () => {
    const { isAdmin, isUserLoading } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const [live, setLive] = useState(true);
    
    const gameEventsRef = useMemoFirebase(
        () => firestore && isAdmin 
            ? query(collection(firestore, 'game_events'), orderBy('timestamp', 'desc'), limit(50))
            : null,
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
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
                <div className="flex items-center gap-2">
                    <Badge variant={live ? 'default' : 'outline'} className="bg-green-500 text-white">
                        <span className="relative flex h-2 w-2 mr-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                        </span>
                        Live
                    </Badge>
                </div>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>Real-Time Game Events</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>User ID</TableHead>
                                <TableHead>Difficulty</TableHead>
                                <TableHead className="text-right">Score</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {gameEvents && gameEvents.length > 0 ? (
                                gameEvents.map(event => (
                                    <TableRow key={event.id} className="animate-in fade-in-0">
                                        <TableCell>{formatDate(event.timestamp)}</TableCell>
                                        <TableCell className="font-mono text-xs">{event.userId.substring(0, 10)}...</TableCell>
                                        <TableCell className="capitalize">{event.difficulty}</TableCell>
                                        <TableCell className="text-right font-bold">{event.score}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24">Waiting for game events...</TableCell>
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

    