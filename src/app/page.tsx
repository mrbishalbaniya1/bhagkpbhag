
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { getPlaceholderImages } from '@/lib/placeholder-images';
import { type GameLevel, type Player, type Pipe, defaultGameLevels, type Collectible, type Particle, type FloatingText, type RainDrop } from '@/lib/game-config';
import { Loader2, Music, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useUser, useFirestore, useCollection, useDoc, addDocumentNonBlocking, updateDocumentNonBlocking, useAuth } from '@/firebase';
import { collection, doc, serverTimestamp, query, orderBy, limit, increment, arrayUnion } from 'firebase/firestore';
import { useMemoFirebase } from '@/firebase/provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

interface GameAsset {
    name: string;
    url: string;
}

interface PipeAsset {
    name: string;
    url: string;
    collisionSoundUrl?: string;
}

interface AdminSettings {
    useCustomVisuals?: boolean;
    useCustomAudio?: boolean;
}


interface GameAssets {
    bg?: GameAsset;
    player?: GameAsset;
    pipes?: PipeAsset[];
    bgMusic?: GameAsset;
    coin?: GameAsset;
    shield?: GameAsset;
    slowMo?: GameAsset;
    doubleScore?: GameAsset;
    jumpSound?: GameAsset;
    collisionSound?: GameAsset; // Default collision sound
    coinSound?: GameAsset;
    shieldSound?: GameAsset;
    slowMoSound?: GameAsset;
    doubleScoreSound?: GameAsset;
    pipePassSound?: GameAsset;
}


type GameMode = 'classic' | 'timeAttack' | 'zen' | 'insane';
type WeatherType = 'clear' | 'rain' | 'fog';
type AchievementId = 'first-50' | 'flawless-run' | 'slow-mo-master' | 'veteran-player';


interface UserProfile {
    displayName: string;
    highScore?: number;
    gameMode?: GameMode;
    difficulty?: string;
    lastGame?: {
        score: number;
        coins: number;
        difficulty: string;
    };
    xp?: number;
    level?: number;
    achievements?: AchievementId[];
    gamesPlayed?: number;
}

interface LeaderboardEntry {
    id: string;
    displayName: string;
    score: number;
    createdAt: {
        seconds: number;
        nanoseconds: number;
    };
}

const XP_PER_LEVEL = 1000;

export default function GamePage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const auth = useAuth();
    const gameLevelsRef = useMemoFirebase(() => firestore ? collection(firestore, 'published_game_levels') : null, [firestore]);
    const { data: firebaseLevels, isLoading: levelsLoading } = useCollection<GameLevel>(gameLevelsRef);

    const gameAssetsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'game_assets') : null, [firestore]);
    const { data: gameAssets, isLoading: assetsLoading } = useDoc<GameAssets>(gameAssetsRef);
    
    const adminSettingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'admin') : null, [firestore]);
    const { data: adminSettings, isLoading: settingsLoading } = useDoc<AdminSettings>(adminSettingsRef);

    
    const userProfileRef = useMemoFirebase(() => firestore && user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<UserProfile>(userProfileRef);
    
    const leaderboardRef = useMemoFirebase(() => firestore ? query(collection(firestore, 'leaderboard'), orderBy('score', 'desc'), limit(10)) : null, [firestore]);
    const { data: leaderboard, isLoading: leaderboardLoading } = useCollection<LeaderboardEntry>(leaderboardRef);


    const [imagesLoaded, setImagesLoaded] = useState(false);
    const [gameState, setGameState] = useState<'loading' | 'ready' | 'playing' | 'over'>('loading');
    const [gameLevels, setGameLevels] = useState<GameLevel[]>(defaultGameLevels);
    const [currentLevel, setCurrentLevel] = useState<GameLevel>(defaultGameLevels[0]);
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);
    const [coins, setCoins] = useState(0);

    const scoreRef = useRef(0);
    const coinsRef = useRef(0);
    
    // Audio states
    const [bgmVolume, setBgmVolume] = useState(0.5);
    const [sfxVolume, setSfxVolume] = useState(0.5);
    const [showMuteButton, setShowMuteButton] = useState(true);
    
    const [leaderboardPage, setLeaderboardPage] = useState(0);
    const LEADERBOARD_PAGE_SIZE = 3;

    // Game Modes
    const [gameMode, setGameMode] = useState<GameMode>('classic');
    const [timeLeft, setTimeLeft] = useState(60);
    const timeAttackIntervalRef = useRef<NodeJS.Timeout>();


    // Power-up states
    const [hasShield, setHasShield] = useState(false);
    const [slowMo, setSlowMo] = useState<{active: boolean, timer: number}>({ active: false, timer: 0 });
    const [doubleScore, setDoubleScore] = useState<{active: boolean, timer: number}>({ active: false, timer: 0 });
    const POWERUP_DURATION = 300; // a value in frames, e.g., 300 frames is ~5 seconds at 60fps

    // Dynamic Obstacles & Weather State
    const windRef = useRef({ direction: 1, strength: 0.1, timer: 0 });
    const particlesRef = useRef<Particle[]>([]);
    const floatingTextsRef = useRef<FloatingText[]>([]);
    const [weather, setWeather] = useState<WeatherType>('clear');
    const rainDropsRef = useRef<RainDrop[]>([]);
    const lightningRef = useRef({ alpha: 0, timer: 0 });
    const fogRef = useRef({ alpha: 0, targetAlpha: 0 });


    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameLoopRef = useRef<number>();
    const audioRef = useRef<HTMLAudioElement>(null);
    const jumpAudioRef = useRef<HTMLAudioElement>(null);
    const collisionAudioRef = useRef<HTMLAudioElement>(null);
    const coinAudioRef = useRef<HTMLAudioElement>(null);
    const shieldAudioRef = useRef<HTMLAudioElement>(null);
    const slowMoAudioRef = useRef<HTMLAudioElement>(null);
    const doubleScoreAudioRef = useRef<HTMLAudioElement>(null);
    const pipePassAudioRef = useRef<HTMLAudioElement>(null);

    
    const playerRef = useRef<Player>({ x: 120, y: 200, w: 60, h: 45, vel: 0 });
    const pipesRef = useRef<(Pipe & { img: HTMLImageElement, collisionSound?: HTMLAudioElement })[]>([]);
    const collectiblesRef = useRef<(Collectible & { img: HTMLImageElement })[]>([]);
    const frameRef = useRef(0);
    const bgXRef = useRef(0);
    const collisionOccurredRef = useRef(false);

    const bgImgRef = useRef<HTMLImageElement>();
    const pipeImgsRef = useRef<(HTMLImageElement & { collisionSound?: HTMLAudioElement })[]>([]);
    const playerImgRef = useRef<HTMLImageElement>();
    const collectibleImgsRef = useRef<{[key: string]: HTMLImageElement}>({});

    // Load audio settings from local storage
    useEffect(() => {
        const bgmVol = localStorage.getItem('game-bgm-volume');
        const sfxVol = localStorage.getItem('game-sfx-volume');
        setBgmVolume(bgmVol ? parseFloat(bgmVol) : 0.5);
        setSfxVolume(sfxVol ? parseFloat(sfxVol) : 0.5);
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
        collectiblesRef.current = [];
        particlesRef.current = [];
        floatingTextsRef.current = [];
        rainDropsRef.current = [];
        frameRef.current = 0;
        windRef.current = { direction: 1, strength: 0.1, timer: 0 };
        setWeather('clear');
        fogRef.current = { alpha: 0, targetAlpha: 0 };
        collisionOccurredRef.current = false;
        
        setScore(0);
        setCoins(0);
        scoreRef.current = 0;
        coinsRef.current = 0;
        
        setHasShield(false);
        setSlowMo({ active: false, timer: 0 });
        setDoubleScore({ active: false, timer: 0 });
        setTimeLeft(60);
        if (timeAttackIntervalRef.current) clearInterval(timeAttackIntervalRef.current);
    }, []);

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
        if(imagesLoaded && (gameState === 'loading' || gameState === 'ready')){
            resetGame();
            setGameState('ready');
        }
    }, [imagesLoaded, gameState, resetGame]);

    useEffect(() => {
        if (user && !user.isAnonymous && userProfile) {
            setHighScore(userProfile.highScore || 0);
            if (userProfile.gameMode) setGameMode(userProfile.gameMode);
            const userDifficulty = gameLevels.find(l => l.id === userProfile.difficulty) || gameLevels[0];
            setCurrentLevel(userDifficulty);
        } else if (typeof window !== 'undefined') {
            const storedHigh = localStorage.getItem("game_high") || "0";
            setHighScore(parseInt(storedHigh, 10));
        }
    }, [user, userProfile, gameLevels]);

    useEffect(() => {
        if (assetsLoading || settingsLoading) return;

        const useCustomVisuals = adminSettings?.useCustomVisuals ?? true;
        const useCustomAudio = adminSettings?.useCustomAudio ?? true;
        
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

        const bgUrl = useCustomVisuals && gameAssets?.bg?.url ? gameAssets.bg.url : defaultAssets.bg;
        const playerUrl = useCustomVisuals && gameAssets?.player?.url ? gameAssets.player.url : defaultAssets.player;
        const pipeAssets = useCustomVisuals && gameAssets?.pipes && gameAssets.pipes.length > 0
            ? gameAssets.pipes
            : [{ name: 'default-pipe', url: defaultAssets.pipe as string, collisionSoundUrl: undefined }];

        const collectibleAssetUrls = {
            coin: useCustomVisuals && gameAssets?.coin?.url ? gameAssets.coin.url : defaultAssets.coin,
            shield: useCustomVisuals && gameAssets?.shield?.url ? gameAssets.shield.url : defaultAssets.shield,
            slowMo: useCustomVisuals && gameAssets?.slowMo?.url ? gameAssets.slowMo.url : defaultAssets.slowMo,
            doubleScore: useCustomVisuals && gameAssets?.doubleScore?.url ? gameAssets.doubleScore.url : defaultAssets.doubleScore,
        }

        let isMounted = true;
        setImagesLoaded(false);
        
        const loadAssets = async () => {
            try {
                const assetPromises: Promise<any>[] = [];

                const addImagePromise = (url: string | undefined, ref: React.MutableRefObject<HTMLImageElement | undefined>) => {
                    if (url) {
                        const img = new Image();
                        img.src = url;
                        ref.current = img;
                        assetPromises.push(img.decode());
                    }
                };
                
                 const addPipeAssetsPromises = (assets: PipeAsset[], ref: React.MutableRefObject<(HTMLImageElement & { collisionSound?: HTMLAudioElement })[]>) => {
                    const pipeAssetObjects = assets.map(asset => {
                        const img = new Image() as (HTMLImageElement & { collisionSound?: HTMLAudioElement });
                        img.src = asset.url;
                        assetPromises.push(img.decode());

                        if (useCustomAudio && asset.collisionSoundUrl) {
                            const audio = new Audio(asset.collisionSoundUrl);
                            audio.preload = 'auto';
                            assetPromises.push(new Promise((resolve, reject) => {
                                audio.addEventListener('canplaythrough', () => resolve(void 0), { once: true });
                                audio.addEventListener('error', reject, { once: true });
                            }));
                            img.collisionSound = audio;
                        }
                        return img;
                    });
                    ref.current = pipeAssetObjects;
                };

                const addCollectibleImagePromises = (urls: {[key: string]: string | undefined}, ref: React.MutableRefObject<{[key: string]: HTMLImageElement}>) => {
                    for (const key in urls) {
                        const url = urls[key];
                        if (url) {
                            const img = new Image();
                            img.src = url;
                            ref.current[key] = img;
                            assetPromises.push(img.decode());
                        }
                    }
                }

                addImagePromise(bgUrl, bgImgRef);
                addImagePromise(playerUrl, playerImgRef);
                addPipeAssetsPromises(pipeAssets, pipeImgsRef);
                addCollectibleImagePromises(collectibleAssetUrls, collectibleImgsRef);

                await Promise.all(assetPromises);

                if (isMounted) {
                    setImagesLoaded(true);
                }
            } catch (error) {
                console.error("Failed to load game assets", error);
            }
        };
        loadAssets();

        return () => {
            isMounted = false;
        };
    }, [gameAssets, assetsLoading, adminSettings, settingsLoading]);


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
            
            let newCurrentLevel = combinedLevels.find(l => l.id === currentLevel.id) || combinedLevels[0];
            if (gameMode === 'insane') {
                newCurrentLevel = combinedLevels.find(l => l.id === 'insane') || newCurrentLevel;
            } else if (userProfile?.difficulty) {
                newCurrentLevel = combinedLevels.find(l => l.id === userProfile.difficulty) || newCurrentLevel;
            }
            setCurrentLevel(newCurrentLevel);
        } else if (!levelsLoading) {
            setGameLevels(defaultGameLevels);
            setCurrentLevel(defaultGameLevels[0]);
        }
    }, [firebaseLevels, currentLevel.id, gameMode, levelsLoading, userProfile?.difficulty]);


    useEffect(() => {
        if (!levelsLoading && !assetsLoading && !settingsLoading) {
            setGameState('ready');
        } else {
            setGameState('loading');
        }
    }, [levelsLoading, assetsLoading, settingsLoading]);


    const saveScoreToLeaderboard = useCallback((currentScore: number) => {
        if (!firestore || !user || user.isAnonymous || !userProfile?.displayName || gameMode === 'zen' || currentScore === 0) return;

        const leaderboardCollection = collection(firestore, 'leaderboard');
        const scoreData = {
            userId: user.uid,
            displayName: userProfile.displayName,
            score: currentScore,
            createdAt: serverTimestamp(),
            difficulty: currentLevel.name,
        };
        addDocumentNonBlocking(leaderboardCollection, scoreData);
    }, [firestore, user, userProfile, currentLevel.name, gameMode]);

    const logGameEvent = useCallback((finalScore: number) => {
        if (!firestore || !user || !currentLevel || !userProfile) return;
        
        const isMobile = window.innerWidth < 768;
        const newAchievements: AchievementId[] = [];
        const currentAchievements = userProfile.achievements || [];

        if(finalScore >= 50 && !currentAchievements.includes('first-50')) newAchievements.push('first-50');
        if(!collisionOccurredRef.current && finalScore > 0 && !currentAchievements.includes('flawless-run')) newAchievements.push('flawless-run');
        if(slowMo.active && !currentAchievements.includes('slow-mo-master')) newAchievements.push('slow-mo-master');
        
        const totalGames = (userProfile.gamesPlayed || 0) + 1;
        if(totalGames >= 100 && !currentAchievements.includes('veteran-player')) newAchievements.push('veteran-player');

        const totalXp = (userProfile.xp || 0) + finalScore;
        const currentLvl = userProfile.level || 1;
        const newLevel = Math.floor(totalXp / XP_PER_LEVEL) + 1;

        const eventData = {
            userId: user.uid,
            score: finalScore,
            difficulty: currentLevel.name,
            timestamp: serverTimestamp(),
            deviceType: isMobile ? 'mobile' : 'desktop',
        };

        if (userProfileRef) {
            let profileUpdate: any = { 
                gamesPlayed: increment(1),
                xp: increment(finalScore),
            };
            if(newLevel > currentLvl) profileUpdate.level = newLevel;
            if(newAchievements.length > 0) profileUpdate.achievements = arrayUnion(...newAchievements);
            
            updateDocumentNonBlocking(userProfileRef, profileUpdate);
        }

        const eventsCollection = collection(firestore, 'game_events');
        addDocumentNonBlocking(eventsCollection, eventData);

    }, [firestore, user, currentLevel, userProfile, slowMo.active, userProfileRef]);
    
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

    const createFloatingText = useCallback((text: string, x: number, y: number) => {
        floatingTextsRef.current.push({
            text,
            x: x,
            y: y,
            alpha: 1,
            vy: -2,
        });
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
                        clearInterval(timeAttackIntervalRef.current!);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    }, [currentLevel, imagesLoaded, gameMode, resetGame]);

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

    const heroLoop = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImgRef.current || !playerImgRef.current) {
            gameLoopRef.current = requestAnimationFrame(heroLoop);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;

        ctx.clearRect(0, 0, cw, ch);

        const scale = Math.max(cw / bgImgRef.current.width, ch / bgImgRef.current.height);
        const sw = bgImgRef.current.width * scale;
        const sh = bgImgRef.current.height * scale;
        bgXRef.current -= 0.3;
        if (bgXRef.current <= -sw) bgXRef.current = 0;
        ctx.drawImage(bgImgRef.current, bgXRef.current, 0, sw, sh);
        ctx.drawImage(bgImgRef.current, bgXRef.current + sw, 0, sw, sh);

        // Make player float up and down
        frameRef.current++;
        playerRef.current.y = ch / 2.5 + Math.sin(frameRef.current / 40) * 15;
        ctx.drawImage(playerImgRef.current, playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h);
        
        // Retro animation text
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'hsl(var(--primary-foreground))';
        ctx.shadowColor = 'hsl(var(--primary))';
        ctx.shadowBlur = 10;
        
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('नमस्ते', cw / 2, ch / 2 - 100);

        ctx.font = '24px sans-serif';
        const nepaliText = 'खेल सुरु गर्न SPACE थिच्नुहोस्!';
        const yOffset = Math.sin(frameRef.current / 20) * 5;
        ctx.fillText(nepaliText, cw / 2, ch / 2 - 50 + yOffset);
        
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = 'hsl(var(--foreground))';
        ctx.shadowColor = 'hsl(var(--background))';
        ctx.shadowBlur = 5;
        ctx.fillText('Press SPACE or Tap to Start', cw / 2, ch * 0.9);

        ctx.restore();


        gameLoopRef.current = requestAnimationFrame(heroLoop);
    }, []);

    const gameLoop = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !bgImgRef.current || !playerImgRef.current || pipeImgsRef.current.length === 0 || !currentLevel) {
            gameLoopRef.current = requestAnimationFrame(gameLoop);
            return;
        };

        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        let L = { ...currentLevel };

        if (gameMode === 'insane') {
            const insaneLevel = gameLevels.find(l => l.id === 'insane');
            if (insaneLevel) L = insaneLevel;
        }

        // Weather logic
        if (frameRef.current % 1200 === 0) { // Change weather every ~20 seconds
            const weatherOptions: WeatherType[] = ['clear', 'rain', 'fog'];
            const nextWeather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
            setWeather(nextWeather);
        }

        if (weather === 'fog') {
            fogRef.current.targetAlpha = 0.6;
        } else {
            fogRef.current.targetAlpha = 0;
        }

        if (fogRef.current.alpha < fogRef.current.targetAlpha) {
            fogRef.current.alpha += 0.005;
        } else if (fogRef.current.alpha > fogRef.current.targetAlpha) {
            fogRef.current.alpha -= 0.005;
        }


        if (weather === 'rain' && Math.random() < 0.3) {
            for (let i = 0; i < 5; i++) {
                rainDropsRef.current.push({
                    x: Math.random() * cw,
                    y: -20,
                    length: Math.random() * 20 + 10,
                    speed: Math.random() * 5 + 5,
                });
            }
             if (Math.random() < 0.005) { // Chance of lightning
                lightningRef.current = { alpha: 1, timer: 10 };
            }
        }


        if (slowMo.active) {
            L.speed *= 0.5;
            L.spawnRate *= 1.5;
        }

        windRef.current.timer--;
        if (windRef.current.timer <= 0) {
            windRef.current.direction *= -1;
            windRef.current.strength = Math.random() * 0.15 + 0.05;
            windRef.current.timer = Math.random() * 300 + 100;
        }
        playerRef.current.x += windRef.current.strength * windRef.current.direction * (slowMo.active ? 0.5 : 1);
        playerRef.current.x = Math.max(0, Math.min(playerRef.current.x, cw - playerRef.current.w));

        
        playerRef.current.vel += L.gravity;
        playerRef.current.y += playerRef.current.vel;
        
        let shouldEndGame = false;
        let playDefaultCollisionSound = false;
        let pipeCollisionSoundToPlay: HTMLAudioElement | undefined = undefined;


        if ((playerRef.current.y < 0 || playerRef.current.y + playerRef.current.h > ch) && gameMode !== 'zen') {
            if (hasShield) {
                setHasShield(false);
                playerRef.current.y = Math.max(0, Math.min(playerRef.current.y, ch - playerRef.current.h));
                playerRef.current.vel = 0;
            } else {
                shouldEndGame = true;
                collisionOccurredRef.current = true;
                playDefaultCollisionSound = true;
            }
        }

        const rectCol = (ax:number,ay:number,aw:number,ah:number,bx:number,by:number,bw:number,bh:number) => {
            return (ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by);
        }

        if (gameMode !== 'zen') {
            pipesRef.current.forEach(p => {
                if (shouldEndGame) return;
                p.x -= p.speed;

                if (p.oscillate) {
                    p.yOffset += p.direction * 0.5;
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
                        p.x = -p.w; 
                    } else {
                        shouldEndGame = true;
                        collisionOccurredRef.current = true;
                        if (p.collisionSound) {
                            pipeCollisionSoundToPlay = p.collisionSound;
                        } else {
                            playDefaultCollisionSound = true;
                        }
                    }
                }
                if (!p.passed && p.x + p.w < playerRef.current.x) {
                    p.passed = true;
                    pipePassAudioRef.current?.play().catch(e => console.error("Audio play failed:", e));
                    const points = doubleScore.active ? 2 : 1;
                    scoreRef.current += points;
                    setScore(s => s + points);
                    createFloatingText(`+${points}`, playerRef.current.x + playerRef.current.w / 2, playerRef.current.y);
                }
            });
        } else {
            pipesRef.current.forEach(p => { p.x -= p.speed });
        }
        
        collectiblesRef.current.forEach((c, i) => {
            if (shouldEndGame) return;
            c.x -= L.speed;
            if (rectCol(playerRef.current.x, playerRef.current.y, playerRef.current.w, playerRef.current.h, c.x, c.y, c.w, c.h)) {
                switch(c.type) {
                    case 'coin': coinAudioRef.current?.play().catch(e => console.error("Audio play failed:", e)); break;
                    case 'shield': shieldAudioRef.current?.play().catch(e => console.error("Audio play failed:", e)); break;
                    case 'slowMo': slowMoAudioRef.current?.play().catch(e => console.error("Audio play failed:", e)); break;
                    case 'doubleScore': doubleScoreAudioRef.current?.play().catch(e => console.error("Audio play failed:", e)); break;
                }
                switch(c.type) {
                    case 'coin': 
                        coinsRef.current += 1;
                        setCoins(cs => cs + 1);
                        break;
                    case 'shield': setHasShield(true); break;
                    case 'slowMo': setSlowMo({ active: true, timer: POWERUP_DURATION }); break;
                    case 'doubleScore': setDoubleScore({ active: true, timer: POWERUP_DURATION }); break;
                }
                collectiblesRef.current.splice(i, 1);
            }
        });

        particlesRef.current.forEach((p, i) => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.alpha -= 0.03;
            if (p.alpha <= 0) {
                particlesRef.current.splice(i, 1);
            }
        });

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
            const gapVariation = (Math.random() - 0.5) * 50;
            const gap = L.gap + gapVariation;
            
            const minTop = 90;
            const maxTop = ch - gap - 120;
            const topHeight = Math.floor(minTop + Math.random() * (maxTop - minTop));
            const pipeW = Math.min(140, Math.max(60, cw * 0.12));
            const randomPipeAsset = pipeImgsRef.current[Math.floor(Math.random() * pipeImgsRef.current.length)];

            const willOscillate = Math.random() < 0.25;

            pipesRef.current.push({
                x: cw + 30,
                w: pipeW,
                top: topHeight,
                bottom: ch - (topHeight + gap),
                speed: L.speed,
                passed: false,
                img: randomPipeAsset,
                collisionSound: randomPipeAsset.collisionSound,
                oscillate: willOscillate,
                yOffset: 0,
                direction: 1,
                gap: gap,
            });

            const spawnChance = Math.random();
            if (spawnChance < 0.5) {
                 const collectibleY = topHeight + gap / 2;
                 const collectibleSize = 30;
                 const collectibleTypes = ['coin', 'shield', 'slowMo', 'doubleScore'];
                 const typeChance = Math.random();
                 let collectibleType: Collectible['type'];

                if (typeChance < 0.7) collectibleType = 'coin';
                else if (typeChance < 0.85) collectibleType = 'shield';
                else if (typeChance < 0.95) collectibleType = 'slowMo';
                else collectibleType = 'doubleScore';

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

        // Draw Weather Effects
        if (lightningRef.current.alpha > 0) {
            ctx.save();
            ctx.globalAlpha = lightningRef.current.alpha;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
            lightningRef.current.alpha -= 0.1;
        }

        rainDropsRef.current.forEach((drop, index) => {
            drop.y += drop.speed;
            if (drop.y > ch) {
                rainDropsRef.current.splice(index, 1);
            }
            ctx.save();
            ctx.strokeStyle = 'rgba(174,194,224,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x, drop.y + drop.length);
            ctx.stroke();
            ctx.restore();
        });


        pipesRef.current.forEach(p => {
            const yOffset = p.oscillate ? p.yOffset : 0;
            ctx.drawImage(p.img, p.x, 0 + yOffset, p.w, p.top);
            ctx.drawImage(p.img, p.x, ch - p.bottom + yOffset, p.w, p.bottom);
        });
        
        collectiblesRef.current.forEach(c => {
             ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
        });

        particlesRef.current.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = 'rgba(255, 223, 186, 0.8)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

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

        if (fogRef.current.alpha > 0) {
            ctx.save();
            ctx.globalAlpha = fogRef.current.alpha;
            ctx.fillStyle = 'rgba(200, 200, 210, 0.7)';
            ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
        }

        ctx.save();
        ctx.translate(playerRef.current.x + playerRef.current.w / 2, playerRef.current.y + playerRef.current.h / 2);
        const rotation = Math.atan(playerRef.current.vel / 15);
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

        if (shouldEndGame || (gameMode === 'timeAttack' && timeLeft <= 0)) {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
            audioRef.current?.pause();

            if (shouldEndGame) {
                if (pipeCollisionSoundToPlay) {
                    pipeCollisionSoundToPlay.play().catch(e => console.error("Pipe collision sound failed:", e));
                } else if (playDefaultCollisionSound) {
                    collisionAudioRef.current?.play().catch(e => console.error("Default collision sound failed:", e));
                }
            }

            if (timeAttackIntervalRef.current) clearInterval(timeAttackIntervalRef.current);

            const finalScore = scoreRef.current;
            const finalCoins = coinsRef.current;

            if (gameMode !== 'zen') {
                if (userProfile) {
                    logGameEvent(finalScore);
                }
                const isNewHighScore = finalScore > highScore;
                if (isNewHighScore) {
                    setHighScore(finalScore);
                    if (user && !user.isAnonymous && firestore && userProfileRef) {
                        updateDocumentNonBlocking(userProfileRef, { highScore: finalScore });
                    } else if (typeof window !== 'undefined') {
                        localStorage.setItem("game_high", finalScore.toString());
                    }
                }
                if (user && !user.isAnonymous && userProfileRef) {
                    updateDocumentNonBlocking(userProfileRef, { 
                        lastGame: {
                            score: finalScore,
                            coins: finalCoins,
                            difficulty: currentLevel.name,
                        }
                    });
                }
                saveScoreToLeaderboard(finalScore);
            }
            
            // Set state right before changing gameState
            setScore(finalScore);
            setCoins(finalCoins);
            setLeaderboardPage(0);
            setGameState('over');

        } else {
             gameLoopRef.current = requestAnimationFrame(gameLoop);
        }

    }, [currentLevel, slowMo, doubleScore, hasShield, handlePowerUpTimers, gameMode, gameLevels, createFloatingText, saveScoreToLeaderboard, logGameEvent, user, firestore, userProfile, userProfileRef, timeLeft, weather, highScore]);

    useEffect(() => {
        if (gameState === 'playing') {
            gameLoopRef.current = requestAnimationFrame(gameLoop);
        } else if (gameState === 'ready') {
            gameLoopRef.current = requestAnimationFrame(heroLoop);
        } else {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
            if (timeAttackIntervalRef.current) {
                clearInterval(timeAttackIntervalRef.current);
            }
        }
        return () => {
            if (gameLoopRef.current) {
                cancelAnimationFrame(gameLoopRef.current);
            }
            if (timeAttackIntervalRef.current) {
                clearInterval(timeAttackIntervalRef.current);
            }
        };
    }, [gameState, gameLoop, heroLoop]);

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
        const useCustomAudio = adminSettings?.useCustomAudio ?? true;
        if (!useCustomAudio) return;

        const setVolume = (audioEl: HTMLAudioElement | null, volume: number) => {
            if (audioEl) audioEl.volume = volume;
        };

        setVolume(audioRef.current, bgmVolume);
        setVolume(jumpAudioRef.current, sfxVolume);
        setVolume(collisionAudioRef.current, sfxVolume);
        setVolume(coinAudioRef.current, sfxVolume);
        setVolume(shieldAudioRef.current, sfxVolume);
        setVolume(slowMoAudioRef.current, sfxVolume);
        setVolume(doubleScoreAudioRef.current, sfxVolume);
        setVolume(pipePassAudioRef.current, sfxVolume);
        
        pipeImgsRef.current.forEach(pipeAsset => {
            setVolume(pipeAsset.collisionSound || null, sfxVolume);
        });

    }, [bgmVolume, sfxVolume, adminSettings]);

    const handleRestart = () => {
        startGame();
    };
    
    const formatDate = (timestamp: LeaderboardEntry['createdAt']) => {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };
    
    const paginatedLeaderboard = leaderboard?.slice(
        leaderboardPage * LEADERBOARD_PAGE_SIZE,
        leaderboardPage * LEADERBOARD_PAGE_SIZE + LEADERBOARD_PAGE_SIZE
    );
    const totalLeaderboardPages = leaderboard ? Math.ceil(leaderboard.length / LEADERBOARD_PAGE_SIZE) : 0;


    if (gameState === 'loading' || !imagesLoaded || leaderboardLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    const useCustomAudio = adminSettings?.useCustomAudio ?? true;

    return (
        <main className="relative w-screen h-screen overflow-hidden bg-background font-body select-none">
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            
            {useCustomAudio && gameAssets?.bgMusic?.url && ( <audio ref={audioRef} src={gameAssets.bgMusic.url} loop playsInline /> )}
            {useCustomAudio && gameAssets?.jumpSound?.url && ( <audio ref={jumpAudioRef} src={gameAssets.jumpSound.url} playsInline /> )}
            {useCustomAudio && gameAssets?.collisionSound?.url && ( <audio ref={collisionAudioRef} src={gameAssets.collisionSound.url} playsInline /> )}
            {useCustomAudio && gameAssets?.coinSound?.url && ( <audio ref={coinAudioRef} src={gameAssets.coinSound.url} playsInline /> )}
            {useCustomAudio && gameAssets?.shieldSound?.url && ( <audio ref={shieldAudioRef} src={gameAssets.shieldSound.url} playsInline /> )}
            {useCustomAudio && gameAssets?.slowMoSound?.url && ( <audio ref={slowMoAudioRef} src={gameAssets.slowMoSound.url} playsInline /> )}
            {useCustomAudio && gameAssets?.doubleScoreSound?.url && ( <audio ref={doubleScoreAudioRef} src={gameAssets.doubleScoreSound.url} playsInline /> )}
            {useCustomAudio && gameAssets?.pipePassSound?.url && ( <audio ref={pipePassAudioRef} src={gameAssets.pipePassSound.url} playsInline /> )}
            
            {gameState !== 'loading' && gameState !== 'ready' && (
                <>
                    <div className="absolute top-4 left-4 z-10 flex items-center gap-4 text-left text-foreground drop-shadow-lg">
                        <div>
                            {gameMode !== 'zen' && <div className="text-xl font-bold">Coins: {coins}</div>}
                            <div className="flex gap-2 mt-1">
                            {hasShield && <ShieldCheck className="text-sky-400" />}
                            {slowMo.active && <span className="text-blue-400 font-bold">Slow!</span>}
                            {doubleScore.active && <span className="text-yellow-400 font-bold">x2!</span>}
                            </div>
                        </div>
                         {showMuteButton && <Button asChild variant="outline" size="icon" className="bg-background/50 border-foreground/50">
                            <Link href="/account">
                                <Music className="h-5 w-5"/>
                            </Link>
                         </Button>}
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
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-transparent text-foreground text-center p-4">
                     <Card className="max-w-md w-full bg-card/80 backdrop-blur-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-center gap-2">
                                <Trophy className="text-yellow-500" />
                                <span>Top Players</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">Rank</TableHead>
                                        <TableHead>Player</TableHead>
                                        <TableHead className="text-right">Score</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaderboard && leaderboard.length > 0 ? (
                                        leaderboard.slice(0, 3).map((entry, index) => (
                                            <TableRow key={entry.id}>
                                                <TableCell className="font-medium">{index + 1}</TableCell>
                                                <TableCell>{entry.displayName}</TableCell>
                                                <TableCell className="text-right">{entry.score}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center">Be the first on the leaderboard!</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                        {userProfile?.lastGame && (
                            <CardFooter className="flex-col items-start text-sm">
                                <h3 className="font-semibold mb-2 text-base">Your Last Game:</h3>
                                <div className='flex justify-between w-full'>
                                    <span>Score: <span className="font-bold">{userProfile.lastGame.score}</span></span>
                                    <span>Coins: <span className="font-bold">{userProfile.lastGame.coins}</span></span>
                                    <span className='capitalize'>Difficulty: <span className="font-bold">{userProfile.lastGame.difficulty}</span></span>
                                </div>
                            </CardFooter>
                        )}
                     </Card>
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
                                    <Button size="lg" onClick={handleRestart} className="w-full transition-transform duration-200 hover:scale-105">
                                        Restart
                                    </Button>
                                    {user && !user.isAnonymous && (
                                        <Button variant="secondary" size="lg" asChild className="w-full transition-transform duration-200 hover:scale-105">
                                            <Link href="/account">My Account</Link>
                                        </Button>
                                    )}
                                </div>
                             </CardContent>
                        </Card>
                        
                        <Card className="bg-card/90 shadow-2xl border w-full lg:w-1/2">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-center gap-2">
                                    <Trophy className="text-yellow-500" />
                                    <span>Leaderboard</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[40px]">Rank</TableHead>
                                            <TableHead>Player</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead className="text-right">Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedLeaderboard && paginatedLeaderboard.length > 0 ? (
                                            paginatedLeaderboard.map((entry, index) => (
                                                <TableRow key={entry.id}>
                                                    <TableCell className="font-medium">
                                                        {leaderboardPage * LEADERBOARD_PAGE_SIZE + index + 1}
                                                    </TableCell>
                                                    <TableCell>{entry.displayName}</TableCell>
                                                    <TableCell>{entry.score}</TableCell>
                                                    <TableCell className="text-right">{formatDate(entry.createdAt)}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center">No scores yet. Play a game!</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                             {leaderboard && leaderboard.length > LEADERBOARD_PAGE_SIZE && (
                                <CardFooter className="flex justify-between pt-4">
                                    <Button 
                                        variant="outline"
                                        onClick={() => setLeaderboardPage(p => Math.max(0, p - 1))}
                                        disabled={leaderboardPage === 0}
                                    >
                                        Previous
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        Page {leaderboardPage + 1} of {totalLeaderboardPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        onClick={() => setLeaderboardPage(p => Math.min(totalLeaderboardPages - 1, p + 1))}
                                        disabled={leaderboardPage >= totalLeaderboardPages - 1}
                                    >
                                        Next
                                    </Button>
                                </CardFooter>
                             )}
                            {(!user || user.isAnonymous) && (
                                <CardFooter className="flex-col gap-2 pt-4">
                                     <p className="text-sm text-muted-foreground">Sign up to save your score!</p>
                                     <Button asChild>
                                        <Link href="/login">Sign Up</Link>
                                     </Button>
                                </CardFooter>
                            )}
                        </Card>
                    </div>
                </div>
            )}
        </main>
    );
}
