
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { getPlaceholderImages } from '@/lib/placeholder-images';
import { type GameLevel, type Player, type Pipe, defaultGameLevels } from '@/lib/game-config';
import { Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import Link from 'next/link';
import { useMemoFirebase } from '@/firebase/provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GameAsset {
    name: string;
    url: string;
}

interface GameAssets {
    bg?: GameAsset;
    player?: GameAsset;
    pipes?: GameAsset[];
}

export default function GamePage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const gameLevelsRef = useMemoFirebase(() => firestore ? collection(firestore, 'game_levels') : null, [firestore]);
    const { data: firebaseLevels, isLoading: levelsLoading } = useCollection<GameLevel>(gameLevelsRef);

    const gameAssetsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'game_assets') : null, [firestore]);
    const { data: gameAssets, isLoading: assetsLoading } = useDoc<GameAssets>(gameAssetsRef);

    const [imagesLoaded, setImagesLoaded] = useState(false);
    const [gameState, setGameState] = useState<'loading' | 'ready' | 'playing' | 'over'>('loading');
    const [gameLevels, setGameLevels] = useState<GameLevel[]>(defaultGameLevels);
    const [currentLevel, setCurrentLevel] = useState<GameLevel>(defaultGameLevels[0]);
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameLoopRef = useRef<number>();
    
    const playerRef = useRef<Player>({ x: 120, y: 200, w: 60, h: 45, vel: 0 });
    const pipesRef = useRef<(Pipe & { img: HTMLImageElement })[]>([]);
    const frameRef = useRef(0);
    const bgXRef = useRef(0);

    const bgImgRef = useRef<HTMLImageElement>();
    const pipeImgsRef = useRef<HTMLImageElement[]>([]);
    const playerImgRef = useRef<HTMLImageElement>();

    useEffect(() => {
        if (assetsLoading) return;

        const storedHigh = typeof window !== 'undefined' ? localStorage.getItem("runKrishnaRun_high") || "0" : "0";
        setHighScore(parseInt(storedHigh, 10));

        const placeholderImages = getPlaceholderImages();
        const defaultBg = placeholderImages.find(p => p.id === 'game-bg');
        const defaultPipe = placeholderImages.find(p => p.id === 'game-pipe');
        const defaultPlayer = placeholderImages.find(p => p.id === 'game-player');

        const bgUrl = gameAssets?.bg?.url || defaultBg?.imageUrl;
        const playerUrl = gameAssets?.player?.url || defaultPlayer?.imageUrl;
        const pipeUrls = gameAssets?.pipes && gameAssets.pipes.length > 0
            ? gameAssets.pipes.map(p => p.url)
            : [defaultPipe?.imageUrl].filter((url): url is string => !!url);

        if (!bgUrl || !playerUrl || pipeUrls.length === 0) {
            console.error("Some game assets could not be loaded.");
            return;
        }

        let isMounted = true;
        setImagesLoaded(false);
        
        const loadImages = async () => {
            try {
                const bgImg = new Image();
                bgImg.src = bgUrl;

                const playerImg = new Image();
                playerImg.src = playerUrl;
                
                const pipeImgPromises = pipeUrls.map(url => {
                    const img = new Image();
                    img.src = url;
                    return img.decode();
                });

                await Promise.all([
                    bgImg.decode(),
                    playerImg.decode(),
                    ...pipeImgPromises
                ]);

                if (isMounted) {
                    bgImgRef.current = bgImg;
                    playerImgRef.current = playerImg;
                    pipeImgsRef.current = pipeUrls.map(url => {
                        const img = new Image();
                        img.src = url;
                        return img;
                    });
                    setImagesLoaded(true);
                }
            } catch (error) {
                console.error("Failed to load game images", error);
            }
        };
        loadImages();

        return () => {
            isMounted = false;
        };
    }, [gameAssets, assetsLoading]);


    useEffect(() => {
        if (firebaseLevels) {
            const combinedLevels = [...defaultGameLevels];
            const defaultLevelIds = new Set(defaultGameLevels.map(l => l.id));

            firebaseLevels.forEach(fbLevel => {
                if (!defaultLevelIds.has(fbLevel.id)) {
                    combinedLevels.push(fbLevel);
                } else {
                    // Update existing default level with remote data
                    const index = combinedLevels.findIndex(l => l.id === fbLevel.id);
                    if (index !== -1) {
                        combinedLevels[index] = fbLevel;
                    }
                }
            });
            
            setGameLevels(combinedLevels);
            
            const newCurrentLevel = combinedLevels.find(l => l.id === currentLevel.id) || combinedLevels[0];
            setCurrentLevel(newCurrentLevel);
        }
    }, [firebaseLevels, currentLevel.id]);


    useEffect(() => {
        if (!levelsLoading && !assetsLoading) {
            setGameState('ready');
        } else {
            setGameState('loading');
        }
    }, [levelsLoading, assetsLoading]);

    useEffect(() => {
        if(imagesLoaded && (gameState === 'loading' || gameState === 'ready')){
            resetGame();
            setGameState('ready');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imagesLoaded]);


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
        if (!currentLevel || !imagesLoaded) return;
        resetGame();
        setGameState('playing');
    }, [resetGame, currentLevel, imagesLoaded]);

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
        } else if ((gameState === 'ready' || gameState === 'over') && imagesLoaded) {
            startGame();
            playerRef.current.vel = currentLevel.lift;
        }
    }, [gameState, currentLevel, startGame, imagesLoaded]);

    const gameLoop = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImgRef.current || !playerImgRef.current || pipeImgsRef.current.length === 0 || !currentLevel) return;
        
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        const L = currentLevel;

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
            const randomPipeImg = pipeImgsRef.current[Math.floor(Math.random() * pipeImgsRef.current.length)];

            pipesRef.current.push({
                x: cw + 30,
                w: pipeW,
                top: topHeight,
                bottom: ch - (topHeight + gap),
                speed: L.speed,
                passed: false,
                img: randomPipeImg,
            });
        }
        
        ctx.clearRect(0, 0, cw, ch);
        
        const scale = Math.max(cw / bgImgRef.current.width, ch / bgImgRef.current.height);
        const sw = bgImgRef.current.width * scale;
        const sh = bgImgRef.current.height * scale;
        bgXRef.current -= 0.3;
        if (bgXRef.current <= -sw) bgXRef.current = 0;
        ctx.drawImage(bgImgRef.current, bgXRef.current, 0, sw, sh);
        ctx.drawImage(bgImgRef.current, bgXRef.current + sw, 0, sw, sh);

        pipesRef.current.forEach(p => {
            ctx.drawImage(p.img, p.x, 0, p.w, p.top);
            ctx.drawImage(p.img, p.x, ch - p.bottom, p.w, p.bottom);
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
            if (gameState !== 'playing') {
                resetGame();
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [gameState, resetGame]);

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
            if (e.key && e.key !== ' ' && e.key !== 'Enter') return;
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
               resetGame();
               setGameState('ready');
            }
        }
    }

    if (gameState === 'loading' || !imagesLoaded) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <main className="relative w-screen h-screen overflow-hidden bg-background font-body select-none">
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            
            {gameState !== 'loading' && (
                <>
                    <div className="absolute top-4 left-4 z-10">
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

            {gameState === 'over' && currentLevel && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80">
                    <div className="bg-card/90 p-8 rounded-xl shadow-2xl text-center border w-full max-w-sm">
                        <h2 className="text-4xl font-bold text-destructive mb-2">Game Over</h2>
                        <p className="text-lg text-muted-foreground mb-4">Your score: <span className="font-bold text-foreground">{score}</span></p>
                        
                        <div className="space-y-4">
                             <Select onValueChange={handleLevelChange} defaultValue={currentLevel.id}>
                                <SelectTrigger>
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
                            <Button size="lg" variant="primary" onClick={jump} className="w-full">
                                Restart
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
