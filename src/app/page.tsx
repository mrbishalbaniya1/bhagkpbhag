"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { getPlaceholderImages } from '@/lib/placeholder-images';
import { type Level, type Player, type Pipe } from '@/lib/game-config';
import { Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection } from '@/firebase';
import { collection } from 'firebase/firestore';
import Link from 'next/link';
import { useMemoFirebase } from '@/firebase/provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function GamePage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const gameLevelsRef = useMemoFirebase(() => firestore ? collection(firestore, 'game_levels') : null, [firestore]);
    const { data: gameLevels, isLoading: levelsLoading } = useCollection<any>(gameLevelsRef);

    const [gameState, setGameState] = useState<'loading' | 'ready' | 'playing' | 'over'>('loading');
    const [currentLevel, setCurrentLevel] = useState<any | null>(null);
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameLoopRef = useRef<number>();
    
    const playerRef = useRef<Player>({ x: 120, y: 200, w: 60, h: 45, vel: 0 });
    const pipesRef = useRef<Pipe[]>([]);
    const frameRef = useRef(0);
    const bgXRef = useRef(0);

    const bgImgRef = useRef<HTMLImageElement>();
    const pipeImgRef = useRef<HTMLImageElement>();
    const playerImgRef = useRef<HTMLImageElement>();

    useEffect(() => {
        if (gameLevels && gameLevels.length > 0 && !currentLevel) {
            setCurrentLevel(gameLevels.find(l => l.name === 'easy') || gameLevels[0]);
        }
    }, [gameLevels, currentLevel]);

    useEffect(() => {
        const storedHigh = localStorage.getItem("runKrishnaRun_high") || "0";
        setHighScore(parseInt(storedHigh, 10));

        const placeholderImages = getPlaceholderImages();
        const bg = placeholderImages.find(p => p.id === 'game-bg');
        const pipe = placeholderImages.find(p => p.id === 'game-pipe');
        const player = placeholderImages.find(p => p.id === 'game-player');

        if (!bg || !pipe || !player) {
            console.error("Game assets not found in placeholder images.");
            return;
        }

        const loadImages = async () => {
            const bgImg = new Image();
            bgImg.src = bg.imageUrl;
            const pipeImg = new Image();
            pipeImg.src = pipe.imageUrl;
            const playerImg = new Image();
            playerImg.src = player.imageUrl;
            
            try {
                await Promise.all([
                    bgImg.decode(),
                    pipeImg.decode(),
                    playerImg.decode(),
                ]);
                bgImgRef.current = bgImg;
                pipeImgRef.current = pipeImg;
                playerImgRef.current = playerImg;
                setGameState('ready');
            } catch (error) {
                console.error("Failed to load game images", error);
            }
        };
        loadImages();
    }, []);

    const resetGame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const ch = canvas.height / dpr;
        
        const playerW = Math.min(120, (canvas.width / dpr) * 0.12);
        playerRef.current = {
            x: 120,
            y: ch / 2,
            w: playerW,
            h: playerW * 0.75,
            vel: 0,
        };

        pipesRef.current = [];
        frameRef.current = 0;
        setScore(0);
    }, []);
    
    const startGame = useCallback(() => {
        if (!currentLevel) return;
        resetGame();
        setGameState('playing');
    }, [resetGame, currentLevel]);

    const endGame = useCallback(() => {
        setGameState('over');
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem("runKrishnaRun_high", score.toString());
        }
    }, [score, highScore]);
    
    const jump = useCallback(() => {
        if (!currentLevel) return;
        if (gameState === 'playing') {
            playerRef.current.vel = currentLevel.lift;
        } else if (gameState === 'ready') {
            startGame();
            playerRef.current.vel = currentLevel.lift;
        }
    }, [gameState, currentLevel, startGame]);

    const gameLoop = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImgRef.current || !pipeImgRef.current || !playerImgRef.current || !currentLevel) return;
        
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        const L = currentLevel;

        // Update logic
        playerRef.current.vel += L.gravity;
        playerRef.current.y += playerRef.current.vel;
        
        if (playerRef.current.y < 0 || playerRef.current.y + playerRef.current.h > ch) {
            endGame();
        }

        const rectCol = (ax:number,ay:number,aw:number,ah:number,bx:number,by:number,bw:number,bh:number) => {
            return (ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by);
        }

        pipesRef.current.forEach(p => {
            p.x -= p.speed;
            if (
                rectCol(playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h, p.x, 0, p.w, p.top) ||
                rectCol(playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h, p.x, ch - p.bottom, p.w, p.bottom)
            ) {
                endGame();
            }
            if (!p.passed && p.x + p.w < playerRef.current.x) {
                p.passed = true;
                setScore(s => s + 1);
            }
        });

        pipesRef.current = pipesRef.current.filter(p => p.x + p.w > -40);

        frameRef.current++;
        if (frameRef.current % L.spawnRate === 0) {
            const gap = L.gap;
            const minTop = 90;
            const maxTop = ch - gap - 120;
            const topHeight = Math.floor(minTop + Math.random() * (maxTop - minTop));
            const pipeW = Math.min(140, Math.max(60, cw * 0.12));

            pipesRef.current.push({
                x: cw + 30,
                w: pipeW,
                top: topHeight,
                bottom: ch - (topHeight + gap),
                speed: L.speed,
                passed: false,
            });
        }
        
        // Drawing logic
        ctx.clearRect(0, 0, cw, ch);
        
        const scale = Math.max(cw / bgImgRef.current.width, ch / bgImgRef.current.height);
        const sw = bgImgRef.current.width * scale;
        const sh = bgImgRef.current.height * scale;
        bgXRef.current -= 0.3;
        if (bgXRef.current <= -sw) bgXRef.current = 0;
        ctx.drawImage(bgImgRef.current, bgXRef.current, 0, sw, sh);
        ctx.drawImage(bgImgRef.current, bgXRef.current + sw, 0, sw, sh);

        pipesRef.current.forEach(p => {
            ctx.drawImage(pipeImgRef.current!, p.x, 0, p.w, p.top);
            ctx.drawImage(pipeImgRef.current!, p.x, ch - p.bottom, p.w, p.bottom);
        });

        ctx.save();
        ctx.translate(playerRef.current.x + playerRef.current.w / 2, playerRef.current.y + playerRef.current.h / 2);
        ctx.rotate(Math.min(playerRef.current.vel / 40, 0.4));
        ctx.drawImage(playerImgRef.current!, -playerRef.current.w / 2, -playerRef.current.h / 2, playerRef.current.w, playerRef.current.h);
        ctx.restore();

        gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, [currentLevel, endGame]);

    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            const ctx = canvas.getContext('2d');
            ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (gameState === 'playing') {
            gameLoopRef.current = requestAnimationFrame(gameLoop);
        }
        return () => {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
        };
    }, [gameState, gameLoop]);

    useEffect(() => {
        const handleInput = (e: Event) => {
            e.preventDefault();
            if (e instanceof KeyboardEvent && e.key !== ' ') return;
            jump();
        };
        
        window.addEventListener('pointerdown', handleInput);
        window.addEventListener('keydown', handleInput);

        return () => {
            window.removeEventListener('pointerdown', handleInput);
            window.removeEventListener('keydown', handleInput);
        };
    }, [jump]);

    const handleLevelChange = (levelId: string) => {
        const newLevel = gameLevels?.find(l => l.id === levelId);
        if (newLevel) {
            setCurrentLevel(newLevel);
            if(gameState === 'playing' || gameState === 'over') {
               startGame();
            }
        }
    }

    if (levelsLoading || gameState === 'loading' || !currentLevel) {
        return null;
    }

    return (
        <main className="relative w-screen h-screen overflow-hidden bg-background font-body select-none">
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            
            {gameState !== 'loading' && (
                <>
                    <div className="absolute top-4 left-4 z-10 flex gap-2 items-center">
                         <Select onValueChange={handleLevelChange} defaultValue={currentLevel.id}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent>
                                {gameLevels?.map(l => (
                                    <SelectItem key={l.id} value={l.id}>
                                        <span className="capitalize">{l.name}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {user && <Link href="/admin"><Button variant="secondary">Admin</Button></Link>}
                    </div>
                    <div className="absolute top-4 right-4 z-10 text-right text-foreground drop-shadow-lg">
                        <div className="text-3xl font-bold">{score}</div>
                        <div className="text-sm">High: {highScore}</div>
                    </div>
                </>
            )}
            
            {gameState === 'ready' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/50 text-foreground text-center p-4">
                    <h1 className="text-5xl font-bold font-headline drop-shadow-xl mb-4 text-primary">Run Krishna Run</h1>
                    <p className="text-xl font-semibold animate-pulse">Tap or Press Space to Start</p>
                </div>
            )}

            {gameState === 'over' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80">
                    <div className="bg-card/90 p-8 rounded-xl shadow-2xl text-center border">
                        <h2 className="text-4xl font-bold text-destructive mb-2">Game Over</h2>
                        <p className="text-lg text-muted-foreground mb-6">Your score: <span className="font-bold text-foreground">{score}</span></p>
                        <Button size="lg" variant="destructive" onClick={startGame}>
                            Restart
                        </Button>
                    </div>
                </div>
            )}
        </main>
    );
}
