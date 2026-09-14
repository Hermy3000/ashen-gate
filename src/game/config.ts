export const WORLD_W = 1280;
export const WORLD_H = 720;
export const COLS = 16;
export const ROWS = 9;
export const CELL = 80;

export const START_GOLD = 220;
export const START_LIVES = 20;
export const WAVE_COUNT = 10;
export const SELL_RATIO = 0.6;
export const TICK = 1 / 60;

export type Vec = { x: number; y: number };

export function cellCenter(c: number, r: number): Vec {
  return { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
}

/** Corner cells of the S-path (spawn is off the left, exit off the right). */
export const PATH_CORNERS: Array<[number, number]> = [
  [-1, 2],
  [12, 2],
  [12, 4],
  [3, 4],
  [3, 6],
  [16, 6],
];

export const WAYPOINTS: Vec[] = PATH_CORNERS.map(([c, r]) => cellCenter(c, r));

function fillSegment(
  set: Set<string>,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
) {
  const dc = Math.sign(c1 - c0);
  const dr = Math.sign(r1 - r0);
  let c = c0;
  let r = r0;
  for (;;) {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) set.add(`${c},${r}`);
    if (c === c1 && r === r1) break;
    c += dc;
    r += dr;
  }
}

export const PATH_CELLS: Set<string> = (() => {
  const set = new Set<string>();
  fillSegment(set, 0, 2, 12, 2);
  fillSegment(set, 12, 2, 12, 4);
  fillSegment(set, 12, 4, 3, 4);
  fillSegment(set, 3, 4, 3, 6);
  fillSegment(set, 3, 6, 15, 6);
  return set;
})();

export function isPathCell(c: number, r: number) {
  return PATH_CELLS.has(`${c},${r}`);
}

export type TowerId = "ballista" | "mortar" | "rime";
export type EnemyId = "walker" | "skitter" | "bulwark" | "boss";
export type Targeting = "first" | "strong" | "close";
export type UpgradeKind = "damage" | "rate";

export type UpgradeStep = { cost: number; add: number };

export type TowerDef = {
  id: TowerId;
  name: string;
  blurb: string;
  cost: number;
  range: number;
  fireRate: number;
  damage: number;
  splash: number;
  slow: number;
  slowTime: number;
  projectileSpeed: number;
  projectile: "bolt" | "bomb" | "ice";
  drawSize: number;
  upgrades: Record<UpgradeKind, UpgradeStep[]>;
};

export const TOWERS: Record<TowerId, TowerDef> = {
  ballista: {
    id: "ballista",
    name: "Ballista",
    blurb: "Cheap bolts. Fast and precise.",
    cost: 55,
    range: 204,
    fireRate: 1.45,
    damage: 14,
    splash: 0,
    slow: 0,
    slowTime: 0,
    projectileSpeed: 480,
    projectile: "bolt",
    drawSize: 78,
    upgrades: {
      damage: [
        { cost: 40, add: 8 },
        { cost: 70, add: 11 },
        { cost: 110, add: 16 },
      ],
      rate: [
        { cost: 40, add: 0.35 },
        { cost: 70, add: 0.4 },
        { cost: 110, add: 0.55 },
      ],
    },
  },
  mortar: {
    id: "mortar",
    name: "Mortar",
    blurb: "Heavy shells. Splashes the road.",
    cost: 120,
    range: 252,
    fireRate: 0.5,
    damage: 36,
    splash: 96,
    slow: 0,
    slowTime: 0,
    projectileSpeed: 290,
    projectile: "bomb",
    drawSize: 84,
    upgrades: {
      damage: [
        { cost: 55, add: 16 },
        { cost: 90, add: 20 },
        { cost: 140, add: 28 },
      ],
      rate: [
        { cost: 55, add: 0.1 },
        { cost: 90, add: 0.12 },
        { cost: 140, add: 0.16 },
      ],
    },
  },
  rime: {
    id: "rime",
    name: "Rime Spire",
    blurb: "Ice shards. Slows the march.",
    cost: 80,
    range: 176,
    fireRate: 1.05,
    damage: 9,
    splash: 0,
    slow: 0.42,
    slowTime: 1.9,
    projectileSpeed: 420,
    projectile: "ice",
    drawSize: 86,
    upgrades: {
      damage: [
        { cost: 45, add: 6 },
        { cost: 75, add: 8 },
        { cost: 115, add: 12 },
      ],
      rate: [
        { cost: 45, add: 0.25 },
        { cost: 75, add: 0.3 },
        { cost: 115, add: 0.4 },
      ],
    },
  },
};

export const TOWER_ORDER: TowerId[] = ["ballista", "mortar", "rime"];

export type EnemyDef = {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number;
  gold: number;
  armor: number;
  size: number;
  lives: number;
};

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  walker: {
    id: "walker",
    name: "Ash Walker",
    hp: 38,
    speed: 70,
    gold: 8,
    armor: 0,
    size: 46,
    lives: 1,
  },
  skitter: {
    id: "skitter",
    name: "Skitter",
    hp: 20,
    speed: 118,
    gold: 6,
    armor: 0,
    size: 36,
    lives: 1,
  },
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    hp: 135,
    speed: 40,
    gold: 16,
    armor: 0.32,
    size: 58,
    lives: 1,
  },
  boss: {
    id: "boss",
    name: "Gatebreaker",
    hp: 1200,
    speed: 32,
    gold: 90,
    armor: 0.18,
    size: 86,
    lives: 5,
  },
};

export type SpawnGroup = {
  type: EnemyId;
  count: number;
  interval: number;
  delay: number;
};

export type WaveDef = {
  name: string;
  bonus: number;
  groups: SpawnGroup[];
};

export const WAVES: WaveDef[] = [
  {
    name: "First ash",
    bonus: 20,
    groups: [{ type: "walker", count: 8, interval: 0.85, delay: 0 }],
  },
  {
    name: "The column",
    bonus: 25,
    groups: [{ type: "walker", count: 14, interval: 0.7, delay: 0 }],
  },
  {
    name: "Fast blood",
    bonus: 30,
    groups: [
      { type: "walker", count: 8, interval: 0.8, delay: 0 },
      { type: "skitter", count: 10, interval: 0.45, delay: 2 },
    ],
  },
  {
    name: "Iron line",
    bonus: 35,
    groups: [
      { type: "walker", count: 10, interval: 0.7, delay: 0 },
      { type: "bulwark", count: 4, interval: 1.6, delay: 3 },
    ],
  },
  {
    name: "Vanguard",
    bonus: 40,
    groups: [
      { type: "walker", count: 8, interval: 0.7, delay: 0 },
      { type: "skitter", count: 10, interval: 0.4, delay: 1.5 },
      { type: "bulwark", count: 4, interval: 1.4, delay: 4 },
    ],
  },
  {
    name: "Skitter tide",
    bonus: 45,
    groups: [
      { type: "skitter", count: 22, interval: 0.32, delay: 0 },
      { type: "walker", count: 6, interval: 0.8, delay: 2 },
    ],
  },
  {
    name: "Shield wall",
    bonus: 50,
    groups: [
      { type: "bulwark", count: 8, interval: 1.1, delay: 0 },
      { type: "walker", count: 10, interval: 0.65, delay: 1 },
    ],
  },
  {
    name: "Broken ranks",
    bonus: 55,
    groups: [
      { type: "walker", count: 12, interval: 0.55, delay: 0 },
      { type: "skitter", count: 14, interval: 0.35, delay: 1 },
      { type: "bulwark", count: 6, interval: 1.2, delay: 3 },
    ],
  },
  {
    name: "Before the ram",
    bonus: 60,
    groups: [
      { type: "bulwark", count: 10, interval: 0.95, delay: 0 },
      { type: "skitter", count: 12, interval: 0.35, delay: 2 },
      { type: "walker", count: 10, interval: 0.5, delay: 1 },
    ],
  },
  {
    name: "Gatebreaker",
    bonus: 80,
    groups: [
      { type: "boss", count: 1, interval: 1, delay: 2.5 },
      { type: "bulwark", count: 8, interval: 1.1, delay: 0 },
      { type: "walker", count: 10, interval: 0.5, delay: 4 },
      { type: "skitter", count: 12, interval: 0.35, delay: 5 },
    ],
  },
];

export function waveHpScale(waveIndex: number) {
  return 1 + 0.07 * waveIndex;
}

export function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
