// This file is now deprecated as game levels are managed in Firestore.
// The types are still useful for the game logic.

export interface GameLevel {
  id: string;
  name: string;
  gravity: number;
  lift: number;
  gap: number;
  speed: number;
  spawnRate: number;
}

export interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vel: number;
}

export interface Pipe {
  x: number;
  w: number;
  top: number;
  bottom: number;
  speed: number;
  passed: boolean;
}

export interface Collectible {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'coin' | 'shield' | 'slowMo' | 'doubleScore';
}


// Default levels to use while Firestore is loading.
export const defaultGameLevels: GameLevel[] = [
    {
        id: 'easy',
        name: 'Easy',
        gravity: 0.3,
        lift: -6,
        gap: 240,
        speed: 2.5,
        spawnRate: 90,
    },
    {
        id: 'normal',
        name: 'Normal',
        gravity: 0.4,
        lift: -7,
        gap: 220,
        speed: 3.5,
        spawnRate: 80,
    },
    {
        id: 'hard',
        name: 'Hard',
        gravity: 0.5,
        lift: -8,
        gap: 200,
        speed: 4.5,
        spawnRate: 70,
    },
];

    