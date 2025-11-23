
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { getPlaceholderImages } from '@/lib/placeholder-images';
import { type GameLevel, type Player, type Pipe, defaultGameLevels, type Collectible, type Particle, type FloatingText } from '@/lib/game-config';
import { Loader2, Music, Music2, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useUser, useFirestore, useCollection, useDoc } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { useMemoFirebase } from '@/firebase/provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    jumpSound?: GameAsset;
    collisionSound?: GameAsset;
}

type GameMode = 'classic' | 'timeAttack' | 'zen' | 'insane';

interface LeaderboardEntry {
    score: number;
    date: string;
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
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [coins, setCoins] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    // Game Modes
    const [gameMode, setGameMode] = useState<GameMode>('classic');
    const [timeLeft, setTimeLeft] = useState(60);
    const timeAttackIntervalRef = useRef<NodeJS.Timeout>();


    // Power-up states
    const [hasShield, setHasShield] = useState(false);
    const [slowMo, setSlowMo] = useState<{active: boolean, timer: number}>({ active: false, timer: 0 });
    const [doubleScore, setDoubleScore] = useState<{active: boolean, timer: number}>({ active: false, timer: 0 });
    const POWERUP_DURATION = 300; // a value in frames, e.g., 300 frames is ~5 seconds at 60fps

    // Dynamic Obstacles State
    const windRef = useRef({ direction: 1, strength: 0.1, timer: 0 });
    const particlesRef = useRef<Particle[]>([]);
    const floatingTextsRef = useRef<FloatingText[]>([]);


    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameLoopRef = useRef<number>();
    const audioRef = useRef<HTMLAudioElement>(null);
    const jumpAudioRef = useRef<HTMLAudioElement>(null);
    const collisionAudioRef = useRef<HTMLAudioElement>(null);

    
    const playerRef = useRef<Player>({ x: 120, y: 200, w: 60, h: 45, vel: 0 });
    const pipesRef = useRef<(Pipe & { img: HTMLImageElement })[]>([]);
    const collectiblesRef = useRef<(Collectible & { img: HTMLImageElement })[]>([]);
    const frameRef = useRef(0);
    const bgXRef = useRef(0);

    const bgImgRef = useRef<HTMLImageElement>();
    const pipeImgsRef = useRef<HTMLImageElement[]>([]);
    const playerImgRef = useRef<HTMLImageElement>();
    const collectibleImgsRef = useRef<{[key: string]: HTMLImageElement}>({});


    useEffect(() => {
        if (assetsLoading) return;

        if (typeof window !== 'undefined') {
            const storedHigh = localStorage.getItem("runKrishnaRun_high") || "0";
            setHighScore(parseInt(storedHigh, 10));
            const storedLeaderboard = localStorage.getItem("runKrishnaRun_leaderboard");
            if (storedLeaderboard) {
                setLeaderboard(JSON.parse(storedLeaderboard));
            }
        }


        const placeholderImages = getPlaceholderImages();
        
        const defaultAssets = {
            bg: placeholderImages.find(p => p.id === 'game-bg')?.imageUrl,
            player: placeholderImages.find(p => p.id === 'game-player')?.imageUrl,
            pipe: placeholderImages.find(p => p.id === 'game-pipe')?.imageUrl,
            coin: placeholderImages.find(p => p.id === 'game-coin')?.imageUrl,
            shield: placeholderImages.find(p => p.id === 'game-shield')?.imageUrl,
            slowMo: placeholderImages.find(p => p.id === 'game-slowMo')?.imageUrl,
            doubleScore: placeholderImages.find(p => p.id === 'game-doubleScore')?.imageUrl,
        }

        const bgUrl = gameAssets?.bg?.url || defaultAssets.bg;
        const playerUrl = gameAssets?.player?.url || defaultAssets.player;
        const pipeUrls = gameAssets?.pipes && gameAssets.pipes.length > 0
            ? gameAssets.pipes.map(p => p.url)
            : [defaultAssets.pipe].filter((url): url is string => !!url);

        const collectibleAssetUrls = {
            coin: gameAssets?.coin?.url || defaultAssets.coin,
            shield: gameAssets?.shield?.url || defaultAssets.shield,
            slowMo: gameAssets?.slowMo?.url || defaultAssets.slowMo,
            doubleScore: gameAssets?.doubleScore?.url || defaultAssets.doubleScore,
        }

        let isMounted = true;
        setImagesLoaded(false);
        
        const loadImages = async () => {
            try {
                const imagePromises: Promise<any>[] = [];

                const addImagePromise = (url: string | undefined, ref: React.MutableRefObject<HTMLImageElement | undefined>) => {
                    if (url) {
                        const img = new Image();
                        img.src = url;
                        ref.current = img;
                        imagePromises.push(img.decode());
                    }
                };

                 const addMultiImagePromise = (urls: string[], ref: React.MutableRefObject<HTMLImageElement[]>) => {
                    const imgs = urls.map(url => {
                        const img = new Image();
                        img.src = url;
                        return img;
                    });
                    ref.current = imgs;
                    imgs.forEach(img => imagePromises.push(img.decode()));
                };
                
                const addCollectibleImagePromises = (urls: {[key: string]: string | undefined}, ref: React.MutableRefObject<{[key: string]: HTMLImageElement}>) => {
                    for (const key in urls) {
                        const url = urls[key];
                        if (url) {
                            const img = new Image();
                            img.src = url;
                            ref.current[key] = img;
                            imagePromises.push(img.decode());
                        }
                    }
                }

                addImagePromise(bgUrl, bgImgRef);
                addImagePromise(playerUrl, playerImgRef);
                addMultiImagePromise(pipeUrls, pipeImgsRef);
                addCollectibleImagePromises(collectibleAssetUrls, collectibleImgsRef);

                await Promise.all(imagePromises);

                if (isMounted) {
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
                const existingIndex = combinedLevels.findIndex(l => l.id === fbLevel.id);
                if (existingIndex !== -1) {
                    // Update existing default level with remote data
                    combinedLevels[existingIndex] = fbLevel;
                } else {
                    // Add new custom level
                    combinedLevels.push(fbLevel);
                }
            });
            
            setGameLevels(combinedLevels);
            
            let newCurrentLevel = combinedLevels.find(l => l.id === currentLevel.id) || combinedLevels[0];
            if (gameMode === 'insane') {
                newCurrentLevel = combinedLevels.find(l => l.id === 'insane') || newCurrentLevel;
            }
            setCurrentLevel(newCurrentLevel);
        }
    }, [firebaseLevels, currentLevel.id, gameMode]);


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
        collectiblesRef.current = [];
        particlesRef.current = [];
        floatingTextsRef.current = [];
        frameRef.current = 0;
        windRef.current = { direction: 1, strength: 0.1, timer: 0 };
        setScore(0);
        setCoins(0);
        setHasShield(false);
        setSlowMo({ active: false, timer: 0 });
        setDoubleScore({ active: false, timer: 0 });
        setTimeLeft(60);
        if (timeAttackIntervalRef.current) clearInterval(timeAttackIntervalRef.current);
    }, []);
    
    const startGame = useCallback(() => {
        if (!currentLevel || !imagesLoaded) return;
        resetGame();
        setGameState('playing');
        audioRef.current?.play().catch(e => console.error("Audio play failed:", e));

        if (gameMode === 'timeAttack') {
            timeAttackIntervalRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timeAttackIntervalRef.current);
                        endGame();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    }, [resetGame, currentLevel, imagesLoaded, gameMode]);

    const updateLeaderboard = (newScore: number) => {
        const newEntry = { score: newScore, date: new Date().toLocaleDateString() };
        const updatedLeaderboard = [...leaderboard, newEntry]
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        setLeaderboard(updatedLeaderboard);
        localStorage.setItem("runKrishnaRun_leaderboard", JSON.stringify(updatedLeaderboard));
    };

    const endGame = useCallback(() => {
        setGameState('over');
        audioRef.current?.pause();
        collisionAudioRef.current?.play().catch(e => console.error("Audio play failed:", e));
        if (timeAttackIntervalRef.current) clearInterval(timeAttackIntervalRef.current);

        if (gameMode !== 'zen') {
             if (score > highScore) {
                setHighScore(score);
                localStorage.setItem("runKrishnaRun_high", score.toString());
            }
            updateLeaderboard(score);
        }
    }, [score, highScore, gameMode, leaderboard]);
    
    const createJumpParticles = useCallback(() => {
        for (let i = 0; i < 15; i++) {
            particlesRef.current.push({
                x: playerRef.current.x + playerRef.current.w / 2,
                y: playerRef.current.y + playerRef.current.h,
                size: Math.random() * 4 + 1,
                speedY: Math.random() * 2 + 1,
                speedX: (Math.random() - 0.5) * 4,
                alpha: 1,
            });
        }
    }, []);

    const createFloatingText = useCallback((text: string) => {
        floatingTextsRef.current.push({
            text,
            x: playerRef.current.x + playerRef.current.w / 2,
            y: playerRef.current.y,
            alpha: 1,
            vy: -2,
        });
    }, []);

    const jump = useCallback(() => {
        if (!currentLevel) return;
        if (gameState === 'playing') {
            playerRef.current.vel = currentLevel.lift;
            jumpAudioRef.current?.play().catch(e => console.error("Audio play failed:", e));
            createJumpParticles();
        } else if (gameState === 'ready' && imagesLoaded) {
            startGame();
            playerRef.current.vel = currentLevel.lift;
            jumpAudioRef.current?.play().catch(e => console.error("Audio play failed:", e));
            createJumpParticles();
        }
    }, [gameState, currentLevel, startGame, imagesLoaded, createJumpParticles]);

    const handlePowerUpTimers = useCallback(() => {
        if (slowMo.active) {
            setSlowMo(prev => {
                const newTimer = prev.timer - 1;
                if (newTimer <= 0) return { active: false, timer: 0 };
                return { ...prev, timer: newTimer };
            });
        }
        if (doubleScore.active) {
            setDoubleScore(prev => {
                const newTimer = prev.timer - 1;
                if (newTimer <= 0) return { active: false, timer: 0 };
                return { ...prev, timer: newTimer };
            });
        }
    }, [slowMo.active, doubleScore.active]);

    const gameLoop = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImgRef.current || !playerImgRef.current || pipeImgsRef.current.length === 0 || !currentLevel) return;
        
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        let L = { ...currentLevel };

        if (gameMode === 'insane') {
            const insaneLevel = gameLevels.find(l => l.id === 'insane');
            if (insaneLevel) L = insaneLevel;
        }

        // Handle power-up effects
        if (slowMo.active) {
            L.speed *= 0.5;
            L.spawnRate *= 1.5;
        }

        // Wind Effect
        windRef.current.timer--;
        if (windRef.current.timer <= 0) {
            windRef.current.direction *= -1;
            windRef.current.strength = Math.random() * 0.15 + 0.05; // Random strength
            windRef.current.timer = Math.random() * 300 + 100; // Random duration
        }
        playerRef.current.x += windRef.current.strength * windRef.current.direction * (slowMo.active ? 0.5 : 1);
        playerRef.current.x = Math.max(0, Math.min(playerRef.current.x, cw - playerRef.current.w));

        
        playerRef.current.vel += L.gravity;
        playerRef.current.y += playerRef.current.vel;
        
        if ((playerRef.current.y < 0 || playerRef.current.y + playerRef.current.h > ch) && gameMode !== 'zen') {
            if (hasShield) {
                setHasShield(false);
                playerRef.current.y = Math.max(0, Math.min(playerRef.current.y, ch - playerRef.current.h));
                playerRef.current.vel = 0;
            } else {
                endGame();
            }
        }

        const rectCol = (ax:number,ay:number,aw:number,ah:number,bx:number,by:number,bw:number,bh:number) => {
            return (ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by);
        }

        if (gameMode !== 'zen') {
            pipesRef.current.forEach(p => {
                p.x -= p.speed;

                // Oscillating pipes
                if (p.oscillate) {
                    p.yOffset += p.direction * 0.5; // Oscillation speed
                    if (p.yOffset > 50 || p.yOffset < -50) {
                        p.direction *= -1;
                    }
                }
                const topPipeY = 0 + (p.oscillate ? p.yOffset : 0);
                const bottomPipeY = ch - p.bottom + (p.oscillate ? p.yOffset : 0);

                if (
                    rectCol(playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h, p.x, topPipeY, p.w, p.top) ||
                    rectCol(playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h, p.x, bottomPipeY, p.w, p.bottom)
                ) {
                     if (hasShield) {
                        setHasShield(false);
                        // Effectively removes the pipe from collision checks
                        p.x = -p.w; 
                    } else {
                        endGame();
                    }
                }
                if (!p.passed && p.x + p.w < playerRef.current.x) {
                    p.passed = true;
                    const points = doubleScore.active ? 2 : 1;
                    setScore(s => s + points);
                    createFloatingText(`+${points}`);
                }
            });
        } else {
            pipesRef.current.forEach(p => { p.x -= p.speed });
        }
        
        collectiblesRef.current.forEach((c, i) => {
            c.x -= L.speed;
            if (rectCol(playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h, c.x, c.y, c.w, c.h)) {
                switch(c.type) {
                    case 'coin': setCoins(cs => cs + 1); break;
                    case 'shield': setHasShield(true); break;
                    case 'slowMo': setSlowMo({ active: true, timer: POWERUP_DURATION }); break;
                    case 'doubleScore': setDoubleScore({ active: true, timer: POWERUP_DURATION }); break;
                }
                collectiblesRef.current.splice(i, 1);
            }
        });

        // Handle particles
        particlesRef.current.forEach((p, i) => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.alpha -= 0.03;
            if (p.alpha <= 0) {
                particlesRef.current.splice(i, 1);
            }
        });

        // Handle floating texts
        floatingTextsRef.current.forEach((ft, i) => {
            ft.y += ft.vy;
            ft.alpha -= 0.03;
            if (ft.alpha <= 0) {
                floatingTextsRef.current.splice(i, 1);
            }
        });

        handlePowerUpTimers();

        pipesRef.current = pipesRef.current.filter(p => p.x + p.w > -40);
        collectiblesRef.current = collectiblesRef.current.filter(c => c.x + c.w > 0);

        frameRef.current++;
        if (frameRef.current % Math.round(L.spawnRate) === 0) {
             // Random gap size
            const gapVariation = (Math.random() - 0.5) * 50; // Varies gap by up to +/- 25px
            const gap = L.gap + gapVariation;
            
            const minTop = 90;
            const maxTop = ch - gap - 120;
            const topHeight = Math.floor(minTop + Math.random() * (maxTop - minTop));
            const pipeW = Math.min(140, Math.max(60, cw * 0.12));
            const randomPipeImg = pipeImgsRef.current[Math.floor(Math.random() * pipeImgsRef.current.length)];

            // Decide if pipe oscillates
            const willOscillate = Math.random() < 0.25; // 25% chance of being a moving pipe

            pipesRef.current.push({
                x: cw + 30,
                w: pipeW,
                top: topHeight,
                bottom: ch - (topHeight + gap),
                speed: L.speed,
                passed: false,
                img: randomPipeImg,
                oscillate: willOscillate,
                yOffset: 0,
                direction: 1,
                gap: gap,
            });

            // Spawn collectibles between pipes
            const spawnChance = Math.random();
            if (spawnChance < 0.5) { // 50% chance to spawn something
                 const collectibleY = topHeight + gap / 2;
                 const collectibleSize = 30;
                 const collectibleTypes = ['coin', 'shield', 'slowMo', 'doubleScore'];
                 const typeChance = Math.random();
                 let collectibleType: Collectible['type'];

                if (typeChance < 0.7) collectibleType = 'coin'; // 70% chance for a coin
                else if (typeChance < 0.85) collectibleType = 'shield'; // 15% for shield
                else if (typeChance < 0.95) collectibleType = 'slowMo'; // 10% for slow-mo
                else collectibleType = 'doubleScore'; // 5% for double score

                const collectibleImg = collectibleImgsRef.current[collectibleType];
                if(collectibleImg) {
                    collectiblesRef.current.push({
                        x: cw + pipeW / 2 + 30,
                        y: collectibleY - collectibleSize / 2,
                        w: collectibleSize,
                        h: collectibleSize,
                        type: collectibleType,
                        img: collectibleImg,
                    });
                }
            }
        }
        
        ctx.clearRect(0, 0, cw, ch);
        
        const scale = Math.max(cw / bgImgRef.current.width, ch / bgImgRef.current.height);
        const sw = bgImgRef.current.width * scale;
        const sh = bgImgRef.current.height * scale;
        bgXRef.current -= 0.3 * (slowMo.active ? 0.5 : 1);
        if (bgXRef.current <= -sw) bgXRef.current = 0;
        ctx.drawImage(bgImgRef.current, bgXRef.current, 0, sw, sh);
        ctx.drawImage(bgImgRef.current, bgXRef.current + sw, 0, sw, sh);

        pipesRef.current.forEach(p => {
            const yOffset = p.oscillate ? p.yOffset : 0;
            ctx.drawImage(p.img, p.x, 0 + yOffset, p.w, p.top);
            ctx.drawImage(p.img, p.x, ch - p.bottom + yOffset, p.w, p.bottom);
        });
        
        collectiblesRef.current.forEach(c => {
             ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
        });

        // Draw particles
        particlesRef.current.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = 'rgba(255, 223, 186, 0.8)'; // Light orange/gold color
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Draw floating texts
        floatingTextsRef.current.forEach(ft => {
            ctx.save();
            ctx.globalAlpha = ft.alpha;
            ctx.fillStyle = "white";
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        });

        ctx.save();
        ctx.translate(playerRef.current.x + playerRef.current.w / 2, playerRef.current.y + playerRef.current.h / 2);
        const rotation = Math.atan(playerRef.current.vel / 15); // Enhanced rotation
        ctx.rotate(rotation);
        ctx.drawImage(playerImgRef.current!, -playerRef.current.w / 2, -playerRef.current.h / 2, playerRef.current.w, playerRef.current.h);
        ctx.restore();
        
        if (hasShield) {
            ctx.save();
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#00FFFF';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(
                playerRef.current.x + playerRef.current.w / 2,
                playerRef.current.y + playerRef.current.h / 2,
                Math.max(playerRef.current.w, playerRef.current.h) / 2 + 5,
                0,
                Math.PI * 2
            );
            ctx.stroke();
            ctx.restore();
        }


        gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, [currentLevel, endGame, slowMo, doubleScore, hasShield, handlePowerUpTimers, gameMode, gameLevels, createFloatingText]);

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
            if (timeAttackIntervalRef.current) {
                clearInterval(timeAttackIntervalRef.current);
            }
        };
    }, [gameState, gameLoop]);

    useEffect(() => {
        const handleInput = (e: Event) => {
            e.preventDefault();
            
            if (e.target instanceof HTMLElement && (e.target.closest('button') || e.target.closest('[data-radix-collection-item]'))) {
                return;
            }

            if (e.type === 'keydown') {
                const keyEvent = e as KeyboardEvent;
                if (keyEvent.key !== ' ' && keyEvent.key !== 'Enter') return;
            }

            if (gameState === 'over') {
                return;
            }

            jump();
        };
        
        window.addEventListener('pointerdown', handleInput);
        window.addEventListener('keydown', handleInput);

        return () => {
            window.removeEventListener('pointerdown', handleInput);
            window.removeEventListener('keydown', handleInput);
        };
    }, [jump, gameState]);

    useEffect(() => {
        if(audioRef.current){
            audioRef.current.muted = isMuted;
        }
        if(jumpAudioRef.current){
            jumpAudioRef.current.muted = isMuted;
        }
        if(collisionAudioRef.current){
            collisionAudioRef.current.muted = isMuted;
        }
    }, [isMuted]);

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
    
    const handleGameModeChange = (mode: GameMode) => {
        setGameMode(mode);
        if (mode === 'insane') {
            const insaneLevel = gameLevels.find(l => l.id === 'insane');
            if (insaneLevel) setCurrentLevel(insaneLevel);
        } else {
             const classicLevel = gameLevels.find(l => l.id === currentLevel.id) || gameLevels[0];
             setCurrentLevel(classicLevel);
        }
        resetGame();
        setGameState('ready');
    };

    const handleRestart = () => {
        if (gameState === 'over') {
            resetGame();
            startGame();
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

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
            
            {gameAssets?.bgMusic?.url && (
                <audio ref={audioRef} src={gameAssets.bgMusic.url} loop playsInline />
            )}
             {gameAssets?.jumpSound?.url && (
                <audio ref={jumpAudioRef} src={gameAssets.jumpSound.url} playsInline />
            )}
            {gameAssets?.collisionSound?.url && (
                <audio ref={collisionAudioRef} src={gameAssets.collisionSound.url} playsInline />
            )}
            
            {gameState !== 'loading' && (
                <>
                    <div className="absolute top-4 left-4 z-10 text-left text-foreground drop-shadow-lg">
                        {gameMode !== 'zen' && <div className="text-xl font-bold">Coins: {coins}</div>}
                        <div className="flex gap-2 mt-1">
                          {hasShield && <ShieldCheck className="text-sky-400" />}
                          {slowMo.active && <span className="text-blue-400 font-bold">Slow!</span>}
                          {doubleScore.active && <span className="text-yellow-400 font-bold">x2!</span>}
                        </div>
                    </div>
                    <div className="absolute top-4 right-4 z-10 text-right text-foreground drop-shadow-lg">
                        {gameMode !== 'zen' && <div className="text-3xl font-bold">{score}</div>}
                        {gameMode === 'classic' && <div className="text-sm">High: {highScore}</div>}
                        {gameMode === 'timeAttack' && <div className="text-2xl font-bold text-destructive">Time: {timeLeft}</div>}
                         <div className="text-xs uppercase text-muted-foreground mt-1 tracking-wider">{currentLevel.name}</div>
                    </div>
                </>
            )}
            
            {gameState === 'ready' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/50 text-foreground text-center p-4 animate-in fade-in duration-500">
                    <h1 className="text-5xl font-bold font-headline drop-shadow-xl mb-4 text-primary">Run Krishna Run</h1>
                    <p className="text-xl font-semibold animate-pulse">Tap or Press Space to Start</p>
                </div>
            )}

            {gameState === 'over' && currentLevel && (
                 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 overflow-y-auto p-4 animate-in fade-in duration-500">
                    <div className="flex flex-col lg:flex-row gap-8 w-full max-w-4xl">
                        <Card className="bg-card/90 shadow-2xl border w-full lg:w-1/2">
                             <CardHeader>
                                <CardTitle className="text-4xl font-bold text-destructive mb-2 text-center">Game Over</CardTitle>
                             </CardHeader>
                             <CardContent className="text-center">
                                {gameMode !== 'zen' && (
                                    <>
                                        <p className="text-lg text-muted-foreground mb-1">Your score: <span className="font-bold text-foreground">{score}</span></p>
                                        <p className="text-lg text-muted-foreground mb-4">Coins collected: <span className="font-bold text-foreground">{coins}</span></p>
                                    </>
                                )}
                                <div className="space-y-4 mt-6">
                                    <Select onValueChange={(value: GameMode) => handleGameModeChange(value)} defaultValue={gameMode}>
                                        <SelectTrigger className="transition-transform duration-200 hover:scale-105">
                                            <SelectValue placeholder="Select mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="classic"><span className="capitalize">Classic</span></SelectItem>
                                            <SelectItem value="timeAttack"><span className="capitalize">Time Attack</span></SelectItem>
                                            <SelectItem value="zen"><span className="capitalize">Zen Mode</span></SelectItem>
                                            <SelectItem value="insane"><span className="capitalize">Insane</span></SelectItem>
                                        </SelectContent>
                                    </Select>
        
                                     <Select onValueChange={handleLevelChange} defaultValue={currentLevel.id} disabled={gameMode === 'insane'}>
                                        <SelectTrigger className="transition-transform duration-200 hover:scale-105">
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
        
                                    <Button size="lg" onClick={handleRestart} className="w-full transition-transform duration-200 hover:scale-105">
                                        Restart
                                    </Button>
                                    <Button variant="outline" size="lg" onClick={toggleMute} className="w-full flex items-center gap-2 transition-transform duration-200 hover:scale-105">
                                        {isMuted ? <VolumeX /> : <Volume2 />}
                                        <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                                    </Button>
                                </div>
                             </CardContent>
                        </Card>
                        
                        <Card className="bg-card/90 shadow-2xl border w-full lg:w-1/2">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-center gap-2">
                                    <Trophy className="text-yellow-500" />
                                    <span>Local Leaderboard</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Rank</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead className="text-right">Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {leaderboard.length > 0 ? (
                                            leaderboard.map((entry, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="font-medium">{index + 1}</TableCell>
                                                    <TableCell>{entry.score}</TableCell>
                                                    <TableCell className="text-right">{entry.date}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center">No scores yet. Play a game!</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </main>
    );
}
