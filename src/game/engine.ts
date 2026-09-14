import {
  CELL,
  COLS,
  ENEMIES,
  PATH_CELLS,
  ROWS,
  SELL_RATIO,
  START_GOLD,
  START_LIVES,
  TICK,
  TOWERS,
  WAYPOINTS,
  WAVES,
  WORLD_H,
  WORLD_W,
  WAVE_COUNT,
  clamp,
  dist2,
  isPathCell,
  waveHpScale,
  type EnemyId,
  type Targeting,
  type TowerId,
  type UpgradeKind,
} from "./config";
import type { GameImages } from "./assets";
import type { GameAudio } from "./audio";

export type Phase = "menu" | "prep" | "combat" | "victory" | "defeat";

export type HudSnapshot = {
  phase: Phase;
  gold: number;
  lives: number;
  wave: number;
  waveName: string;
  waveCount: number;
  remaining: number;
  paused: boolean;
  muted: boolean;
  selectedType: TowerId | null;
  selectedTower: null | {
    id: number;
    type: TowerId;
    name: string;
    damage: number;
    fireRate: number;
    range: number;
    targeting: Targeting;
    spent: number;
    dmgLevel: number;
    rateLevel: number;
    dmgCost: number | null;
    rateCost: number | null;
    sellValue: number;
  };
};

export type EngineHooks = {
  onHud: (s: HudSnapshot) => void;
};

type Enemy = {
  alive: boolean;
  id: number;
  type: EnemyId;
  x: number;
  y: number;
  wp: number;
  hp: number;
  maxHp: number;
  speed: number;
  gold: number;
  armor: number;
  size: number;
  lives: number;
  pathDist: number;
  slowT: number;
  slowMul: number;
  flash: number;
  frame: number;
  distAnim: number;
};

type Tower = {
  id: number;
  type: TowerId;
  c: number;
  r: number;
  x: number;
  y: number;
  cooldown: number;
  targeting: Targeting;
  dmgLevel: number;
  rateLevel: number;
  spent: number;
};

type Shot = {
  alive: boolean;
  type: TowerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  target: Enemy | null;
  destX: number;
  destY: number;
  damage: number;
  splash: number;
  slow: number;
  slowTime: number;
  speed: number;
  ttl: number;
  homing: boolean;
  arc: number;
};

type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type Floater = {
  alive: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
};

const MAX_ENEMIES = 80;
const MAX_SHOTS = 120;
const MAX_PARTICLES = 420;
const MAX_FLOATERS = 80;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export class AshenEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  images: GameImages;
  audio: GameAudio;
  hooks: EngineHooks;

  phase: Phase = "menu";
  paused = false;
  gold = START_GOLD;
  lives = START_LIVES;
  waveIndex = -1;
  selectedType: TowerId | null = null;
  selectedId = -1;
  hoverC = -1;
  hoverR = -1;

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private spawnQueue: Array<{ t: number; type: EnemyId }> = [];
  private nextId = 1;
  private waveAlive = 0;
  private acc = 0;
  private lastTs = 0;
  private raf = 0;
  private trauma = 0;
  private hudClock = 0;
  private reducedMotion = false;
  private view = { scale: 1, ox: 0, oy: 0, cssW: 1, cssH: 1 };
  private running = false;
  private moteT = 0;

  constructor(
    canvas: HTMLCanvasElement,
    images: GameImages,
    audio: GameAudio,
    hooks: EngineHooks,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.images = images;
    this.audio = audio;
    this.hooks = hooks;
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.pool();
    this.bind();
    this.resize();
  }

  start() {
    this.running = true;
    this.lastTs = performance.now();
    this.emitHud();
    const loop = (ts: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      let dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (dt > 0.1) dt = 0.1;
      this.acc += dt;
      while (this.acc >= TICK) {
        this.step(TICK);
        this.acc -= TICK;
      }
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  beginSiege() {
    this.resetMatch();
    this.phase = "prep";
    this.audio.wave();
    this.emitHud();
  }

  restart() {
    this.resetMatch();
    this.phase = "prep";
    this.emitHud();
  }

  toMenu() {
    this.resetMatch();
    this.phase = "menu";
    this.emitHud();
  }

  togglePause() {
    if (this.phase !== "prep" && this.phase !== "combat") return;
    this.paused = !this.paused;
    this.emitHud();
  }

  selectType(id: TowerId | null) {
    this.selectedType = id;
    this.selectedId = -1;
    this.emitHud();
  }

  callWave() {
    if (this.phase !== "prep") return;
    const next = this.waveIndex + 1;
    if (next >= WAVE_COUNT) return;
    this.waveIndex = next;
    const def = WAVES[next];
    this.spawnQueue = [];
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) {
        this.spawnQueue.push({ t: g.delay + i * g.interval, type: g.type });
      }
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.waveAlive = this.spawnQueue.length;
    this.phase = "combat";
    this.paused = false;
    this.audio.wave();
    this.emitHud();
  }

  upgrade(kind: UpgradeKind) {
    const t = this.towers.find((x) => x.id === this.selectedId);
    if (!t) return;
    const def = TOWERS[t.type];
    const level = kind === "damage" ? t.dmgLevel : t.rateLevel;
    const step = def.upgrades[kind][level];
    if (!step || this.gold < step.cost) return;
    this.gold -= step.cost;
    t.spent += step.cost;
    if (kind === "damage") t.dmgLevel += 1;
    else t.rateLevel += 1;
    this.audio.upgrade();
    this.emitHud();
  }

  sellSelected() {
    const i = this.towers.findIndex((x) => x.id === this.selectedId);
    if (i < 0) return;
    const t = this.towers[i];
    const value = Math.floor(t.spent * SELL_RATIO);
    this.gold += value;
    this.towers.splice(i, 1);
    this.selectedId = -1;
    this.audio.sell();
    this.burst(t.x, t.y, "#c4c8d0", 10);
    this.emitHud();
  }

  cycleTargeting() {
    const t = this.towers.find((x) => x.id === this.selectedId);
    if (!t) return;
    t.targeting =
      t.targeting === "first"
        ? "strong"
        : t.targeting === "strong"
          ? "close"
          : "first";
    this.emitHud();
  }

  snapshot(): HudSnapshot {
    const wave = WAVES[Math.max(0, this.waveIndex)] ?? WAVES[0];
    const selected = this.towers.find((x) => x.id === this.selectedId);
    let selectedTower: HudSnapshot["selectedTower"] = null;
    if (selected) {
      const def = TOWERS[selected.type];
      const dmgStep = def.upgrades.damage[selected.dmgLevel];
      const rateStep = def.upgrades.rate[selected.rateLevel];
      selectedTower = {
        id: selected.id,
        type: selected.type,
        name: def.name,
        damage: this.towerDamage(selected),
        fireRate: this.towerRate(selected),
        range: def.range,
        targeting: selected.targeting,
        spent: selected.spent,
        dmgLevel: selected.dmgLevel,
        rateLevel: selected.rateLevel,
        dmgCost: dmgStep ? dmgStep.cost : null,
        rateCost: rateStep ? rateStep.cost : null,
        sellValue: Math.floor(selected.spent * SELL_RATIO),
      };
    }
    return {
      phase: this.phase,
      gold: this.gold,
      lives: this.lives,
      wave: this.waveIndex + 1,
      waveName: this.waveIndex < 0 ? WAVES[0].name : wave.name,
      waveCount: WAVE_COUNT,
      remaining: this.waveAlive,
      paused: this.paused,
      muted: this.audio.muted,
      selectedType: this.selectedType,
      selectedTower,
    };
  }

  private pool() {
    for (let i = 0; i < MAX_ENEMIES; i++) this.enemies.push(this.blankEnemy());
    for (let i = 0; i < MAX_SHOTS; i++) this.shots.push(this.blankShot());
    for (let i = 0; i < MAX_PARTICLES; i++)
      this.particles.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 2,
        color: "#fff",
      });
    for (let i = 0; i < MAX_FLOATERS; i++)
      this.floaters.push({
        alive: false,
        x: 0,
        y: 0,
        text: "",
        life: 0,
        color: "#fff",
      });
  }

  private blankEnemy(): Enemy {
    return {
      alive: false,
      id: 0,
      type: "walker",
      x: 0,
      y: 0,
      wp: 0,
      hp: 1,
      maxHp: 1,
      speed: 1,
      gold: 0,
      armor: 0,
      size: 40,
      lives: 1,
      pathDist: 0,
      slowT: 0,
      slowMul: 1,
      flash: 0,
      frame: 0,
      distAnim: 0,
    };
  }

  private blankShot(): Shot {
    return {
      alive: false,
      type: "ballista",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      target: null,
      destX: 0,
      destY: 0,
      damage: 0,
      splash: 0,
      slow: 0,
      slowTime: 0,
      speed: 1,
      ttl: 0,
      homing: true,
      arc: 0,
    };
  }

  private resetMatch() {
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.waveIndex = -1;
    this.selectedType = null;
    this.selectedId = -1;
    this.paused = false;
    this.towers = [];
    this.spawnQueue = [];
    this.waveAlive = 0;
    this.trauma = 0;
    for (const e of this.enemies) e.alive = false;
    for (const s of this.shots) s.alive = false;
    for (const p of this.particles) p.alive = false;
    for (const f of this.floaters) f.alive = false;
  }

  private emitHud() {
    this.hooks.onHud(this.snapshot());
  }

  private towerDamage(t: Tower) {
    const def = TOWERS[t.type];
    let d = def.damage;
    for (let i = 0; i < t.dmgLevel; i++) d += def.upgrades.damage[i].add;
    return d;
  }

  private towerRate(t: Tower) {
    const def = TOWERS[t.type];
    let r = def.fireRate;
    for (let i = 0; i < t.rateLevel; i++) r += def.upgrades.rate[i].add;
    return r;
  }

  private step(dt: number) {
    this.moteT += dt;
    if (this.phase === "menu") {
      this.stepFx(dt);
      return;
    }
    if (this.paused || this.phase === "victory" || this.phase === "defeat") {
      this.stepFx(dt);
      return;
    }

    this.spawn(dt);
    this.stepEnemies(dt);
    this.stepTowers(dt);
    this.stepShots(dt);
    this.stepFx(dt);

    if (this.phase === "combat" && this.spawnQueue.length === 0 && this.waveAlive <= 0) {
      this.gold += WAVES[this.waveIndex].bonus;
      if (this.waveIndex >= WAVE_COUNT - 1) {
        this.phase = "victory";
        this.selectedType = null;
        this.audio.victory();
        this.burst(WORLD_W - 40, WAYPOINTS[WAYPOINTS.length - 1].y, "#c4b89a", 40);
      } else {
        this.phase = "prep";
      }
      this.emitHud();
    }

    this.hudClock += dt;
    if (this.hudClock > 0.12) {
      this.hudClock = 0;
      this.emitHud();
    }
  }

  private spawn(dt: number) {
    if (this.phase !== "combat") return;
    for (const s of this.spawnQueue) s.t -= dt;
    while (this.spawnQueue.length && this.spawnQueue[0].t <= 0) {
      const job = this.spawnQueue.shift()!;
      this.spawnEnemy(job.type);
    }
  }

  private spawnEnemy(type: EnemyId) {
    const slot = this.enemies.find((e) => !e.alive);
    if (!slot) return;
    const def = ENEMIES[type];
    const scale = waveHpScale(Math.max(0, this.waveIndex));
    const hp = Math.round(def.hp * (type === "boss" ? 1 : scale));
    const start = WAYPOINTS[0];
    slot.alive = true;
    slot.id = this.nextId++;
    slot.type = type;
    slot.x = start.x;
    slot.y = start.y;
    slot.wp = 1;
    slot.hp = hp;
    slot.maxHp = hp;
    slot.speed = def.speed;
    slot.gold = def.gold;
    slot.armor = def.armor;
    slot.size = def.size;
    slot.lives = def.lives;
    slot.pathDist = 0;
    slot.slowT = 0;
    slot.slowMul = 1;
    slot.flash = 0;
    slot.frame = 0;
    slot.distAnim = 0;
  }

  private stepEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.slowT > 0) e.slowT -= dt;
      const mul = e.slowT > 0 ? 1 - e.slowMul : 1;
      const spd = e.speed * mul;
      const target = WAYPOINTS[e.wp];
      if (!target) {
        this.leak(e);
        continue;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      const step = spd * dt;
      if (d <= step || d < 1.2) {
        e.x = target.x;
        e.y = target.y;
        e.pathDist += d;
        e.distAnim += d;
        e.wp += 1;
        if (e.wp >= WAYPOINTS.length) this.leak(e);
      } else {
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
        e.pathDist += step;
        e.distAnim += step;
      }
      e.frame = Math.floor(e.distAnim / 18) % 4;
      if (e.flash > 0) e.flash -= dt;
    }
  }

  private leak(e: Enemy) {
    e.alive = false;
    this.waveAlive = Math.max(0, this.waveAlive - 1);
    this.lives = Math.max(0, this.lives - e.lives);
    this.trauma = Math.min(1, this.trauma + (e.type === "boss" ? 0.8 : 0.35));
    this.audio.leak();
    this.burst(e.x, e.y, "#c45c4a", 16);
    if (this.lives <= 0) {
      this.phase = "defeat";
      this.selectedType = null;
      this.audio.defeat();
    }
    this.emitHud();
  }

  private stepTowers(dt: number) {
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const def = TOWERS[t.type];
      const target = this.pickTarget(t, def.range);
      if (!target) continue;
      this.fire(t, target);
      t.cooldown = 1 / this.towerRate(t);
    }
  }

  private pickTarget(t: Tower, range: number): Enemy | null {
    const r2 = range * range;
    let best: Enemy | null = null;
    let score = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(t.x, t.y, e.x, e.y);
      if (d2 > r2) continue;
      let s = 0;
      if (t.targeting === "first") s = e.pathDist;
      else if (t.targeting === "strong") s = e.hp;
      else s = -d2;
      if (s > score) {
        score = s;
        best = e;
      }
    }
    return best;
  }

  private fire(t: Tower, target: Enemy) {
    const def = TOWERS[t.type];
    const slot = this.shots.find((s) => !s.alive);
    if (!slot) return;
    const aimX = target.x;
    const aimY = target.y;
    const dx = aimX - t.x;
    const dy = aimY - t.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = def.projectileSpeed;
    slot.alive = true;
    slot.type = t.type;
    slot.x = t.x;
    slot.y = t.y - 18;
    slot.vx = (dx / d) * speed;
    slot.vy = (dy / d) * speed;
    slot.target = target;
    slot.destX = aimX;
    slot.destY = aimY;
    slot.damage = this.towerDamage(t);
    slot.splash = def.splash;
    slot.slow = def.slow;
    slot.slowTime = def.slowTime;
    slot.speed = speed;
    slot.ttl = 2.4;
    slot.homing = t.type !== "mortar";
    slot.arc = t.type === "mortar" ? 1 : 0;
    this.audio.shoot(def.projectile);
  }

  private stepShots(dt: number) {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.ttl -= dt;
      if (s.ttl <= 0) {
        s.alive = false;
        continue;
      }
      if (s.homing && s.target?.alive) {
        const dx = s.target.x - s.x;
        const dy = s.target.y - 10 - s.y;
        const d = Math.hypot(dx, dy) || 1;
        s.vx = (dx / d) * s.speed;
        s.vy = (dy / d) * s.speed;
        s.destX = s.target.x;
        s.destY = s.target.y;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const hitR = s.type === "mortar" ? 18 : 14;
      const destHit = dist2(s.x, s.y, s.destX, s.destY) < hitR * hitR;
      const targetHit =
        s.target?.alive &&
        dist2(s.x, s.y, s.target.x, s.target.y - 10) < hitR * hitR;
      if (destHit || targetHit) {
        this.impact(s);
        s.alive = false;
      }
    }
  }

  private impact(s: Shot) {
    const x = s.destX;
    const y = s.destY;
    const color =
      s.type === "rime" ? "#9ad4e0" : s.type === "mortar" ? "#c4a070" : "#ecece8";
    this.burst(x, y, color, s.splash > 0 ? 22 : 8);
    if (s.splash > 0) {
      this.trauma = Math.min(1, this.trauma + 0.18);
      const r2 = s.splash * s.splash;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(x, y, e.x, e.y) <= r2) this.hurt(e, s);
      }
    } else if (s.target?.alive) {
      this.hurt(s.target, s);
    } else {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(x, y, e.x, e.y) < 22 * 22) {
          this.hurt(e, s);
          break;
        }
      }
    }
  }

  private hurt(e: Enemy, s: Shot) {
    const dmg = Math.max(1, Math.round(s.damage * (1 - e.armor)));
    e.hp -= dmg;
    e.flash = 0.08;
    if (s.slow > 0) {
      e.slowMul = s.slow;
      e.slowT = Math.max(e.slowT, s.slowTime);
    }
    this.float(e.x, e.y - e.size, `${dmg}`, s.type === "rime" ? "#9ad4e0" : "#ecece8");
    this.audio.hit();
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy) {
    e.alive = false;
    this.waveAlive = Math.max(0, this.waveAlive - 1);
    this.gold += e.gold;
    this.audio.death();
    this.burst(e.x, e.y, "#c45c4a", e.type === "boss" ? 36 : 14);
    this.float(e.x, e.y - 12, `+${e.gold}`, "#c4b89a");
    if (e.type === "boss") this.trauma = Math.min(1, this.trauma + 0.55);
    this.emitHud();
  }

  private burst(x: number, y: number, color: string, n: number) {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 30;
      p.life = 0.28 + Math.random() * 0.35;
      p.max = p.life;
      p.size = 1.5 + Math.random() * 2.8;
      p.color = color;
      spawned += 1;
      if (spawned >= n) break;
    }
  }

  private float(x: number, y: number, text: string, color: string) {
    const slot = this.floaters.find((f) => !f.alive);
    if (!slot) return;
    slot.alive = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.life = 0.7;
    slot.color = color;
  }

  private stepFx(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      if (p.life <= 0) p.alive = false;
    }
    for (const f of this.floaters) {
      if (!f.alive) continue;
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) f.alive = false;
    }
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
    this.emitHud();
  }

  private bind() {
    this.canvas.addEventListener("pointermove", this.handlePointer);
    this.canvas.addEventListener("pointerdown", this.handlePointer);
    this.canvas.addEventListener("pointerleave", this.handlePointer);
    window.addEventListener("keydown", this.handleKey);
    window.addEventListener("resize", this.handleResize);
  }

  private unbind() {
    this.canvas.removeEventListener("pointermove", this.handlePointer);
    this.canvas.removeEventListener("pointerdown", this.handlePointer);
    this.canvas.removeEventListener("pointerleave", this.handlePointer);
    window.removeEventListener("keydown", this.handleKey);
    window.removeEventListener("resize", this.handleResize);
  }

  private handlePointer = (ev: PointerEvent) => {
    const world = this.toWorld(ev.clientX, ev.clientY);
    if (ev.type === "pointerleave") {
      this.hoverC = -1;
      this.hoverR = -1;
      return;
    }
    const c = Math.floor(world.x / CELL);
    const r = Math.floor(world.y / CELL);
    this.hoverC = c;
    this.hoverR = r;
    if (ev.type !== "pointerdown") return;
    if (this.phase === "menu" || this.phase === "victory" || this.phase === "defeat")
      return;
    if (this.paused) return;

    const tower = this.towers.find((t) => t.c === c && t.r === r);
    if (tower) {
      this.selectedId = tower.id;
      this.selectedType = null;
      this.emitHud();
      return;
    }
    if (this.selectedType) {
      this.tryPlace(c, r);
      return;
    }
    this.selectedId = -1;
    this.emitHud();
  };

  private handleKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      this.selectedType = null;
      this.selectedId = -1;
      this.emitHud();
    } else if (ev.key === "1") this.selectType("ballista");
    else if (ev.key === "2") this.selectType("mortar");
    else if (ev.key === "3") this.selectType("rime");
    else if (ev.key === " " || ev.code === "Space") {
      ev.preventDefault();
      if (this.phase === "prep") this.callWave();
      else this.togglePause();
    }
  };

  private handleResize = () => {
    this.resize();
  };

  private tryPlace(c: number, r: number) {
    if (!this.selectedType) return;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    if (!this.canBuild(c, r)) return;
    const def = TOWERS[this.selectedType];
    if (this.gold < def.cost) return;
    this.gold -= def.cost;
    const pos = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL };
    this.towers.push({
      id: this.nextId++,
      type: this.selectedType,
      c,
      r,
      x: pos.x,
      y: pos.y,
      cooldown: 0.15,
      targeting: "first",
      dmgLevel: 0,
      rateLevel: 0,
      spent: def.cost,
    });
    this.audio.place();
    this.burst(pos.x, pos.y, "#c4c8d0", 8);
    this.emitHud();
  }

  canBuild(c: number, r: number) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    if (isPathCell(c, r)) return false;
    if (this.towers.some((t) => t.c === c && t.r === r)) return false;
    return true;
  }

  private toWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.view.ox) / this.view.scale;
    const y = (clientY - rect.top - this.view.oy) / this.view.scale;
    return { x, y };
  }

  resize() {
    const parent = this.canvas.parentElement;
    const cssW = parent?.clientWidth ?? window.innerWidth;
    const cssH = parent?.clientHeight ?? window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * dpr));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const scale = Math.min(cssW / WORLD_W, cssH / WORLD_H);
    this.view = {
      scale,
      ox: (cssW - WORLD_W * scale) / 2,
      oy: (cssH - WORLD_H * scale) / 2,
      cssW,
      cssH,
    };
  }

  private draw() {
    const ctx = this.ctx;
    const { scale, ox, oy } = this.view;
    const dpr = this.canvas.width / Math.max(1, this.view.cssW);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.view.cssW, this.view.cssH);
    ctx.fillStyle = "#0c0c0e";
    ctx.fillRect(0, 0, this.view.cssW, this.view.cssH);

    let sx = 0;
    let sy = 0;
    if (!this.reducedMotion && this.trauma > 0) {
      const mag = this.trauma * this.trauma * 10;
      sx = (Math.random() * 2 - 1) * mag;
      sy = (Math.random() * 2 - 1) * mag;
    }

    ctx.save();
    ctx.translate(ox + sx, oy + sy);
    ctx.scale(scale, scale);
    this.drawWorld();
    ctx.restore();
  }

  private drawWorld() {
    const ctx = this.ctx;
    ctx.drawImage(this.images.map, 0, 0, WORLD_W, WORLD_H);

    this.drawPathOverlay();
    this.drawBuildGrid();
    this.drawKeep();

    const sprites: Array<{ y: number; draw: () => void }> = [];
    for (const t of this.towers) {
      sprites.push({ y: t.y, draw: () => this.drawTower(t) });
    }
    for (const e of this.enemies) {
      if (e.alive) sprites.push({ y: e.y, draw: () => this.drawEnemy(e) });
    }
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) s.draw();

    this.drawShots();
    this.drawRange();
    this.drawParticles();
    this.drawFloaters();
    this.drawAsh();
  }

  private drawPathOverlay() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(196, 184, 154, 0.12)";
    ctx.lineWidth = 46;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
    for (let i = 1; i < WAYPOINTS.length; i++) {
      ctx.lineTo(WAYPOINTS[i].x, WAYPOINTS[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawBuildGrid() {
    if (!this.selectedType && this.selectedId < 0) return;
    const ctx = this.ctx;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL;
        const y = r * CELL;
        const path = PATH_CELLS.has(`${c},${r}`);
        const hover = c === this.hoverC && r === this.hoverR;
        if (this.selectedType) {
          ctx.fillStyle = path
            ? "rgba(196, 92, 74, 0.08)"
            : "rgba(196, 200, 208, 0.06)";
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
        if (hover && this.selectedType) {
          const ok = this.canBuild(c, r) && this.gold >= TOWERS[this.selectedType].cost;
          ctx.strokeStyle = ok ? "rgba(236, 236, 232, 0.85)" : "rgba(196, 92, 74, 0.9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
          if (ok) {
            const def = TOWERS[this.selectedType];
            const img = this.images.towers[this.selectedType];
            const cx = x + CELL / 2;
            const cy = y + CELL / 2;
            ctx.globalAlpha = 0.55;
            this.blit(img, cx, cy + 18, def.drawSize, def.drawSize);
            ctx.globalAlpha = 1;
            this.ring(cx, cy, def.range, "rgba(196, 200, 208, 0.35)");
          }
        }
      }
    }
  }

  private drawKeep() {
    const img = this.images.keep;
    const x = WORLD_W - 78;
    const y = WAYPOINTS[WAYPOINTS.length - 1].y + 36;
    this.blit(img, x, y, 156, 156);
  }

  private drawTower(t: Tower) {
    const def = TOWERS[t.type];
    const img = this.images.towers[t.type];
    this.blit(img, t.x, t.y + 22, def.drawSize, def.drawSize);
    if (t.id === this.selectedId) {
      this.ring(t.x, t.y, 28, "rgba(236, 236, 232, 0.9)");
      this.ring(t.x, t.y, def.range, "rgba(196, 200, 208, 0.4)");
    }
  }

  private drawEnemy(e: Enemy) {
    const frames = this.images.enemies[e.type];
    const img = frames[e.frame] ?? frames[0];
    const next = WAYPOINTS[Math.min(e.wp, WAYPOINTS.length - 1)];
    const flip = next && next.x < e.x - 4;
    const ctx = this.ctx;
    if (e.slowT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#7ec8d4";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 4, e.size * 0.38, e.size * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (e.flash > 0) {
      ctx.save();
      ctx.filter = "brightness(2.2)";
      this.blit(img, e.x, e.y + 8, e.size, e.size, flip);
      ctx.restore();
    } else {
      this.blit(img, e.x, e.y + 8, e.size, e.size, flip);
    }
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    const bw = Math.max(22, e.size * 0.7);
    const bh = 4;
    const bx = e.x - bw / 2;
    const by = e.y - e.size + 6;
    ctx.fillStyle = "rgba(12, 12, 14, 0.7)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = ratio > 0.5 ? "#7a9a7a" : ratio > 0.25 ? "#c4a070" : "#c45c4a";
    ctx.fillRect(bx, by, bw * ratio, bh);
  }

  private drawShots() {
    const ctx = this.ctx;
    for (const s of this.shots) {
      if (!s.alive) continue;
      const img = this.images.projectiles[TOWERS[s.type].projectile];
      const ang = Math.atan2(s.vy, s.vx);
      const size = s.type === "mortar" ? 22 : s.type === "rime" ? 18 : 28;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  private drawRange() {
    const t = this.towers.find((x) => x.id === this.selectedId);
    if (!t) return;
    this.ring(t.x, t.y, TOWERS[t.type].range, "rgba(196, 200, 208, 0.28)");
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      if (!p.alive) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawFloaters() {
    const ctx = this.ctx;
    ctx.font = "600 13px Outfit, sans-serif";
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      if (!f.alive) continue;
      ctx.globalAlpha = clamp(f.life / 0.7, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  private drawAsh() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#ecece8";
    for (let i = 0; i < 18; i++) {
      const x = ((i * 137 + this.moteT * (8 + (i % 5))) % WORLD_W);
      const y = ((i * 89 + this.moteT * (6 + (i % 3))) % WORLD_H);
      ctx.beginPath();
      ctx.arc(x, y, 1.1 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private blit(
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    flip = false,
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }

  private ring(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
