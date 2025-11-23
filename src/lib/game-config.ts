export const levelSettings = {
  easy: { gravity: 0.25, lift: -7.5, gap: 220, speed: 1.8, spawnRate: 150 },
  normal: { gravity: 0.38, lift: -8.8, gap: 160, speed: 2.4, spawnRate: 115 },
  hard: { gravity: 0.55, lift: -10, gap: 130, speed: 3.0, spawnRate: 90 },
};

export type Level = keyof typeof levelSettings;

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
