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
