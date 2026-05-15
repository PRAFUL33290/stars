import React, { useEffect, useRef, useState, useCallback } from "react";

/* =============================================================================
 * SPACE SHOOTER v4 — SNES 16-bit Co-op Shmup
 *
 * v4 :
 *   - Support 1, 2 ou 3 joueurs (P3 = Y-Wing vert, touches IJKL+U+O)
 *   - 10 niveaux sélectionnables, du tutoriel à l'impossible
 *   - Vaisseaux et ennemis agrandis (sprites x1.5)
 *   - Fusion possible entre 2 OU 3 joueurs
 * ===========================================================================*/

type Vec = { x: number; y: number };

type EffectType = "spread" | "rapid" | "laser";

type WeaponLevels = {
  spread: 0 | 1 | 2 | 3;
  rapid: 0 | 1 | 2 | 3;
  laser: 0 | 1 | 2 | 3;
};

type ShipType = "xwing" | "awing" | "ywing";

type Player = {
  id: 1 | 2 | 3;
  pos: Vec;
  color: string;
  hp: number;
  maxHp: number;
  bombs: number;
  charging: boolean;
  chargeStart: number;
  cooldown: number;
  alive: boolean;
  iFrames: number;
  shipType: ShipType;
  effects: Map<EffectType, number>;
  shieldHits: number;
  weaponLevels: WeaponLevels;
};

type FusionState =
  | { kind: "separate"; proximityTimer: number }
  | { kind: "merging"; timer: number; maxTimer: number; playerCount: number }
  | { kind: "fused"; pos: Vec; hp: number; maxHp: number; charging: boolean; chargeStart: number; cooldown: number; iFrames: number; playerCount: number };

type BulletKind = "normal" | "charged" | "laser" | "enemy";

type Bullet = {
  pos: Vec;
  vel: Vec;
  owner: 1 | 2 | 3 | "enemy";
  damage: number;
  size: number;
  color: string;
  kind: BulletKind;
};

type EnemyType = "grunt" | "tank" | "sniper" | "kamikaze";

type Enemy = {
  pos: Vec;
  vel: Vec;
  hp: number;
  maxHp: number;
  type: EnemyType;
  shootCooldown: number;
  oscPhase: number;
  baseY: number;
  lockTarget?: { x: number; y: number };
  lockTimer?: number;
  dived?: boolean;
};

type Boss = {
  pos: Vec;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  attackTimer: number;
  attackPattern: number;
  oscPhase: number;
  entryProgress: number;
};

type MiniBoss = {
  pos: Vec;
  hp: number;
  maxHp: number;
  attackTimer: number;
  attackPattern: number;
  oscPhase: number;
  entryProgress: number;
  laserAngle: number;
  laserActive: boolean;
  laserCharge: number;
};

type PowerUpType = "spread" | "rapid" | "shield" | "heal" | "bomb" | "laser";

type PowerUp = {
  pos: Vec;
  vel: Vec;
  type: PowerUpType;
  bob: number;
};

type Particle = {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type Star = { x: number; y: number; speed: number; size: number; brightness: number };

type FloatingText = {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
};

type GameState = "menu" | "playerSelect" | "levelSelect" | "playing" | "victory" | "gameover";

type WaveEvent =
  | { at: number; kind: "spawn"; enemy: EnemyType; count: number; pattern?: "row" | "diag" | "rand" }
  | { at: number; kind: "boss" }
  | { at: number; kind: "miniboss" }
  | { at: number; kind: "message"; text: string }
  | { at: number; kind: "powerup"; type: PowerUpType };

type LevelConfig = {
  id: number;
  name: string;
  subtitle: string;
  difficulty: 1 | 2 | 3 | 4 | 5;        // étoiles
  bossHpMul: number;
  enemyHpMul: number;
  enemyDmgMul: number;
  script: WaveEvent[];
};

// --- Constantes -------------------------------------------------------------

const CANVAS_W = 960;
const CANVAS_H = 540;

const MAX_CHARGE_FRAMES = 90;
const PLAYER_SPEED = 4;
const PLAYER_AUTO_FIRE_CD = 12;
const PLAYER_RAPID_FIRE_CD = 4;

// Tailles des vaisseaux v4 (~1.5x plus gros qu'avant)
const SHIP_W = 64;
const SHIP_H = 48;
const ENEMY_W = 56;
const ENEMY_H = 52;
const FUSED_W = 80;
const FUSED_H = 56;

const COMBO_TIMEOUT = 180;
const POWERUP_DROP_CHANCE = 0.18;
const EFFECT_DURATION = 600;

const FUSION_PROXIMITY = 70;            // un peu plus tolérant car vaisseaux plus gros
const FUSION_HOLD_FRAMES = 120;
const FUSION_MERGE_FRAMES = 30;

const COLORS = {
  bg: "#000010",
  p1: "#E24B4A", p1Dark: "#791F1F", p1Glow: "#F09595",
  p2: "#378ADD", p2Dark: "#0C447C", p2Glow: "#85B7EB",
  p3: "#5DCAA5", p3Dark: "#1F5C44", p3Glow: "#A0E5C9",
  enemy: "#888780", enemyDark: "#444441", enemyEye: "#E24B4A",
  tank: "#5F5E5A", tankDark: "#2C2C2A", tankAccent: "#FAC775",
  sniper: "#0F6E56", sniperDark: "#04342C", sniperEye: "#E24B4A",
  kamikaze: "#D85A30", kamikazeDark: "#712B13",
  boss: "#A32D2D", bossDark: "#501313", bossEye: "#FAC775",
  bossShield: "#7F77DD",
  miniboss: "#7042A6", minibossDark: "#3A1F5C", minibossEye: "#FFD27A",
  fusion: "#FF99FF", fusionDark: "#7A2D7A", fusionGlow: "#FFCCFF",
  charge: "#FAC775", chargeMax: "#F5C4B3",
  laser: "#FF66FF",
};

const POWERUP_COLORS: Record<PowerUpType, { main: string; dark: string; label: string }> = {
  spread:  { main: "#378ADD", dark: "#0C447C", label: "S" },
  rapid:   { main: "#FAC775", dark: "#854F0B", label: "R" },
  shield:  { main: "#1D9E75", dark: "#085041", label: "▣" },
  heal:    { main: "#E24B4A", dark: "#791F1F", label: "+" },
  bomb:    { main: "#F5C4B3", dark: "#993C1D", label: "★" },
  laser:   { main: "#FF66FF", dark: "#993556", label: "L" },
};

// --- 10 Niveaux ------------------------------------------------------------

const LEVELS: LevelConfig[] = [
  {
    id: 1, name: "PATROL", subtitle: "Basic training",
    difficulty: 1, bossHpMul: 0.6, enemyHpMul: 0.8, enemyDmgMul: 0.7,
    script: [
      { at: 1, kind: "message", text: "LEVEL 1 — TRAINING PATROL" },
      { at: 3, kind: "spawn", enemy: "grunt", count: 2, pattern: "row" },
      { at: 8, kind: "spawn", enemy: "grunt", count: 3, pattern: "diag" },
      { at: 14, kind: "powerup", type: "spread" },
      { at: 16, kind: "spawn", enemy: "grunt", count: 3, pattern: "rand" },
      { at: 22, kind: "spawn", enemy: "grunt", count: 4, pattern: "row" },
      { at: 28, kind: "powerup", type: "heal" },
      { at: 32, kind: "spawn", enemy: "grunt", count: 4, pattern: "diag" },
      { at: 40, kind: "message", text: "WARNING : COMMANDER INCOMING" },
      { at: 44, kind: "powerup", type: "rapid" },
      { at: 50, kind: "boss" },
    ],
  },
  {
    id: 2, name: "ASTEROID BELT", subtitle: "First contact",
    difficulty: 2, bossHpMul: 0.8, enemyHpMul: 0.9, enemyDmgMul: 0.85,
    script: [
      { at: 1, kind: "message", text: "LEVEL 2 — ASTEROID BELT" },
      { at: 4, kind: "spawn", enemy: "grunt", count: 3, pattern: "row" },
      { at: 9, kind: "spawn", enemy: "kamikaze", count: 2 },
      { at: 14, kind: "powerup", type: "spread" },
      { at: 18, kind: "spawn", enemy: "grunt", count: 4, pattern: "diag" },
      { at: 25, kind: "spawn", enemy: "tank", count: 1 },
      { at: 30, kind: "miniboss" },
      { at: 50, kind: "spawn", enemy: "grunt", count: 5, pattern: "row" },
      { at: 56, kind: "powerup", type: "rapid" },
      { at: 60, kind: "spawn", enemy: "kamikaze", count: 3 },
      { at: 66, kind: "powerup", type: "heal" },
      { at: 70, kind: "boss" },
    ],
  },
  {
    id: 3, name: "OUTER RIM", subtitle: "Snipers and tanks",
    difficulty: 2, bossHpMul: 0.9, enemyHpMul: 1, enemyDmgMul: 0.9,
    script: [
      { at: 1, kind: "message", text: "LEVEL 3 — OUTER RIM" },
      { at: 4, kind: "spawn", enemy: "grunt", count: 4, pattern: "diag" },
      { at: 10, kind: "spawn", enemy: "sniper", count: 1 },
      { at: 16, kind: "powerup", type: "shield" },
      { at: 20, kind: "spawn", enemy: "tank", count: 1 },
      { at: 25, kind: "spawn", enemy: "grunt", count: 4, pattern: "row" },
      { at: 32, kind: "spawn", enemy: "kamikaze", count: 3 },
      { at: 38, kind: "miniboss" },
      { at: 58, kind: "spawn", enemy: "sniper", count: 2 },
      { at: 64, kind: "powerup", type: "spread" },
      { at: 68, kind: "spawn", enemy: "tank", count: 2 },
      { at: 76, kind: "spawn", enemy: "grunt", count: 6, pattern: "rand" },
      { at: 84, kind: "powerup", type: "rapid" },
      { at: 90, kind: "boss" },
    ],
  },
  {
    id: 4, name: "CONVOY RAID", subtitle: "Dense waves",
    difficulty: 3, bossHpMul: 1, enemyHpMul: 1.1, enemyDmgMul: 1,
    script: [
      { at: 1, kind: "message", text: "LEVEL 4 — CONVOY RAID" },
      { at: 3, kind: "spawn", enemy: "grunt", count: 5, pattern: "row" },
      { at: 8, kind: "spawn", enemy: "kamikaze", count: 3 },
      { at: 14, kind: "spawn", enemy: "tank", count: 2 },
      { at: 20, kind: "powerup", type: "rapid" },
      { at: 24, kind: "spawn", enemy: "grunt", count: 6, pattern: "diag" },
      { at: 32, kind: "spawn", enemy: "sniper", count: 2 },
      { at: 38, kind: "spawn", enemy: "kamikaze", count: 4 },
      { at: 44, kind: "miniboss" },
      { at: 66, kind: "spawn", enemy: "grunt", count: 8, pattern: "rand" },
      { at: 72, kind: "spawn", enemy: "tank", count: 2 },
      { at: 78, kind: "powerup", type: "shield" },
      { at: 82, kind: "spawn", enemy: "sniper", count: 2 },
      { at: 88, kind: "spawn", enemy: "kamikaze", count: 4 },
      { at: 94, kind: "powerup", type: "heal" },
      { at: 100, kind: "boss" },
    ],
  },
  {
    id: 5, name: "NEBULA STORM", subtitle: "Twin mini-bosses",
    difficulty: 3, bossHpMul: 1.1, enemyHpMul: 1.15, enemyDmgMul: 1.05,
    script: [
      { at: 1, kind: "message", text: "LEVEL 5 — NEBULA STORM" },
      { at: 3, kind: "spawn", enemy: "kamikaze", count: 4 },
      { at: 8, kind: "spawn", enemy: "grunt", count: 5, pattern: "row" },
      { at: 14, kind: "spawn", enemy: "sniper", count: 2 },
      { at: 20, kind: "miniboss" },
      { at: 42, kind: "powerup", type: "rapid" },
      { at: 46, kind: "spawn", enemy: "tank", count: 3 },
      { at: 54, kind: "spawn", enemy: "grunt", count: 8, pattern: "diag" },
      { at: 62, kind: "spawn", enemy: "kamikaze", count: 5 },
      { at: 70, kind: "miniboss" },
      { at: 92, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 98, kind: "powerup", type: "shield" },
      { at: 102, kind: "spawn", enemy: "grunt", count: 8, pattern: "rand" },
      { at: 108, kind: "powerup", type: "heal" },
      { at: 112, kind: "boss" },
    ],
  },
  {
    id: 6, name: "BULLET STORM", subtitle: "Sniper hell",
    difficulty: 4, bossHpMul: 1.2, enemyHpMul: 1.2, enemyDmgMul: 1.15,
    script: [
      { at: 1, kind: "message", text: "LEVEL 6 — BULLET STORM" },
      { at: 3, kind: "spawn", enemy: "sniper", count: 2 },
      { at: 10, kind: "spawn", enemy: "grunt", count: 6, pattern: "row" },
      { at: 16, kind: "spawn", enemy: "sniper", count: 2 },
      { at: 22, kind: "powerup", type: "laser" },
      { at: 26, kind: "spawn", enemy: "kamikaze", count: 5 },
      { at: 34, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 42, kind: "miniboss" },
      { at: 64, kind: "spawn", enemy: "tank", count: 3 },
      { at: 72, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 78, kind: "powerup", type: "rapid" },
      { at: 82, kind: "spawn", enemy: "grunt", count: 8, pattern: "diag" },
      { at: 92, kind: "spawn", enemy: "sniper", count: 4 },
      { at: 100, kind: "spawn", enemy: "kamikaze", count: 5 },
      { at: 108, kind: "powerup", type: "shield" },
      { at: 112, kind: "powerup", type: "heal" },
      { at: 118, kind: "boss" },
    ],
  },
  {
    id: 7, name: "CRIMSON SECTOR", subtitle: "Heavy armor",
    difficulty: 4, bossHpMul: 1.3, enemyHpMul: 1.4, enemyDmgMul: 1.2,
    script: [
      { at: 1, kind: "message", text: "LEVEL 7 — CRIMSON SECTOR" },
      { at: 3, kind: "spawn", enemy: "tank", count: 2 },
      { at: 10, kind: "spawn", enemy: "grunt", count: 6, pattern: "diag" },
      { at: 18, kind: "spawn", enemy: "tank", count: 3 },
      { at: 24, kind: "powerup", type: "rapid" },
      { at: 28, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 36, kind: "miniboss" },
      { at: 58, kind: "spawn", enemy: "tank", count: 4 },
      { at: 66, kind: "spawn", enemy: "kamikaze", count: 6 },
      { at: 74, kind: "spawn", enemy: "grunt", count: 8, pattern: "row" },
      { at: 80, kind: "powerup", type: "laser" },
      { at: 86, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 92, kind: "spawn", enemy: "tank", count: 4 },
      { at: 100, kind: "spawn", enemy: "kamikaze", count: 6 },
      { at: 110, kind: "powerup", type: "heal" },
      { at: 116, kind: "powerup", type: "shield" },
      { at: 124, kind: "boss" },
    ],
  },
  {
    id: 8, name: "TWIN FRIGATES", subtitle: "Double trouble",
    difficulty: 5, bossHpMul: 1.4, enemyHpMul: 1.4, enemyDmgMul: 1.25,
    script: [
      { at: 1, kind: "message", text: "LEVEL 8 — TWIN FRIGATES" },
      { at: 3, kind: "spawn", enemy: "kamikaze", count: 5 },
      { at: 10, kind: "spawn", enemy: "grunt", count: 7, pattern: "diag" },
      { at: 18, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 26, kind: "spawn", enemy: "tank", count: 3 },
      { at: 32, kind: "powerup", type: "laser" },
      { at: 38, kind: "miniboss" },
      { at: 42, kind: "miniboss" },        // DEUX en même temps !
      { at: 70, kind: "powerup", type: "heal" },
      { at: 74, kind: "spawn", enemy: "grunt", count: 10, pattern: "row" },
      { at: 82, kind: "spawn", enemy: "kamikaze", count: 7 },
      { at: 90, kind: "spawn", enemy: "sniper", count: 4 },
      { at: 98, kind: "spawn", enemy: "tank", count: 4 },
      { at: 106, kind: "powerup", type: "rapid" },
      { at: 112, kind: "spawn", enemy: "kamikaze", count: 6 },
      { at: 120, kind: "powerup", type: "shield" },
      { at: 124, kind: "powerup", type: "heal" },
      { at: 132, kind: "boss" },
    ],
  },
  {
    id: 9, name: "IMPERIAL GAUNTLET", subtitle: "No mercy",
    difficulty: 5, bossHpMul: 1.6, enemyHpMul: 1.5, enemyDmgMul: 1.35,
    script: [
      { at: 1, kind: "message", text: "LEVEL 9 — IMPERIAL GAUNTLET" },
      { at: 2, kind: "spawn", enemy: "grunt", count: 6, pattern: "row" },
      { at: 5, kind: "spawn", enemy: "kamikaze", count: 4 },
      { at: 10, kind: "spawn", enemy: "tank", count: 3 },
      { at: 14, kind: "spawn", enemy: "sniper", count: 3 },
      { at: 20, kind: "spawn", enemy: "kamikaze", count: 6 },
      { at: 26, kind: "miniboss" },
      { at: 32, kind: "spawn", enemy: "grunt", count: 8, pattern: "diag" },
      { at: 38, kind: "spawn", enemy: "tank", count: 4 },
      { at: 44, kind: "powerup", type: "laser" },
      { at: 48, kind: "spawn", enemy: "sniper", count: 4 },
      { at: 54, kind: "spawn", enemy: "kamikaze", count: 7 },
      { at: 60, kind: "miniboss" },
      { at: 70, kind: "spawn", enemy: "grunt", count: 10, pattern: "row" },
      { at: 78, kind: "spawn", enemy: "tank", count: 5 },
      { at: 86, kind: "spawn", enemy: "sniper", count: 5 },
      { at: 94, kind: "spawn", enemy: "kamikaze", count: 8 },
      { at: 102, kind: "miniboss" },
      { at: 130, kind: "powerup", type: "heal" },
      { at: 134, kind: "powerup", type: "shield" },
      { at: 138, kind: "powerup", type: "rapid" },
      { at: 144, kind: "boss" },
    ],
  },
  {
    id: 10, name: "DREADNAUGHT PRIME", subtitle: "Impossible alone",
    difficulty: 5, bossHpMul: 2.2, enemyHpMul: 1.7, enemyDmgMul: 1.6,
    script: [
      { at: 1, kind: "message", text: "LEVEL 10 — DREADNAUGHT PRIME" },
      { at: 2, kind: "message", text: "★ COOPERATION REQUIRED ★" },
      { at: 4, kind: "spawn", enemy: "kamikaze", count: 6 },
      { at: 8, kind: "spawn", enemy: "tank", count: 4 },
      { at: 14, kind: "spawn", enemy: "sniper", count: 4 },
      { at: 20, kind: "spawn", enemy: "grunt", count: 10, pattern: "diag" },
      { at: 26, kind: "miniboss" },
      { at: 30, kind: "miniboss" },
      { at: 56, kind: "spawn", enemy: "kamikaze", count: 8 },
      { at: 62, kind: "spawn", enemy: "tank", count: 5 },
      { at: 68, kind: "spawn", enemy: "sniper", count: 5 },
      { at: 74, kind: "powerup", type: "laser" },
      { at: 78, kind: "spawn", enemy: "kamikaze", count: 8 },
      { at: 84, kind: "miniboss" },
      { at: 90, kind: "miniboss" },
      { at: 118, kind: "spawn", enemy: "grunt", count: 12, pattern: "row" },
      { at: 126, kind: "spawn", enemy: "tank", count: 6 },
      { at: 134, kind: "spawn", enemy: "sniper", count: 6 },
      { at: 142, kind: "spawn", enemy: "kamikaze", count: 10 },
      { at: 150, kind: "miniboss" },
      { at: 160, kind: "message", text: "WARNING : DREADNAUGHT PRIME" },
      { at: 164, kind: "powerup", type: "heal" },
      { at: 168, kind: "powerup", type: "shield" },
      { at: 172, kind: "powerup", type: "rapid" },
      { at: 176, kind: "powerup", type: "laser" },
      { at: 180, kind: "boss" },
    ],
  },
];

// --- Système de médailles ---------------------------------------------------
type Medal = "bronze" | "silver" | "gold";
// Pour chaque level id : la meilleure médaille débloquée (ou null si jamais finie)
type MedalsStore = Record<number, Medal | null>;

const MEDALS_STORAGE_KEY = "starRaid2_medals_v1";

const loadMedals = (): MedalsStore => {
  try {
    const raw = localStorage.getItem(MEDALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as MedalsStore;
  } catch {
    return {};
  }
};

const saveMedals = (store: MedalsStore) => {
  try {
    localStorage.setItem(MEDALS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage indisponible (incognito strict, quota) : on ignore
  }
};

const medalRank = (m: Medal | null): number =>
  m === "gold" ? 3 : m === "silver" ? 2 : m === "bronze" ? 1 : 0;

// Sauvegarde uniquement si la nouvelle médaille est meilleure que l'ancienne
const upgradeMedal = (levelId: number, newMedal: Medal): MedalsStore => {
  const store = loadMedals();
  const existing = store[levelId] ?? null;
  if (medalRank(newMedal) > medalRank(existing)) {
    store[levelId] = newMedal;
    saveMedals(store);
  }
  return store;
};

// --- Composant --------------------------------------------------------------

const SpaceShooter: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const levelTimeRef = useRef(0);
  const scriptCursorRef = useRef(0);

  // Configuration partie
  const playerCountRef = useRef(2);                    // 1, 2 ou 3
  const currentLevelRef = useRef<LevelConfig>(LEVELS[0]);

  const playersRef = useRef<Player[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const bossRef = useRef<Boss | null>(null);
  const miniBossesRef = useRef<MiniBoss[]>([]);        // peut y en avoir plusieurs (lvl 8, 10)
  const fusionRef = useRef<FusionState>({ kind: "separate", proximityTimer: 0 });
  const powerUpsRef = useRef<PowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const keysRef = useRef<Set<string>>(new Set());

  const comboRef = useRef({ count: 0, multiplier: 1, timer: 0 });
  const shakeRef = useRef({ x: 0, y: 0, intensity: 0, duration: 0 });
  const messageRef = useRef<{ text: string; life: number; maxLife: number } | null>(null);

  const scoreRef = useRef(0);
  const noDeathRef = useRef(true); // passe à false si un joueur meurt durant la partie

  const [gameState, setGameState] = useState<GameState>("menu");
  const [selectedPlayerCount, setSelectedPlayerCount] = useState(2);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [medals, setMedals] = useState<MedalsStore>(() => loadMedals());
  const [lastEarnedMedal, setLastEarnedMedal] = useState<Medal | null>(null);

  type PlayerHud = { hp: number; maxHp: number; bombs: number; charge: number; effects: string[]; shield: number; levels: WeaponLevels; alive: boolean; color: string };
  const [hudData, setHudData] = useState({
    score: 0,
    combo: 1,
    comboCount: 0,
    players: [] as PlayerHud[],
    boss: null as { hp: number; maxHp: number; phase: number } | null,
    miniBoss: null as { hp: number; maxHp: number; count: number } | null,
    fusion: { kind: "separate" as "separate" | "merging" | "fused", progress: 0, hp: 0, maxHp: 200 },
  });

  // --- Audio chiptune ------------------------------------------------------
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
  }, []);

  const beep = useCallback((freq: number, duration: number, type: OscillatorType = "square", vol = 0.08, freqEnd?: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }, []);

  const noise = useCallback((duration: number, vol = 0.1) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }, []);

  const sfx = {
    shoot: () => beep(880, 0.05, "square", 0.04, 220),
    chargedShoot: () => { beep(220, 0.2, "sawtooth", 0.1, 110); beep(440, 0.2, "square", 0.05, 220); },
    explosion: () => { noise(0.25, 0.15); beep(120, 0.25, "sawtooth", 0.08, 40); },
    bigExplosion: () => { noise(0.5, 0.2); beep(80, 0.5, "sawtooth", 0.12, 30); },
    hit: () => beep(180, 0.08, "square", 0.06, 90),
    bomb: () => { beep(60, 0.6, "sawtooth", 0.15, 20); noise(0.6, 0.2); },
    powerup: () => { beep(440, 0.08, "square", 0.06); beep(660, 0.08, "square", 0.06); beep(880, 0.12, "square", 0.06); },
    combo: (tier: number) => {
      const base = 440 + tier * 110;
      beep(base, 0.08, "square", 0.05);
      beep(base * 1.5, 0.1, "triangle", 0.05);
    },
    bossWarning: () => { beep(200, 0.15, "square", 0.1); beep(150, 0.15, "square", 0.1); },
    fusion: () => { [330, 415, 523, 659, 880].forEach((f, i) => setTimeout(() => beep(f, 0.15, "triangle", 0.08), i * 60)); },
    defusion: () => { [880, 659, 523, 415, 330].forEach((f, i) => setTimeout(() => beep(f, 0.1, "square", 0.06), i * 50)); },
    upgrade: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep(f, 0.1, "square", 0.07), i * 40)); },
    victory: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.2, "square", 0.08), i * 150)); },
  };

  const triggerShake = (intensity: number, duration: number) => {
    if (intensity > shakeRef.current.intensity) {
      shakeRef.current.intensity = intensity;
      shakeRef.current.duration = duration;
    }
  };

  const initStars = useCallback(() => {
    const stars: Star[] = [];
    for (let layer = 0; layer < 3; layer++) {
      const count = 30 + layer * 20;
      const speed = 0.4 + layer * 0.8;
      const size = layer === 0 ? 1 : 2;
      const brightness = 0.4 + layer * 0.25;
      for (let i = 0; i < count; i++) {
        stars.push({ x: Math.random() * CANVAS_W, y: Math.random() * CANVAS_H, speed, size, brightness });
      }
    }
    starsRef.current = stars;
  }, []);

  // Construit la liste des joueurs selon playerCountRef
  const makePlayer = (id: 1 | 2 | 3, y: number): Player => {
    const config = {
      1: { color: COLORS.p1, shipType: "xwing" as ShipType },
      2: { color: COLORS.p2, shipType: "awing" as ShipType },
      3: { color: COLORS.p3, shipType: "ywing" as ShipType },
    }[id];
    return {
      id, pos: { x: 80, y: y - SHIP_H / 2 },
      color: config.color, hp: 100, maxHp: 100, bombs: 3,
      charging: false, chargeStart: 0, cooldown: 0, alive: true, iFrames: 0,
      shipType: config.shipType, effects: new Map(), shieldHits: 0,
      weaponLevels: { spread: 0, rapid: 0, laser: 0 },
    };
  };

  const resetGame = useCallback(() => {
    const count = playerCountRef.current;
    const players: Player[] = [];
    if (count === 1) {
      players.push(makePlayer(1, CANVAS_H / 2));
    } else if (count === 2) {
      players.push(makePlayer(1, CANVAS_H / 2 - 70));
      players.push(makePlayer(2, CANVAS_H / 2 + 70));
    } else {
      players.push(makePlayer(1, CANVAS_H / 2 - 100));
      players.push(makePlayer(2, CANVAS_H / 2));
      players.push(makePlayer(3, CANVAS_H / 2 + 100));
    }
    playersRef.current = players;
    bulletsRef.current = [];
    enemiesRef.current = [];
    bossRef.current = null;
    miniBossesRef.current = [];
    fusionRef.current = { kind: "separate", proximityTimer: 0 };
    powerUpsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    scoreRef.current = 0;
    noDeathRef.current = true;
    frameCountRef.current = 0;
    levelTimeRef.current = 0;
    scriptCursorRef.current = 0;
    comboRef.current = { count: 0, multiplier: 1, timer: 0 };
    shakeRef.current = { x: 0, y: 0, intensity: 0, duration: 0 };
    messageRef.current = null;
    initStars();
  }, [initStars]);

  // --- Combo ---------------------------------------------------------------
  const addKillToCombo = (worldX: number, worldY: number, points: number) => {
    const c = comboRef.current;
    c.count += 1;
    c.timer = COMBO_TIMEOUT;
    let newMul = 1;
    if (c.count >= 50) newMul = 16;
    else if (c.count >= 30) newMul = 8;
    else if (c.count >= 15) newMul = 4;
    else if (c.count >= 5) newMul = 2;
    if (newMul > c.multiplier) {
      c.multiplier = newMul;
      const tier = [1, 2, 4, 8, 16].indexOf(newMul);
      sfx.combo(tier);
      floatingTextsRef.current.push({
        pos: { x: worldX, y: worldY - 20 }, vel: { x: 0, y: -1.5 },
        life: 60, maxLife: 60, text: `×${newMul}!`, color: COLORS.charge, size: 18,
      });
      triggerShake(3, 8);
    }
    const earned = points * c.multiplier;
    scoreRef.current += earned;
    floatingTextsRef.current.push({
      pos: { x: worldX, y: worldY }, vel: { x: 0, y: -1.2 },
      life: 45, maxLife: 45, text: `+${earned}`, color: "#FFFFFF", size: 12,
    });
  };

  const breakCombo = () => {
    const c = comboRef.current;
    if (c.multiplier > 1) {
      floatingTextsRef.current.push({
        pos: { x: CANVAS_W / 2, y: 100 }, vel: { x: 0, y: 0 },
        life: 40, maxLife: 40, text: "COMBO BROKEN", color: "#FF4444", size: 16,
      });
    }
    c.count = 0; c.multiplier = 1; c.timer = 0;
  };

  // --- Tirs ----------------------------------------------------------------
  const playerGlow = (id: 1 | 2 | 3) => id === 1 ? COLORS.p1Glow : id === 2 ? COLORS.p2Glow : COLORS.p3Glow;
  const playerColor = (id: 1 | 2 | 3) => id === 1 ? COLORS.p1 : id === 2 ? COLORS.p2 : COLORS.p3;

  const fireCharged = (p: Player) => {
    const chargeFrames = Math.min(frameCountRef.current - p.chargeStart, MAX_CHARGE_FRAMES);
    const t = chargeFrames / MAX_CHARGE_FRAMES;
    const isMax = t > 0.95;
    const baseColor = playerColor(p.id);
    const glowColor = playerGlow(p.id);
    if (p.effects.has("laser")) return;
    const spreadLevel = p.weaponLevels.spread;
    const muzzleX = p.pos.x + SHIP_W;
    const muzzleY = p.pos.y + SHIP_H / 2;
    if (p.effects.has("spread")) {
      const dmgBonus = 1 + spreadLevel * 0.3;
      const damage = (isMax ? 60 : 8 + t * 22) * dmgBonus;
      const size = isMax ? 14 : 4 + t * 6;
      const numShots = spreadLevel >= 2 ? 7 : spreadLevel >= 1 ? 5 : 3;
      const spreadArc = 0.18 + spreadLevel * 0.06;
      for (let i = 0; i < numShots; i++) {
        const angle = -spreadArc + (i * 2 * spreadArc) / (numShots - 1);
        bulletsRef.current.push({
          pos: { x: muzzleX, y: muzzleY }, vel: { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 },
          owner: p.id, damage, size, color: isMax ? glowColor : baseColor,
          kind: isMax ? "charged" : "normal",
        });
      }
    } else {
      const size = isMax ? 20 : 5 + t * 9;
      const damage = isMax ? 80 : 10 + t * 30;
      const speed = isMax ? 14 : 9 + t * 3;
      bulletsRef.current.push({
        pos: { x: muzzleX, y: muzzleY }, vel: { x: speed, y: 0 },
        owner: p.id, damage, size, color: isMax ? glowColor : baseColor,
        kind: isMax ? "charged" : "normal",
      });
    }
    if (isMax) {
      sfx.chargedShoot();
      triggerShake(2, 6);
      spawnParticles(muzzleX, muzzleY, glowColor, 12, 3);
    } else if (t > 0.3) sfx.shoot();
  };

  const fireLaser = (p: Player) => {
    const level = p.weaponLevels.laser;
    const muzzleX = p.pos.x + SHIP_W;
    const muzzleY = p.pos.y + SHIP_H / 2;
    if (level >= 2) {
      for (const dy of [-10, 0, 10]) {
        bulletsRef.current.push({
          pos: { x: muzzleX, y: muzzleY + dy }, vel: { x: 18, y: 0 },
          owner: p.id, damage: 4 + level, size: 7 + level,
          color: COLORS.laser, kind: "laser",
        });
      }
    } else if (level >= 1) {
      for (const dy of [-8, 8]) {
        bulletsRef.current.push({
          pos: { x: muzzleX, y: muzzleY + dy }, vel: { x: 18, y: 0 },
          owner: p.id, damage: 4 + level, size: 7,
          color: COLORS.laser, kind: "laser",
        });
      }
    } else {
      bulletsRef.current.push({
        pos: { x: muzzleX, y: muzzleY }, vel: { x: 18, y: 0 },
        owner: p.id, damage: 4, size: 7, color: COLORS.laser, kind: "laser",
      });
    }
  };

  // --- Bombe ---------------------------------------------------------------
  const triggerBomb = (p: Player) => {
    p.bombs -= 1;
    sfx.bomb();
    triggerShake(12, 30);
    enemiesRef.current.forEach((e) => {
      e.hp = 0;
      spawnParticles(e.pos.x + ENEMY_W / 2, e.pos.y + ENEMY_H / 2, "#FFD27A", 18, 4);
    });
    if (bossRef.current) {
      bossRef.current.hp -= 80;
      spawnParticles(bossRef.current.pos.x + 60, bossRef.current.pos.y + 60, COLORS.boss, 40, 5);
    }
    miniBossesRef.current.forEach((m) => {
      m.hp -= 50;
      spawnParticles(m.pos.x + 30, m.pos.y + 40, COLORS.miniboss, 30, 5);
    });
    const cx = p.pos.x + SHIP_W / 2, cy = p.pos.y + SHIP_H / 2;
    for (let i = 0; i < 80; i++) {
      const ang = (i / 80) * Math.PI * 2;
      particlesRef.current.push({
        pos: { x: cx, y: cy }, vel: { x: Math.cos(ang) * 7, y: Math.sin(ang) * 7 },
        life: 50, maxLife: 50, size: 5, color: playerGlow(p.id),
      });
    }
    enemiesRef.current.forEach((e) => {
      if (e.hp <= 0) addKillToCombo(e.pos.x + ENEMY_W / 2, e.pos.y + ENEMY_H / 2, 50);
    });
    enemiesRef.current = enemiesRef.current.filter((e) => e.hp > 0);
  };

  const spawnParticles = (x: number, y: number, color: string, count: number, spread: number) => {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread + 1;
      particlesRef.current.push({
        pos: { x, y }, vel: { x: Math.cos(ang) * sp, y: Math.sin(ang) * sp },
        life: 25 + Math.random() * 15, maxLife: 40,
        size: 2 + Math.random() * 3, color,
      });
    }
  };

  // --- Spawn ennemis -------------------------------------------------------
  const spawnEnemyOfType = (type: EnemyType, count: number, pattern: "row" | "diag" | "rand" = "rand") => {
    for (let i = 0; i < count; i++) {
      let y: number, x: number;
      if (pattern === "row") {
        y = 60 + (i * (CANVAS_H - 140)) / Math.max(1, count - 1);
        x = CANVAS_W + 20;
      } else if (pattern === "diag") {
        y = 40 + i * 55;
        x = CANVAS_W + 20 + i * 40;
      } else {
        y = 40 + Math.random() * (CANVAS_H - 120);
        x = CANVAS_W + 20 + i * 30;
      }
      enemiesRef.current.push(makeEnemy(type, x, y));
    }
  };

  const makeEnemy = (type: EnemyType, x: number, y: number): Enemy => {
    const hpMul = currentLevelRef.current.enemyHpMul;
    if (type === "tank") {
      return { pos: { x, y }, vel: { x: -1, y: 0 }, hp: 120 * hpMul, maxHp: 120 * hpMul, type, shootCooldown: 60, oscPhase: 0, baseY: y };
    }
    if (type === "sniper") {
      return { pos: { x, y }, vel: { x: -2, y: 0 }, hp: 40 * hpMul, maxHp: 40 * hpMul, type, shootCooldown: 120, oscPhase: 0, baseY: y, lockTimer: 0 };
    }
    if (type === "kamikaze") {
      return { pos: { x, y }, vel: { x: -3.5, y: 0 }, hp: 20 * hpMul, maxHp: 20 * hpMul, type, shootCooldown: 9999, oscPhase: 0, baseY: y, dived: false };
    }
    return { pos: { x, y }, vel: { x: -(2 + Math.random()), y: 0 }, hp: 30 * hpMul, maxHp: 30 * hpMul, type: "grunt", shootCooldown: 60 + Math.random() * 120, oscPhase: 0, baseY: y };
  };

  // --- Boss ----------------------------------------------------------------
  const spawnBoss = () => {
    const bossMul = currentLevelRef.current.bossHpMul;
    bossRef.current = {
      pos: { x: CANVAS_W + 100, y: CANVAS_H / 2 - 60 },
      hp: 1200 * bossMul, maxHp: 1200 * bossMul,
      phase: 1, attackTimer: 120, attackPattern: 0,
      oscPhase: 0, entryProgress: 0,
    };
    messageRef.current = { text: "BOSS : IMPERIAL DREADNAUGHT", life: 180, maxLife: 180 };
    sfx.bossWarning();
    triggerShake(8, 20);
  };

  const bossAttack = (b: Boss) => {
    const cx = b.pos.x + 30, cy = b.pos.y + 60;
    if (b.phase === 1) {
      if (b.attackPattern === 0) {
        for (let dy of [-30, 30]) {
          bulletsRef.current.push({
            pos: { x: cx, y: cy + dy }, vel: { x: -5, y: 0 },
            owner: "enemy", damage: 12, size: 5, color: COLORS.bossEye, kind: "enemy",
          });
        }
        b.attackTimer = 25;
      } else {
        for (let a = -0.4; a <= 0.4; a += 0.2) {
          bulletsRef.current.push({
            pos: { x: cx, y: cy }, vel: { x: Math.cos(Math.PI + a) * 5, y: Math.sin(Math.PI + a) * 5 },
            owner: "enemy", damage: 10, size: 4, color: COLORS.boss, kind: "enemy",
          });
        }
        b.attackTimer = 90;
      }
    } else if (b.phase === 2) {
      if (b.attackPattern === 0) {
        const baseAngle = (b.oscPhase * 6) % (Math.PI * 2);
        for (let i = 0; i < 4; i++) {
          const a = baseAngle + (i * Math.PI) / 2;
          bulletsRef.current.push({
            pos: { x: cx, y: cy }, vel: { x: Math.cos(Math.PI + a) * 4, y: Math.sin(a) * 4 },
            owner: "enemy", damage: 8, size: 4, color: COLORS.bossEye, kind: "enemy",
          });
        }
        b.attackTimer = 12;
      } else {
        for (let i = 0; i < 3; i++) {
          bulletsRef.current.push({
            pos: { x: cx, y: cy + (i - 1) * 20 }, vel: { x: -3, y: (i - 1) * 1.5 },
            owner: "enemy", damage: 14, size: 6, color: "#FF8800", kind: "enemy",
          });
        }
        b.attackTimer = 70;
      }
    } else {
      const angle = Math.random() * 0.6 - 0.3 + Math.PI;
      for (let i = 0; i < 2; i++) {
        bulletsRef.current.push({
          pos: { x: cx, y: cy + (Math.random() - 0.5) * 80 },
          vel: { x: Math.cos(angle) * (5 + Math.random() * 2), y: Math.sin(angle) * 4 },
          owner: "enemy", damage: 12, size: 5, color: COLORS.boss, kind: "enemy",
        });
      }
      b.attackTimer = 10;
    }
    b.attackPattern = (b.attackPattern + 1) % 2;
  };

  // --- Mini-boss -----------------------------------------------------------
  const spawnMiniBoss = () => {
    // Position échelonnée si plusieurs miniboss en parallèle
    const existing = miniBossesRef.current.length;
    const yBase = CANVAS_H / 2 - 40 + (existing > 0 ? (existing - 0.5) * 120 : 0);
    miniBossesRef.current.push({
      pos: { x: CANVAS_W + 80 + existing * 60, y: yBase },
      hp: 400, maxHp: 400,
      attackTimer: 90 + existing * 30, attackPattern: 0,
      oscPhase: existing * 1.5, entryProgress: 0,
      laserAngle: 0, laserActive: false, laserCharge: 0,
    });
    if (existing === 0) {
      messageRef.current = { text: "MINI-BOSS : IMPERIAL FRIGATE", life: 150, maxLife: 150 };
    } else {
      messageRef.current = { text: "ANOTHER FRIGATE!", life: 100, maxLife: 100 };
    }
    sfx.bossWarning();
    triggerShake(6, 15);
  };

  const miniBossAttack = (m: MiniBoss) => {
    const cx = m.pos.x + 20, cy = m.pos.y + 40;
    if (m.attackPattern === 0) {
      for (let dy of [-25, 25]) {
        bulletsRef.current.push({
          pos: { x: cx, y: cy + dy }, vel: { x: -4, y: 0 },
          owner: "enemy", damage: 10, size: 4, color: COLORS.minibossEye, kind: "enemy",
        });
      }
      m.attackTimer = 40;
    } else if (m.attackPattern === 1) {
      for (let i = -1; i <= 1; i++) {
        bulletsRef.current.push({
          pos: { x: cx, y: cy + i * 15 }, vel: { x: -5, y: i * 0.8 },
          owner: "enemy", damage: 12, size: 5, color: COLORS.miniboss, kind: "enemy",
        });
      }
      m.attackTimer = 80;
    } else {
      m.laserActive = true;
      m.laserCharge = 0;
      m.attackTimer = 180;
    }
    m.attackPattern = (m.attackPattern + 1) % 3;
  };

  // --- Power-ups -----------------------------------------------------------
  const spawnPowerUp = (x: number, y: number, type?: PowerUpType) => {
    const types: PowerUpType[] = ["spread", "rapid", "shield", "heal", "bomb", "laser"];
    const chosen = type ?? types[Math.floor(Math.random() * types.length)];
    powerUpsRef.current.push({
      pos: { x, y }, vel: { x: -1.5, y: 0 },
      type: chosen, bob: Math.random() * Math.PI * 2,
    });
  };

  const applyPowerUp = (p: Player, type: PowerUpType) => {
    floatingTextsRef.current.push({
      pos: { x: p.pos.x + SHIP_W / 2, y: p.pos.y - 10 },
      vel: { x: 0, y: -1.5 }, life: 60, maxLife: 60,
      text: type.toUpperCase(), color: POWERUP_COLORS[type].main, size: 12,
    });
    if (type === "heal") { p.hp = Math.min(p.maxHp, p.hp + 40); sfx.powerup(); return; }
    if (type === "bomb") { p.bombs = Math.min(5, p.bombs + 1); sfx.powerup(); return; }
    if (type === "shield") { p.shieldHits = 3; sfx.powerup(); return; }
    const evolKey = type as keyof WeaponLevels;
    const currentLevel = p.weaponLevels[evolKey];
    if (p.effects.has(type as EffectType) && currentLevel < 3) {
      p.weaponLevels[evolKey] = (currentLevel + 1) as 0 | 1 | 2 | 3;
      sfx.upgrade();
      floatingTextsRef.current.push({
        pos: { x: p.pos.x + SHIP_W / 2, y: p.pos.y - 24 },
        vel: { x: 0, y: -2 }, life: 80, maxLife: 80,
        text: `LV ${p.weaponLevels[evolKey]}!`, color: COLORS.chargeMax, size: 16,
      });
    } else sfx.powerup();
    if (type === "laser") { p.effects.delete("spread"); p.effects.delete("rapid"); }
    if (type === "spread") p.effects.delete("laser");
    if (type === "rapid")  p.effects.delete("laser");
    p.effects.set(type as EffectType, EFFECT_DURATION);
  };

  // --- Fusion --------------------------------------------------------------
  // En 2 ou 3 joueurs : si TOUS les joueurs vivants sont proches, ils fusionnent
  const allPlayersClose = (): { close: boolean; count: number; center: Vec } => {
    const alive = playersRef.current.filter((p) => p.alive);
    if (alive.length < 2) return { close: false, count: 0, center: { x: 0, y: 0 } };
    let sumX = 0, sumY = 0;
    alive.forEach((p) => { sumX += p.pos.x + SHIP_W / 2; sumY += p.pos.y + SHIP_H / 2; });
    const cx = sumX / alive.length, cy = sumY / alive.length;
    const allClose = alive.every((p) => {
      const dx = p.pos.x + SHIP_W / 2 - cx;
      const dy = p.pos.y + SHIP_H / 2 - cy;
      return Math.hypot(dx, dy) < FUSION_PROXIMITY;
    });
    return { close: allClose, count: alive.length, center: { x: cx, y: cy } };
  };

  const startFusion = (alivePlayers: Player[], center: Vec) => {
    fusionRef.current = {
      kind: "merging", timer: 0, maxTimer: FUSION_MERGE_FRAMES,
      playerCount: alivePlayers.length,
    };
    sfx.fusion();
    triggerShake(8, 25);
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * Math.PI * 2;
      particlesRef.current.push({
        pos: { x: center.x, y: center.y },
        vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
        life: 40, maxLife: 40, size: 4, color: COLORS.fusion,
      });
    }
  };

  const completeFusion = () => {
    const alive = playersRef.current.filter((p) => p.alive);
    const totalHp = alive.reduce((s, p) => s + p.hp, 0);
    const cx = alive.reduce((s, p) => s + p.pos.x, 0) / alive.length;
    const cy = alive.reduce((s, p) => s + p.pos.y, 0) / alive.length;
    const playerCount = alive.length;
    const maxHp = playerCount === 3 ? 300 : 200;
    fusionRef.current = {
      kind: "fused", pos: { x: cx, y: cy },
      hp: Math.min(totalHp, maxHp), maxHp,
      charging: false, chargeStart: 0,
      cooldown: 0, iFrames: 30, playerCount,
    };
    spawnParticles(cx + FUSED_W / 2, cy + FUSED_H / 2, COLORS.fusionGlow, 40, 5);
  };

  const splitFusion = () => {
    const f = fusionRef.current;
    if (f.kind !== "fused") return;
    const alive = playersRef.current.filter((p) => p.alive);
    const halfHp = Math.max(20, Math.floor(f.hp / Math.max(1, alive.length)));
    const spread = 50;
    alive.forEach((p, i) => {
      const offset = (i - (alive.length - 1) / 2) * spread;
      p.pos = { x: f.pos.x, y: f.pos.y + offset };
      p.hp = Math.min(p.maxHp, halfHp);
      p.alive = halfHp > 0;
      p.iFrames = 60;
    });
    fusionRef.current = { kind: "separate", proximityTimer: 0 };
    sfx.defusion();
    spawnParticles(f.pos.x + FUSED_W / 2, f.pos.y + FUSED_H / 2, COLORS.fusion, 40, 4);
  };

  const fireFusionBullet = (pos: Vec, charged: boolean, playerCount: number) => {
    const baseDamage = (charged ? 100 : 18) * (1 + (playerCount - 2) * 0.3);  // bonus pour 3 joueurs
    const size = charged ? 16 : 7;
    const numShots = playerCount === 3 ? 7 : 5;
    const arc = playerCount === 3 ? 0.4 : 0.3;
    for (let i = 0; i < numShots; i++) {
      const angle = -arc + (i * 2 * arc) / (numShots - 1);
      bulletsRef.current.push({
        pos: { x: pos.x + FUSED_W, y: pos.y + FUSED_H / 2 },
        vel: { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 },
        owner: 1, damage: baseDamage, size,
        color: charged ? COLORS.fusionGlow : COLORS.fusion,
        kind: charged ? "charged" : "normal",
      });
    }
  };

  // --- Script avancement ---------------------------------------------------
  const advanceScript = () => {
    const tSec = levelTimeRef.current / 60;
    const script = currentLevelRef.current.script;
    while (scriptCursorRef.current < script.length && script[scriptCursorRef.current].at <= tSec) {
      const ev = script[scriptCursorRef.current];
      if (ev.kind === "spawn") spawnEnemyOfType(ev.enemy, ev.count, ev.pattern ?? "rand");
      else if (ev.kind === "message") messageRef.current = { text: ev.text, life: 150, maxLife: 150 };
      else if (ev.kind === "boss") spawnBoss();
      else if (ev.kind === "miniboss") spawnMiniBoss();
      else if (ev.kind === "powerup") spawnPowerUp(CANVAS_W + 30, 100 + Math.random() * (CANVAS_H - 200), ev.type);
      scriptCursorRef.current += 1;
    }
  };

  // --- Clavier --------------------------------------------------------------
  // P1: ZQSD/WASD + Espace (tir) + C (bombe)
  // P2: flèches + Enter (tir) + Shift droit (bombe)
  // P3: IJKL + U (tir) + O (bombe)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      ensureAudio();
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Enter"].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current.add(e.key);

      if (gameState === "playing") {
        const p1 = playersRef.current[0];
        const p2 = playersRef.current[1];
        const p3 = playersRef.current[2];
        const f = fusionRef.current;

        if (f.kind === "fused") {
          // Tir : n'importe lequel des "tir" + Shift gauche (sécurité)
          if ((e.key === " " || e.key === "Enter" || e.key === "u" || e.key === "U") && !f.charging) {
            f.charging = true;
            f.chargeStart = frameCountRef.current;
          }
          // Bombe en mode fusion : utilise une bombe disponible
          if (e.key === "c" || e.key === "C" || (e.key === "Shift" && e.location === 2) || e.key === "o" || e.key === "O") {
            const donor = playersRef.current.find((p) => p.bombs > 0);
            if (donor) triggerBomb(donor);
          }
          if (e.key === "f" || e.key === "F") splitFusion();
        } else {
          // P1
          if (e.key === " " && p1?.alive && !p1.charging) {
            p1.charging = true; p1.chargeStart = frameCountRef.current;
          }
          if ((e.key === "c" || e.key === "C") && p1?.alive && p1.bombs > 0) triggerBomb(p1);
          // P2
          if (e.key === "Enter" && p2?.alive && !p2.charging) {
            p2.charging = true; p2.chargeStart = frameCountRef.current;
          }
          if (e.key === "Shift" && e.location === 2 && p2?.alive && p2.bombs > 0) triggerBomb(p2);
          // P3
          if ((e.key === "u" || e.key === "U") && p3?.alive && !p3.charging) {
            p3.charging = true; p3.chargeStart = frameCountRef.current;
          }
          if ((e.key === "o" || e.key === "O") && p3?.alive && p3.bombs > 0) triggerBomb(p3);
        }
      }

      if (e.key === "Enter" && (gameState === "victory" || gameState === "gameover")) {
        setGameState("levelSelect");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
      if (gameState === "playing") {
        const p1 = playersRef.current[0];
        const p2 = playersRef.current[1];
        const p3 = playersRef.current[2];
        const f = fusionRef.current;
        if (f.kind === "fused") {
          if ((e.key === " " || e.key === "Enter" || e.key === "u" || e.key === "U") && f.charging) {
            const chargeFrames = Math.min(frameCountRef.current - f.chargeStart, MAX_CHARGE_FRAMES);
            const isMax = chargeFrames / MAX_CHARGE_FRAMES > 0.95;
            fireFusionBullet(f.pos, isMax, f.playerCount);
            if (isMax) {
              sfx.chargedShoot();
              triggerShake(3, 8);
              spawnParticles(f.pos.x + FUSED_W, f.pos.y + FUSED_H / 2, COLORS.fusionGlow, 16, 4);
            } else sfx.shoot();
            f.charging = false;
          }
        } else {
          if (e.key === " " && p1?.charging) { fireCharged(p1); p1.charging = false; }
          if (e.key === "Enter" && p2?.charging) { fireCharged(p2); p2.charging = false; }
          if ((e.key === "u" || e.key === "U") && p3?.charging) { fireCharged(p3); p3.charging = false; }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState, ensureAudio]);

  const aabb = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  // Mouvement d'un joueur selon son ID
  const movePlayer = (p: Player, keys: Set<string>) => {
    if (p.id === 1) {
      if (keys.has("w") || keys.has("W") || keys.has("z") || keys.has("Z")) p.pos.y -= PLAYER_SPEED;
      if (keys.has("s") || keys.has("S")) p.pos.y += PLAYER_SPEED;
      if (keys.has("a") || keys.has("A") || keys.has("q") || keys.has("Q")) p.pos.x -= PLAYER_SPEED;
      if (keys.has("d") || keys.has("D")) p.pos.x += PLAYER_SPEED;
    } else if (p.id === 2) {
      if (keys.has("ArrowUp")) p.pos.y -= PLAYER_SPEED;
      if (keys.has("ArrowDown")) p.pos.y += PLAYER_SPEED;
      if (keys.has("ArrowLeft")) p.pos.x -= PLAYER_SPEED;
      if (keys.has("ArrowRight")) p.pos.x += PLAYER_SPEED;
    } else {
      // P3 : IJKL
      if (keys.has("i") || keys.has("I")) p.pos.y -= PLAYER_SPEED;
      if (keys.has("k") || keys.has("K")) p.pos.y += PLAYER_SPEED;
      if (keys.has("j") || keys.has("J")) p.pos.x -= PLAYER_SPEED;
      if (keys.has("l") || keys.has("L")) p.pos.x += PLAYER_SPEED;
    }
    p.pos.x = Math.max(0, Math.min(CANVAS_W - SHIP_W, p.pos.x));
    p.pos.y = Math.max(0, Math.min(CANVAS_H - SHIP_H, p.pos.y));
  };

  // ==========================================================================
  // UPDATE
  // ==========================================================================
  const update = () => {
    frameCountRef.current += 1;
    levelTimeRef.current += 1;
    const frame = frameCountRef.current;
    const keys = keysRef.current;
    const enemyDmgMul = currentLevelRef.current.enemyDmgMul;

    advanceScript();

    // Combo timer
    if (comboRef.current.timer > 0) {
      comboRef.current.timer -= 1;
      if (comboRef.current.timer === 0) {
        comboRef.current.count = 0;
        comboRef.current.multiplier = 1;
      }
    }

    // Shake decay
    if (shakeRef.current.duration > 0) {
      shakeRef.current.duration -= 1;
      shakeRef.current.x = (Math.random() - 0.5) * 2 * shakeRef.current.intensity;
      shakeRef.current.y = (Math.random() - 0.5) * 2 * shakeRef.current.intensity;
      shakeRef.current.intensity *= 0.92;
    } else {
      shakeRef.current.x = 0; shakeRef.current.y = 0; shakeRef.current.intensity = 0;
    }

    // Messages
    if (messageRef.current) {
      messageRef.current.life -= 1;
      if (messageRef.current.life <= 0) messageRef.current = null;
    }

    // Étoiles
    starsRef.current.forEach((s) => {
      s.x -= s.speed;
      if (s.x < 0) { s.x = CANVAS_W; s.y = Math.random() * CANVAS_H; }
    });

    // === Mode Fusion (état) ===
    const fusion = fusionRef.current;
    if (fusion.kind === "fused") {
      if (fusion.iFrames > 0) fusion.iFrames -= 1;
      if (fusion.cooldown > 0) fusion.cooldown -= 1;
      // Tous les inputs de mouvement contrôlent le super-vaisseau
      let dx = 0, dy = 0;
      if (keys.has("w") || keys.has("W") || keys.has("z") || keys.has("Z") || keys.has("ArrowUp") || keys.has("i") || keys.has("I")) dy -= 1;
      if (keys.has("s") || keys.has("S") || keys.has("ArrowDown") || keys.has("k") || keys.has("K")) dy += 1;
      if (keys.has("a") || keys.has("A") || keys.has("q") || keys.has("Q") || keys.has("ArrowLeft") || keys.has("j") || keys.has("J")) dx -= 1;
      if (keys.has("d") || keys.has("D") || keys.has("ArrowRight") || keys.has("l") || keys.has("L")) dx += 1;
      const speed = PLAYER_SPEED * 1.1;
      fusion.pos.x += dx * speed;
      fusion.pos.y += dy * speed;
      fusion.pos.x = Math.max(0, Math.min(CANVAS_W - FUSED_W, fusion.pos.x));
      fusion.pos.y = Math.max(0, Math.min(CANVAS_H - FUSED_H, fusion.pos.y));

      if (fusion.charging && fusion.cooldown === 0) {
        const chargeFrames = frame - fusion.chargeStart;
        if (chargeFrames === 1 || (chargeFrames % 6 === 0 && chargeFrames < 80)) {
          const arc = fusion.playerCount === 3 ? 0.25 : 0.2;
          const numShots = fusion.playerCount === 3 ? 7 : 5;
          for (let i = 0; i < numShots; i++) {
            const angle = -arc + (i * 2 * arc) / (numShots - 1);
            bulletsRef.current.push({
              pos: { x: fusion.pos.x + FUSED_W, y: fusion.pos.y + FUSED_H / 2 },
              vel: { x: Math.cos(angle) * 11, y: Math.sin(angle) * 11 },
              owner: 1, damage: 12 + fusion.playerCount * 2, size: 4,
              color: COLORS.fusion, kind: "normal",
            });
          }
          fusion.cooldown = 6;
          if (chargeFrames > 1) sfx.shoot();
        }
      }
    } else if (fusion.kind === "merging") {
      fusion.timer += 1;
      if (fusion.timer >= fusion.maxTimer) completeFusion();
    } else {
      // Mode séparé : check proximité
      const { close, count, center } = allPlayersClose();
      if (close && count >= 2) {
        fusion.proximityTimer += 1;
        if (fusion.proximityTimer % 4 === 0) {
          particlesRef.current.push({
            pos: { x: center.x, y: center.y }, vel: { x: 0, y: -2 },
            life: 20, maxLife: 20, size: 2, color: COLORS.fusion,
          });
        }
        if (fusion.proximityTimer >= FUSION_HOLD_FRAMES) {
          const alive = playersRef.current.filter((p) => p.alive);
          startFusion(alive, center);
        }
      } else {
        fusion.proximityTimer = 0;
      }
    }

    // Joueurs (mouvement + tir auto si non fusionnés)
    playersRef.current.forEach((p) => {
      if (!p.alive) return;
      if (p.iFrames > 0) p.iFrames -= 1;

      p.effects.forEach((remaining, eff) => {
        if (remaining <= 1) p.effects.delete(eff);
        else p.effects.set(eff, remaining - 1);
      });

      if (fusionRef.current.kind !== "separate") return;

      movePlayer(p, keys);

      if (p.cooldown > 0) p.cooldown -= 1;

      if (p.charging && p.cooldown === 0) {
        const chargeFrames = frame - p.chargeStart;
        const spreadLv = p.weaponLevels.spread;
        const rapidLv = p.weaponLevels.rapid;
        const numShots = p.effects.has("spread") ? (spreadLv >= 2 ? 7 : spreadLv >= 1 ? 5 : 3) : 1;
        const spreadArc = 0.15 + spreadLv * 0.05;
        const muzzleX = p.pos.x + SHIP_W;
        const muzzleY = p.pos.y + SHIP_H / 2;

        if (p.effects.has("laser")) {
          fireLaser(p);
          p.cooldown = 2;
        } else if (p.effects.has("rapid") && chargeFrames < 80) {
          const cd = Math.max(2, PLAYER_RAPID_FIRE_CD - rapidLv);
          if (p.effects.has("spread")) {
            for (let i = 0; i < numShots; i++) {
              const a = numShots === 1 ? 0 : -spreadArc + (i * 2 * spreadArc) / (numShots - 1);
              bulletsRef.current.push({
                pos: { x: muzzleX, y: muzzleY },
                vel: { x: Math.cos(a) * 10, y: Math.sin(a) * 10 },
                owner: p.id, damage: 8 + spreadLv * 2, size: 4, color: p.color, kind: "normal",
              });
            }
          } else {
            bulletsRef.current.push({
              pos: { x: muzzleX, y: muzzleY }, vel: { x: 11, y: 0 },
              owner: p.id, damage: 10 + rapidLv * 3, size: 4, color: p.color, kind: "normal",
            });
          }
          p.cooldown = cd;
          sfx.shoot();
        } else if (chargeFrames === 1) {
          if (p.effects.has("spread")) {
            for (let i = 0; i < numShots; i++) {
              const a = numShots === 1 ? 0 : -spreadArc + (i * 2 * spreadArc) / (numShots - 1);
              bulletsRef.current.push({
                pos: { x: muzzleX, y: muzzleY },
                vel: { x: Math.cos(a) * 10, y: Math.sin(a) * 10 },
                owner: p.id, damage: 8 + spreadLv * 2, size: 4, color: p.color, kind: "normal",
              });
            }
          } else {
            bulletsRef.current.push({
              pos: { x: muzzleX, y: muzzleY }, vel: { x: 9, y: 0 },
              owner: p.id, damage: 8, size: 4, color: p.color, kind: "normal",
            });
          }
          p.cooldown = PLAYER_AUTO_FIRE_CD;
          sfx.shoot();
        }
      }
    });

    // Ennemis
    enemiesRef.current.forEach((e) => {
      if (e.type === "kamikaze") {
        if (!e.dived && e.pos.x < CANVAS_W * 0.7) {
          const alive = playersRef.current.filter((p) => p.alive);
          if (alive.length > 0 || fusionRef.current.kind === "fused") {
            let tx: number, ty: number;
            if (fusionRef.current.kind === "fused") {
              tx = fusionRef.current.pos.x + FUSED_W / 2;
              ty = fusionRef.current.pos.y + FUSED_H / 2;
            } else {
              const target = alive.reduce((a, b) =>
                Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y) <
                Math.hypot(b.pos.x - e.pos.x, b.pos.y - e.pos.y) ? a : b);
              tx = target.pos.x + SHIP_W / 2;
              ty = target.pos.y + SHIP_H / 2;
            }
            const dx = tx - e.pos.x;
            const dy = ty - e.pos.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            e.vel.x = (dx / d) * 5;
            e.vel.y = (dy / d) * 5;
            e.dived = true;
          }
        }
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;
      } else if (e.type === "sniper") {
        if (e.pos.x > CANVAS_W - 120) {
          e.pos.x += e.vel.x;
        } else {
          e.vel.x = 0;
          e.oscPhase += 0.02;
          e.pos.y = e.baseY + Math.sin(e.oscPhase) * 30;
          e.lockTimer = (e.lockTimer ?? 0) + 1;
          if (e.lockTimer < 60) {
            let tx = 0, ty = 0, hasTarget = false;
            if (fusionRef.current.kind === "fused") {
              tx = fusionRef.current.pos.x + FUSED_W / 2;
              ty = fusionRef.current.pos.y + FUSED_H / 2;
              hasTarget = true;
            } else {
              const alive = playersRef.current.filter((p) => p.alive);
              if (alive.length > 0) {
                const t = alive[Math.floor((frame / 60) % alive.length)];
                tx = t.pos.x + SHIP_W / 2;
                ty = t.pos.y + SHIP_H / 2;
                hasTarget = true;
              }
            }
            if (hasTarget) e.lockTarget = { x: tx, y: ty };
          } else if (e.lockTimer === 60 && e.lockTarget) {
            const dx = e.lockTarget.x - e.pos.x;
            const dy = e.lockTarget.y - e.pos.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            bulletsRef.current.push({
              pos: { x: e.pos.x, y: e.pos.y + ENEMY_H / 2 },
              vel: { x: (dx / d) * 9, y: (dy / d) * 9 },
              owner: "enemy", damage: 18, size: 4,
              color: COLORS.sniperEye, kind: "enemy",
            });
            sfx.shoot();
            e.lockTimer = 0;
            e.lockTarget = undefined;
          }
        }
      } else if (e.type === "tank") {
        e.pos.x += e.vel.x;
        e.shootCooldown -= 1;
        if (e.shootCooldown <= 0) {
          for (let i = 0; i < 3; i++) {
            const offsetX = i * 18;
            bulletsRef.current.push({
              pos: { x: e.pos.x + offsetX, y: e.pos.y + ENEMY_H / 2 },
              vel: { x: -5, y: 0 },
              owner: "enemy", damage: 10, size: 4,
              color: COLORS.tankAccent, kind: "enemy",
            });
          }
          e.shootCooldown = 140;
        }
      } else {
        e.pos.x += e.vel.x;
        e.shootCooldown -= 1;
        if (e.shootCooldown <= 0) {
          let tx = 0, ty = 0, hasTarget = false;
          if (fusionRef.current.kind === "fused") {
            tx = fusionRef.current.pos.x + FUSED_W / 2;
            ty = fusionRef.current.pos.y + FUSED_H / 2;
            hasTarget = true;
          } else {
            const alive = playersRef.current.filter((p) => p.alive);
            if (alive.length > 0) {
              const target = alive[Math.floor(Math.random() * alive.length)];
              tx = target.pos.x + SHIP_W / 2;
              ty = target.pos.y + SHIP_H / 2;
              hasTarget = true;
            }
          }
          if (hasTarget) {
            const dx = tx - e.pos.x;
            const dy = ty - e.pos.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            bulletsRef.current.push({
              pos: { x: e.pos.x, y: e.pos.y + ENEMY_H / 2 },
              vel: { x: (dx / d) * 4, y: (dy / d) * 4 },
              owner: "enemy", damage: 10, size: 3,
              color: "#FFAA33", kind: "enemy",
            });
          }
          e.shootCooldown = 90 + Math.random() * 90;
        }
      }
    });

    // Mini-bosses
    miniBossesRef.current.forEach((m) => {
      if (m.entryProgress < 1) {
        m.entryProgress += 0.015;
        m.pos.x = CANVAS_W + 80 - m.entryProgress * 200;
      } else {
        m.oscPhase += 0.025;
        m.pos.y = CANVAS_H / 2 - 40 + Math.sin(m.oscPhase) * 80;
        m.pos.x = CANVAS_W - 160 + Math.cos(m.oscPhase * 0.6) * 25;
        if (m.laserActive) {
          m.laserCharge += 1;
          if (m.laserCharge >= 60 && m.laserCharge < 150) {
            const sweepProgress = (m.laserCharge - 60) / 90;
            m.laserAngle = Math.PI + (sweepProgress - 0.5) * 1.2;
            if (m.laserCharge % 3 === 0) {
              bulletsRef.current.push({
                pos: { x: m.pos.x + 20, y: m.pos.y + 40 },
                vel: { x: Math.cos(m.laserAngle) * 8, y: Math.sin(m.laserAngle) * 8 },
                owner: "enemy", damage: 8, size: 5,
                color: COLORS.minibossEye, kind: "enemy",
              });
            }
          } else if (m.laserCharge >= 150) {
            m.laserActive = false;
            m.laserCharge = 0;
          }
        } else {
          m.attackTimer -= 1;
          if (m.attackTimer <= 0) miniBossAttack(m);
        }
      }
    });

    // Boss
    if (bossRef.current) {
      const b = bossRef.current;
      if (b.entryProgress < 1) {
        b.entryProgress += 0.01;
        b.pos.x = CANVAS_W + 100 - b.entryProgress * 220;
      } else {
        const ratio = b.hp / b.maxHp;
        const newPhase: 1 | 2 | 3 = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
        if (newPhase !== b.phase) {
          b.phase = newPhase;
          messageRef.current = {
            text: newPhase === 2 ? "BOSS : PHASE 2" : "BOSS : RAGE MODE",
            life: 120, maxLife: 120,
          };
          triggerShake(10, 30);
          spawnParticles(b.pos.x + 60, b.pos.y + 60, COLORS.bossShield, 40, 5);
        }
        b.oscPhase += 0.02 + b.phase * 0.01;
        b.pos.y = CANVAS_H / 2 - 60 + Math.sin(b.oscPhase) * 100;
        b.pos.x = CANVAS_W - 220 + Math.cos(b.oscPhase * 0.7) * 30;
        b.attackTimer -= 1;
        if (b.attackTimer <= 0) {
          bossAttack(b);
          sfx.shoot();
        }
      }
    }

    // Power-ups
    powerUpsRef.current.forEach((pu) => {
      pu.pos.x += pu.vel.x;
      pu.bob += 0.1;
      pu.pos.y += Math.sin(pu.bob) * 0.5;
    });
    powerUpsRef.current = powerUpsRef.current.filter((pu) => pu.pos.x > -50);

    // Collision power-up <-> joueurs/fusion
    powerUpsRef.current.forEach((pu) => {
      const fus = fusionRef.current;
      if (fus.kind === "fused") {
        if (aabb(pu.pos.x, pu.pos.y, 24, 24, fus.pos.x, fus.pos.y, FUSED_W, FUSED_H)) {
          // En fusion, applique le power-up à tous les joueurs vivants
          const aliveP = playersRef.current.filter((p) => p.alive);
          aliveP.forEach((p) => applyPowerUp(p, pu.type));
          if (pu.type === "heal") fus.hp = Math.min(fus.maxHp, fus.hp + 40 * aliveP.length);
          pu.pos.x = -9999;
          return;
        }
      } else {
        playersRef.current.forEach((p) => {
          if (!p.alive) return;
          if (aabb(pu.pos.x, pu.pos.y, 24, 24, p.pos.x, p.pos.y, SHIP_W, SHIP_H)) {
            applyPowerUp(p, pu.type);
            pu.pos.x = -9999;
          }
        });
      }
    });
    powerUpsRef.current = powerUpsRef.current.filter((pu) => pu.pos.x > -100);

    // Bullets
    bulletsRef.current.forEach((b) => {
      b.pos.x += b.vel.x;
      b.pos.y += b.vel.y;
    });
    bulletsRef.current = bulletsRef.current.filter(
      (b) => b.pos.x > -50 && b.pos.x < CANVAS_W + 50 && b.pos.y > -50 && b.pos.y < CANVAS_H + 50
    );

    // Collisions tirs joueur -> ennemis
    bulletsRef.current.forEach((b) => {
      if (b.owner === "enemy") return;
      enemiesRef.current.forEach((e) => {
        if (aabb(b.pos.x - b.size, b.pos.y - b.size, b.size * 2, b.size * 2,
                e.pos.x, e.pos.y, ENEMY_W, ENEMY_H)) {
          e.hp -= b.damage;
          spawnParticles(b.pos.x, b.pos.y, b.color, 5, 2);
          sfx.hit();
          if (b.kind !== "laser") b.pos.x = -9999;
        }
      });
      if (bossRef.current) {
        const bs = bossRef.current;
        if (bs.entryProgress >= 1 &&
            aabb(b.pos.x - b.size, b.pos.y - b.size, b.size * 2, b.size * 2,
                 bs.pos.x, bs.pos.y, 120, 120)) {
          bs.hp -= b.damage;
          spawnParticles(b.pos.x, b.pos.y, b.color, 4, 2);
          if (b.kind !== "laser") b.pos.x = -9999;
        }
      }
      miniBossesRef.current.forEach((m) => {
        if (m.entryProgress >= 1 &&
            aabb(b.pos.x - b.size, b.pos.y - b.size, b.size * 2, b.size * 2,
                 m.pos.x, m.pos.y, 60, 80)) {
          m.hp -= b.damage;
          spawnParticles(b.pos.x, b.pos.y, b.color, 4, 2);
          sfx.hit();
          if (b.kind !== "laser") b.pos.x = -9999;
        }
      });
    });

    // Collisions tirs ennemis -> joueurs / fusion
    bulletsRef.current.forEach((b) => {
      if (b.owner !== "enemy") return;
      const fus = fusionRef.current;
      if (fus.kind === "fused" && fus.iFrames <= 0) {
        if (aabb(b.pos.x - b.size, b.pos.y - b.size, b.size * 2, b.size * 2,
                fus.pos.x, fus.pos.y, FUSED_W, FUSED_H)) {
          fus.hp -= b.damage * enemyDmgMul;
          fus.iFrames = 20;
          spawnParticles(fus.pos.x + FUSED_W / 2, fus.pos.y + FUSED_H / 2, COLORS.fusion, 12, 3);
          sfx.hit();
          triggerShake(4, 12);
          breakCombo();
          b.pos.x = -9999;
          if (fus.hp <= 20) splitFusion();
        }
        return;
      }
      playersRef.current.forEach((p) => {
        if (!p.alive || p.iFrames > 0) return;
        if (aabb(b.pos.x - b.size, b.pos.y - b.size, b.size * 2, b.size * 2,
                p.pos.x, p.pos.y, SHIP_W, SHIP_H)) {
          if (p.shieldHits > 0) {
            p.shieldHits -= 1;
            spawnParticles(p.pos.x + SHIP_W / 2, p.pos.y + SHIP_H / 2, "#5DCAA5", 14, 3);
            sfx.hit();
          } else {
            p.hp -= b.damage * enemyDmgMul;
            p.iFrames = 30;
            spawnParticles(p.pos.x + SHIP_W / 2, p.pos.y + SHIP_H / 2, p.color, 10, 3);
            sfx.hit();
            triggerShake(4, 12);
            breakCombo();
          }
          b.pos.x = -9999;
        }
      });
    });

    // Collisions ennemis -> joueurs / fusion
    enemiesRef.current.forEach((e) => {
      const fus = fusionRef.current;
      if (fus.kind === "fused" && fus.iFrames <= 0) {
        if (aabb(e.pos.x, e.pos.y, ENEMY_W, ENEMY_H, fus.pos.x, fus.pos.y, FUSED_W, FUSED_H)) {
          const dmg = (e.type === "kamikaze" ? 35 : e.type === "tank" ? 30 : 25) * enemyDmgMul;
          fus.hp -= dmg;
          fus.iFrames = 45;
          spawnParticles(fus.pos.x + FUSED_W / 2, fus.pos.y + FUSED_H / 2, COLORS.fusion, 16, 4);
          sfx.explosion();
          triggerShake(6, 16);
          breakCombo();
          e.hp = 0;
          spawnParticles(e.pos.x + ENEMY_W / 2, e.pos.y + ENEMY_H / 2, "#FFAA33", 16, 3);
          if (fus.hp <= 20) splitFusion();
          return;
        }
      }
      playersRef.current.forEach((p) => {
        if (!p.alive || p.iFrames > 0) return;
        if (aabb(e.pos.x, e.pos.y, ENEMY_W, ENEMY_H, p.pos.x, p.pos.y, SHIP_W, SHIP_H)) {
          const dmg = (e.type === "kamikaze" ? 35 : e.type === "tank" ? 30 : 25) * enemyDmgMul;
          if (p.shieldHits > 0) {
            p.shieldHits -= 1;
            sfx.hit();
          } else {
            p.hp -= dmg;
            p.iFrames = 45;
            spawnParticles(p.pos.x + SHIP_W / 2, p.pos.y + SHIP_H / 2, p.color, 16, 4);
            sfx.explosion();
            triggerShake(6, 16);
            breakCombo();
          }
          e.hp = 0;
          spawnParticles(e.pos.x + ENEMY_W / 2, e.pos.y + ENEMY_H / 2, "#FFAA33", 16, 3);
        }
      });
    });

    // Cleanup ennemis morts
    const stillAlive: Enemy[] = [];
    enemiesRef.current.forEach((e) => {
      if (e.hp <= 0) {
        spawnParticles(e.pos.x + ENEMY_W / 2, e.pos.y + ENEMY_H / 2, "#FFD27A", 20, 3);
        sfx.explosion();
        triggerShake(2, 6);
        const points = e.type === "tank" ? 200 : e.type === "sniper" ? 150 : e.type === "kamikaze" ? 80 : 50;
        addKillToCombo(e.pos.x + ENEMY_W / 2, e.pos.y + ENEMY_H / 2, points);
        if (Math.random() < POWERUP_DROP_CHANCE) spawnPowerUp(e.pos.x, e.pos.y);
      } else if (e.pos.x < -80) {
        breakCombo();
      } else stillAlive.push(e);
    });
    enemiesRef.current = stillAlive;

    bulletsRef.current = bulletsRef.current.filter((b) => b.pos.x > -100);

    // Morts joueurs
    playersRef.current.forEach((p) => {
      if (p.alive && p.hp <= 0) {
        p.alive = false;
        noDeathRef.current = false; // perdu : plus de médaille argent/or possible
        spawnParticles(p.pos.x + SHIP_W / 2, p.pos.y + SHIP_H / 2, p.color, 60, 6);
        sfx.bigExplosion();
        triggerShake(15, 40);
      }
    });

    // Mini-bosses vaincus
    const survivingMb: MiniBoss[] = [];
    miniBossesRef.current.forEach((m) => {
      if (m.hp <= 0) {
        const mx = m.pos.x + 30, my = m.pos.y + 40;
        spawnParticles(mx, my, COLORS.miniboss, 60, 6);
        spawnParticles(mx, my, COLORS.minibossEye, 30, 5);
        sfx.bigExplosion();
        triggerShake(12, 35);
        scoreRef.current += 2000 * comboRef.current.multiplier;
        spawnPowerUp(mx, my);
        spawnPowerUp(mx - 30, my + 20);
        messageRef.current = { text: "FRIGATE DESTROYED!", life: 100, maxLife: 100 };
      } else survivingMb.push(m);
    });
    miniBossesRef.current = survivingMb;

    // Boss vaincu
    if (bossRef.current && bossRef.current.hp <= 0) {
      const bx = bossRef.current.pos.x + 60;
      const by = bossRef.current.pos.y + 60;
      spawnParticles(bx, by, COLORS.boss, 100, 8);
      spawnParticles(bx, by, COLORS.bossEye, 60, 6);
      sfx.bigExplosion();
      triggerShake(20, 60);
      scoreRef.current += 5000 * comboRef.current.multiplier;
      bossRef.current = null;
      sfx.victory();

      // Calcul de la médaille
      const noDeath = noDeathRef.current;
      const finalCombo = comboRef.current.multiplier;
      let earned: Medal = "bronze";
      if (noDeath && finalCombo >= 4) earned = "gold";
      else if (noDeath) earned = "silver";
      const levelId = currentLevelRef.current.id;
      const updatedStore = upgradeMedal(levelId, earned);
      setMedals(updatedStore);
      setLastEarnedMedal(earned);

      setTimeout(() => setGameState("victory"), 1500);
    }

    // Particules
    particlesRef.current.forEach((pa) => {
      pa.pos.x += pa.vel.x; pa.pos.y += pa.vel.y;
      pa.vel.x *= 0.96; pa.vel.y *= 0.96; pa.life -= 1;
    });
    particlesRef.current = particlesRef.current.filter((pa) => pa.life > 0);

    floatingTextsRef.current.forEach((ft) => {
      ft.pos.x += ft.vel.x; ft.pos.y += ft.vel.y; ft.life -= 1;
    });
    floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life > 0);

    // Game over
    const fusionDead = fusionRef.current.kind === "fused" && fusionRef.current.hp <= 0;
    const playersDead = playersRef.current.every((p) => !p.alive);
    if (fusionDead) {
      const fus = fusionRef.current as Extract<FusionState, { kind: "fused" }>;
      spawnParticles(fus.pos.x + FUSED_W / 2, fus.pos.y + FUSED_H / 2, COLORS.fusion, 60, 6);
      sfx.bigExplosion();
      triggerShake(20, 50);
      playersRef.current.forEach((p) => { p.alive = false; });
      noDeathRef.current = false;
      fusionRef.current = { kind: "separate", proximityTimer: 0 };
      setGameState("gameover");
    } else if (playersDead && fusionRef.current.kind === "separate") {
      setGameState("gameover");
    }

    // HUD sync
    if (frame % 6 === 0) {
      const playersHud: PlayerHud[] = playersRef.current.map((p) => ({
        hp: Math.max(0, p.hp), maxHp: p.maxHp, bombs: p.bombs,
        charge: p.charging ? Math.min(1, (frame - p.chargeStart) / MAX_CHARGE_FRAMES) : 0,
        effects: Array.from(p.effects.keys()),
        shield: p.shieldHits,
        levels: { ...p.weaponLevels },
        alive: p.alive,
        color: p.color,
      }));
      const fus = fusionRef.current;
      let fusionHud: { kind: "separate" | "merging" | "fused"; progress: number; hp: number; maxHp: number } = {
        kind: "separate", progress: 0, hp: 0, maxHp: 200,
      };
      if (fus.kind === "separate") fusionHud.progress = fus.proximityTimer / FUSION_HOLD_FRAMES;
      else if (fus.kind === "merging") { fusionHud.kind = "merging"; fusionHud.progress = fus.timer / fus.maxTimer; }
      else { fusionHud.kind = "fused"; fusionHud.hp = Math.max(0, fus.hp); fusionHud.maxHp = fus.maxHp; }

      setHudData({
        score: scoreRef.current,
        combo: comboRef.current.multiplier,
        comboCount: comboRef.current.count,
        players: playersHud,
        boss: bossRef.current ? { hp: bossRef.current.hp, maxHp: bossRef.current.maxHp, phase: bossRef.current.phase } : null,
        miniBoss: miniBossesRef.current.length > 0
          ? { hp: miniBossesRef.current[0].hp, maxHp: miniBossesRef.current[0].maxHp, count: miniBossesRef.current.length }
          : null,
        fusion: fusionHud,
      });
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  const render = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.translate(shakeRef.current.x, shakeRef.current.y);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-20, -20, CANVAS_W + 40, CANVAS_H + 40);

    starsRef.current.forEach((s) => {
      ctx.fillStyle = `rgba(255,255,255,${s.brightness})`;
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
    });

    particlesRef.current.forEach((pa) => {
      const alpha = pa.life / pa.maxLife;
      ctx.fillStyle = pa.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const sz = Math.max(1, Math.floor(pa.size));
      ctx.fillRect(Math.floor(pa.pos.x - sz / 2), Math.floor(pa.pos.y - sz / 2), sz, sz);
    });
    ctx.globalAlpha = 1;

    // Power-ups
    powerUpsRef.current.forEach((pu) => {
      const c = POWERUP_COLORS[pu.type];
      const x = Math.floor(pu.pos.x), y = Math.floor(pu.pos.y);
      ctx.fillStyle = c.dark; ctx.fillRect(x - 2, y - 2, 32, 32);
      ctx.fillStyle = c.main; ctx.fillRect(x, y, 28, 28);
      ctx.fillStyle = c.dark; ctx.fillRect(x + 2, y + 2, 24, 24);
      ctx.fillStyle = c.main; ctx.fillRect(x + 4, y + 4, 20, 20);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.label, x + 14, y + 15);
    });

    enemiesRef.current.forEach((e) => {
      if (e.type === "grunt") drawGrunt(ctx, e);
      else if (e.type === "tank") drawTank(ctx, e);
      else if (e.type === "sniper") drawSniper(ctx, e);
      else if (e.type === "kamikaze") drawKamikaze(ctx, e);
    });

    miniBossesRef.current.forEach((m) => drawMiniBoss(ctx, m));
    if (bossRef.current) drawBoss(ctx, bossRef.current);

    // Joueurs ou super-vaisseau
    const fusionDraw = fusionRef.current;
    if (fusionDraw.kind === "fused") {
      drawFusedShip(ctx, fusionDraw);
    } else if (fusionDraw.kind === "merging") {
      const t = fusionDraw.timer / fusionDraw.maxTimer;
      const alive = playersRef.current.filter((p) => p.alive);
      const mx = alive.reduce((s, p) => s + p.pos.x, 0) / alive.length;
      const my = alive.reduce((s, p) => s + p.pos.y, 0) / alive.length;
      alive.forEach((p) => {
        const fake = { ...p, pos: { x: p.pos.x + (mx - p.pos.x) * t, y: p.pos.y + (my - p.pos.y) * t } } as Player;
        ctx.globalAlpha = 1 - t * 0.5;
        if (p.shipType === "xwing") drawXWing(ctx, fake);
        else if (p.shipType === "awing") drawAWing(ctx, fake);
        else drawYWing(ctx, fake);
        ctx.globalAlpha = 1;
      });
      ctx.strokeStyle = COLORS.fusion;
      ctx.globalAlpha = t;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx + SHIP_W / 2, my + SHIP_H / 2, 20 + t * 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      playersRef.current.forEach((p) => {
        if (!p.alive) return;
        if (p.iFrames > 0 && Math.floor(p.iFrames / 4) % 2 === 0) return;
        if (p.shipType === "xwing") drawXWing(ctx, p);
        else if (p.shipType === "awing") drawAWing(ctx, p);
        else drawYWing(ctx, p);

        if (p.shieldHits > 0) {
          ctx.strokeStyle = "#5DCAA5";
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.6 + Math.sin(frameCountRef.current * 0.2) * 0.2;
          ctx.strokeRect(p.pos.x - 4, p.pos.y - 4, SHIP_W + 8, SHIP_H + 8);
          ctx.globalAlpha = 1;
        }
        if (p.charging && !p.effects.has("laser")) {
          const t = Math.min(1, (frameCountRef.current - p.chargeStart) / MAX_CHARGE_FRAMES);
          const isMax = t > 0.95;
          const barW = SHIP_W - 8, barH = 4;
          const bx = p.pos.x + 4, by = p.pos.y + SHIP_H + 4;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(bx, by, barW, barH);
          ctx.fillStyle = isMax ? COLORS.chargeMax : COLORS.charge;
          ctx.fillRect(bx, by, barW * t, barH);
        }
      });

      // Indicateur de proximité fusion
      if (fusionDraw.kind === "separate" && fusionDraw.proximityTimer > 10) {
        const alive = playersRef.current.filter((p) => p.alive);
        if (alive.length >= 2) {
          const mx = alive.reduce((s, p) => s + p.pos.x + SHIP_W / 2, 0) / alive.length;
          const my = alive.reduce((s, p) => s + p.pos.y + SHIP_H / 2, 0) / alive.length;
          const progress = fusionDraw.proximityTimer / FUSION_HOLD_FRAMES;
          ctx.strokeStyle = COLORS.fusion;
          ctx.globalAlpha = 0.4 + progress * 0.6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mx, my, 30 + progress * 20, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Bullets
    bulletsRef.current.forEach((b) => {
      ctx.fillStyle = b.color;
      const sz = b.size;
      if (b.kind === "charged") {
        ctx.globalAlpha = 0.3;
        ctx.fillRect(Math.floor(b.pos.x - sz - 2), Math.floor(b.pos.y - sz / 2 - 2), sz * 2 + 4, sz + 4);
        ctx.globalAlpha = 1;
      }
      if (b.kind === "laser") {
        ctx.fillRect(Math.floor(b.pos.x - sz * 2), Math.floor(b.pos.y - 2), sz * 4, 4);
      } else {
        ctx.fillRect(Math.floor(b.pos.x - sz), Math.floor(b.pos.y - sz / 2), sz * 2, Math.max(2, sz));
      }
    });

    // Lasers de lock-on des snipers
    enemiesRef.current.forEach((e) => {
      if (e.type === "sniper" && e.lockTimer !== undefined && e.lockTimer > 0 && e.lockTarget) {
        const intensity = e.lockTimer / 60;
        ctx.strokeStyle = COLORS.sniperEye;
        ctx.globalAlpha = 0.2 + intensity * 0.6;
        ctx.lineWidth = 1 + intensity * 2;
        ctx.beginPath();
        ctx.moveTo(e.pos.x, e.pos.y + ENEMY_H / 2);
        ctx.lineTo(e.lockTarget.x, e.lockTarget.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    // Barre boss
    if (bossRef.current && bossRef.current.entryProgress >= 1) {
      const b = bossRef.current;
      const barW = 280, barH = 8;
      const bx = b.pos.x - 60, by = b.pos.y - 24;
      ctx.fillStyle = "#222"; ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = b.phase === 3 ? COLORS.boss : b.phase === 2 ? "#D85A30" : COLORS.bossDark;
      ctx.fillRect(bx, by, barW * (b.hp / b.maxHp), barH);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);
    }

    // Barre miniboss
    miniBossesRef.current.forEach((m) => {
      if (m.entryProgress < 1) return;
      const barW = 140, barH = 6;
      const bx = m.pos.x - 30, by = m.pos.y - 16;
      ctx.fillStyle = "#222"; ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = COLORS.miniboss;
      ctx.fillRect(bx, by, barW * (m.hp / m.maxHp), barH);
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);
      if (m.laserActive && m.laserCharge < 60) {
        const chargePct = m.laserCharge / 60;
        ctx.fillStyle = COLORS.minibossEye;
        ctx.globalAlpha = 0.5 + Math.sin(frameCountRef.current * 0.4) * 0.4;
        ctx.fillRect(bx, by + barH + 2, barW * chargePct, 3);
        ctx.globalAlpha = 1;
      }
    });

    // Floating texts
    floatingTextsRef.current.forEach((ft) => {
      const alpha = Math.min(1, ft.life / ft.maxLife * 1.5);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
      ctx.globalAlpha = 1;
    });

    if (messageRef.current) {
      const m = messageRef.current;
      const t = m.life / m.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, CANVAS_H / 2 - 30, CANVAS_W, 60);
      ctx.fillStyle = COLORS.charge;
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(m.text, CANVAS_W / 2, CANVAS_H / 2);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  // --- Sprites scalés ~1.5x ------------------------------------------------
  // SHIP_W = 64, SHIP_H = 48 (avant 44x32, donc x ≈ 1.5)

  const drawXWing = (ctx: CanvasRenderingContext2D, p: Player) => {
    const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y);
    // Corps central
    ctx.fillStyle = COLORS.p1Dark; ctx.fillRect(x + 14, y + 18, 40, 12);
    ctx.fillStyle = COLORS.p1;     ctx.fillRect(x + 18, y + 20, 32, 8);
    ctx.fillStyle = COLORS.p1Glow; ctx.fillRect(x + 30, y + 19, 8, 10);
    // Nez
    ctx.fillStyle = COLORS.p1; ctx.fillRect(x + 50, y + 20, 8, 8);
    ctx.fillRect(x + 56, y + 22, 6, 4);
    // Ailes en X
    ctx.fillStyle = COLORS.p1Dark; ctx.fillRect(x + 8, y + 2, 32, 6); ctx.fillRect(x + 8, y + 40, 32, 6);
    ctx.fillStyle = COLORS.p1;     ctx.fillRect(x + 10, y + 4, 28, 2); ctx.fillRect(x + 10, y + 42, 28, 2);
    // Canons aux extrémités
    ctx.fillStyle = "#DDD";
    ctx.fillRect(x + 2, y + 2, 8, 3); ctx.fillRect(x + 2, y + 43, 8, 3);
    ctx.fillRect(x + 2, y + 6, 8, 2); ctx.fillRect(x + 2, y + 40, 8, 2);
    // Propulseurs arrière
    ctx.fillStyle = "#FF8800"; ctx.fillRect(x + 6, y + 20, 6, 8);
    ctx.fillStyle = "#FFCC00"; ctx.fillRect(x + 8, y + 22, 4, 4);
    ctx.fillStyle = "#FFE5A0"; ctx.fillRect(x + 9, y + 23, 2, 2);
  };

  const drawAWing = (ctx: CanvasRenderingContext2D, p: Player) => {
    const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y);
    // Corps allongé
    ctx.fillStyle = COLORS.p2Dark;
    ctx.fillRect(x + 6, y + 18, 48, 12);
    ctx.fillRect(x + 12, y + 12, 36, 6);
    ctx.fillRect(x + 12, y + 30, 36, 6);
    ctx.fillStyle = COLORS.p2;
    ctx.fillRect(x + 8, y + 20, 44, 8);
    ctx.fillRect(x + 14, y + 14, 32, 4);
    ctx.fillRect(x + 14, y + 32, 32, 4);
    // Cockpit
    ctx.fillStyle = COLORS.p2Glow; ctx.fillRect(x + 26, y + 20, 10, 8);
    ctx.fillStyle = "#AAEEFF"; ctx.fillRect(x + 28, y + 22, 6, 4);
    // Nez
    ctx.fillStyle = COLORS.p2; ctx.fillRect(x + 50, y + 21, 10, 6);
    ctx.fillStyle = COLORS.p2Glow; ctx.fillRect(x + 58, y + 22, 4, 4);
    // Ailerons
    ctx.fillStyle = COLORS.p2Dark; ctx.fillRect(x + 6, y + 4, 6, 8); ctx.fillRect(x + 6, y + 36, 6, 8);
    // Propulseur
    ctx.fillStyle = "#00DDFF"; ctx.fillRect(x + 2, y + 20, 6, 8);
    ctx.fillStyle = "#AAEEFF"; ctx.fillRect(x + 4, y + 22, 4, 4);
  };

  const drawYWing = (ctx: CanvasRenderingContext2D, p: Player) => {
    const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y);
    // Corps principal en deux nacelles parallèles
    ctx.fillStyle = COLORS.p3Dark;
    ctx.fillRect(x + 8, y + 4, 44, 14); ctx.fillRect(x + 8, y + 30, 44, 14);
    ctx.fillStyle = COLORS.p3;
    ctx.fillRect(x + 10, y + 6, 40, 10); ctx.fillRect(x + 10, y + 32, 40, 10);
    // Reliure centrale
    ctx.fillStyle = COLORS.p3Dark; ctx.fillRect(x + 18, y + 18, 28, 12);
    ctx.fillStyle = COLORS.p3; ctx.fillRect(x + 20, y + 20, 24, 8);
    // Cockpit central
    ctx.fillStyle = COLORS.p3Glow; ctx.fillRect(x + 26, y + 22, 12, 6);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x + 28, y + 23, 4, 3);
    // Nez avant
    ctx.fillStyle = COLORS.p3; ctx.fillRect(x + 50, y + 8, 8, 6); ctx.fillRect(x + 50, y + 34, 8, 6);
    ctx.fillStyle = COLORS.p3Glow; ctx.fillRect(x + 56, y + 9, 4, 4); ctx.fillRect(x + 56, y + 35, 4, 4);
    // Propulseurs
    ctx.fillStyle = "#5DCAA5"; ctx.fillRect(x + 4, y + 8, 6, 6); ctx.fillRect(x + 4, y + 34, 6, 6);
    ctx.fillStyle = "#A0E5C9"; ctx.fillRect(x + 6, y + 9, 4, 4); ctx.fillRect(x + 6, y + 35, 4, 4);
    // Détails turret au sommet
    ctx.fillStyle = COLORS.p3Dark; ctx.fillRect(x + 30, y, 8, 6);
    ctx.fillStyle = COLORS.p3; ctx.fillRect(x + 32, y + 2, 4, 3);
  };

  const drawGrunt = (ctx: CanvasRenderingContext2D, e: Enemy) => {
    const x = Math.floor(e.pos.x), y = Math.floor(e.pos.y);
    // TIE Fighter agrandi
    ctx.fillStyle = COLORS.enemyDark;
    ctx.fillRect(x + 6, y + 2, 6, 48); ctx.fillRect(x + 44, y + 2, 6, 48);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillRect(x + 7, y + 4, 4, 44); ctx.fillRect(x + 45, y + 4, 4, 44);
    // Liens
    ctx.fillStyle = COLORS.enemyDark; ctx.fillRect(x + 12, y + 24, 8, 4); ctx.fillRect(x + 36, y + 24, 8, 4);
    // Cockpit central
    ctx.fillStyle = COLORS.enemyDark; ctx.fillRect(x + 20, y + 18, 16, 16);
    ctx.fillStyle = COLORS.enemy; ctx.fillRect(x + 21, y + 19, 14, 14);
    ctx.fillStyle = COLORS.enemyEye; ctx.fillRect(x + 25, y + 23, 6, 6);
    ctx.fillStyle = "#FFAAAA"; ctx.fillRect(x + 27, y + 25, 2, 2);
  };

  const drawTank = (ctx: CanvasRenderingContext2D, e: Enemy) => {
    const x = Math.floor(e.pos.x), y = Math.floor(e.pos.y);
    ctx.fillStyle = COLORS.tankDark; ctx.fillRect(x, y + 6, 56, 40);
    ctx.fillStyle = COLORS.tank; ctx.fillRect(x + 3, y + 9, 50, 34);
    // Canon frontal allongé
    ctx.fillStyle = COLORS.tankDark; ctx.fillRect(x - 12, y + 22, 16, 10);
    ctx.fillStyle = COLORS.tankAccent; ctx.fillRect(x - 14, y + 24, 8, 6);
    // Plaques blindage
    ctx.fillStyle = COLORS.tankDark; ctx.fillRect(x + 12, y + 2, 32, 6); ctx.fillRect(x + 12, y + 44, 32, 6);
    // Hublot
    ctx.fillStyle = COLORS.tankAccent; ctx.fillRect(x + 34, y + 20, 12, 12);
    ctx.fillStyle = "#FFE5A0"; ctx.fillRect(x + 37, y + 23, 6, 6);
  };

  const drawSniper = (ctx: CanvasRenderingContext2D, e: Enemy) => {
    const x = Math.floor(e.pos.x), y = Math.floor(e.pos.y);
    ctx.fillStyle = COLORS.sniperDark; ctx.fillRect(x + 12, y + 10, 34, 30);
    ctx.fillStyle = COLORS.sniper; ctx.fillRect(x + 14, y + 12, 30, 26);
    // Canon long
    ctx.fillStyle = COLORS.sniperDark; ctx.fillRect(x - 12, y + 20, 26, 10);
    ctx.fillStyle = COLORS.sniper; ctx.fillRect(x - 9, y + 22, 20, 6);
    // Œil rouge
    ctx.fillStyle = COLORS.sniperEye; ctx.fillRect(x + 20, y + 18, 12, 12);
    ctx.fillStyle = "#FFAAAA"; ctx.fillRect(x + 23, y + 21, 6, 6);
    // Ailerons
    ctx.fillStyle = COLORS.sniperDark; ctx.fillRect(x + 30, y, 10, 10); ctx.fillRect(x + 30, y + 42, 10, 10);
  };

  const drawKamikaze = (ctx: CanvasRenderingContext2D, e: Enemy) => {
    const x = Math.floor(e.pos.x), y = Math.floor(e.pos.y);
    ctx.fillStyle = COLORS.kamikazeDark; ctx.fillRect(x, y + 18, 52, 18);
    ctx.fillStyle = COLORS.kamikaze; ctx.fillRect(x + 3, y + 21, 46, 12);
    // Pointe agressive
    ctx.fillStyle = COLORS.kamikazeDark; ctx.fillRect(x - 10, y + 22, 12, 8);
    ctx.fillStyle = COLORS.kamikaze; ctx.fillRect(x - 6, y + 24, 6, 4);
    // Ailes V
    ctx.fillStyle = COLORS.kamikazeDark; ctx.fillRect(x + 16, y + 4, 18, 10); ctx.fillRect(x + 16, y + 38, 18, 10);
    ctx.fillStyle = COLORS.kamikaze; ctx.fillRect(x + 19, y + 6, 12, 6); ctx.fillRect(x + 19, y + 40, 12, 6);
    // Cockpit
    ctx.fillStyle = "#FAC775"; ctx.fillRect(x + 28, y + 22, 10, 10);
    // Trainée
    ctx.fillStyle = "#FF8800"; ctx.fillRect(x + 48, y + 24, 6, 6);
  };

  const drawMiniBoss = (ctx: CanvasRenderingContext2D, m: MiniBoss) => {
    const x = Math.floor(m.pos.x), y = Math.floor(m.pos.y);
    if (m.entryProgress < 1) ctx.globalAlpha = m.entryProgress;
    ctx.fillStyle = COLORS.minibossDark; ctx.fillRect(x, y + 10, 60, 60);
    ctx.fillStyle = COLORS.miniboss; ctx.fillRect(x + 4, y + 14, 52, 52);
    ctx.fillStyle = COLORS.minibossDark; ctx.fillRect(x - 12, y + 30, 14, 20);
    ctx.fillStyle = COLORS.miniboss; ctx.fillRect(x - 10, y + 32, 10, 16);
    ctx.fillStyle = COLORS.minibossDark; ctx.fillRect(x + 18, y + 28, 24, 24);
    ctx.fillStyle = COLORS.miniboss; ctx.fillRect(x + 20, y + 30, 20, 20);
    ctx.fillStyle = COLORS.minibossEye; ctx.fillRect(x + 26, y + 36, 8, 8);
    ctx.fillStyle = "#FFE5A0"; ctx.fillRect(x + 28, y + 38, 4, 4);
    ctx.fillStyle = COLORS.minibossDark; ctx.fillRect(x + 22, y, 18, 12); ctx.fillRect(x + 22, y + 68, 18, 12);
    ctx.fillStyle = COLORS.miniboss; ctx.fillRect(x + 24, y + 2, 14, 8); ctx.fillRect(x + 24, y + 70, 14, 8);
    ctx.fillStyle = COLORS.minibossDark; ctx.fillRect(x - 4, y + 18, 10, 6); ctx.fillRect(x - 4, y + 56, 10, 6);
    if (m.laserActive && m.laserCharge >= 60) {
      ctx.strokeStyle = COLORS.minibossEye;
      ctx.globalAlpha = 0.7 + Math.sin(frameCountRef.current * 0.5) * 0.3;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 40);
      ctx.lineTo(x + 20 + Math.cos(m.laserAngle) * 600, y + 40 + Math.sin(m.laserAngle) * 600);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  };

  const drawFusedShip = (ctx: CanvasRenderingContext2D, f: Extract<FusionState, { kind: "fused" }>) => {
    const x = Math.floor(f.pos.x), y = Math.floor(f.pos.y);
    if (f.iFrames > 0 && Math.floor(f.iFrames / 4) % 2 === 0) return;
    const fr = frameCountRef.current;
    // Aura pulsante
    ctx.fillStyle = COLORS.fusionDark;
    ctx.globalAlpha = 0.3 + Math.sin(fr * 0.15) * 0.2;
    ctx.fillRect(x - 6, y - 6, FUSED_W + 12, FUSED_H + 12);
    ctx.globalAlpha = 1;
    // Châssis principal
    ctx.fillStyle = COLORS.fusionDark; ctx.fillRect(x + 10, y + 10, 60, 36);
    ctx.fillStyle = COLORS.fusion;     ctx.fillRect(x + 14, y + 14, 52, 28);
    // Cœur lumineux central
    ctx.fillStyle = COLORS.fusionGlow; ctx.fillRect(x + 28, y + 18, 18, 20);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x + 34, y + 22, 6, 12);
    // Nez avant
    ctx.fillStyle = COLORS.fusion;     ctx.fillRect(x + 60, y + 22, 14, 12);
    ctx.fillStyle = COLORS.fusionGlow; ctx.fillRect(x + 68, y + 24, 6, 8);
    // Ailes hybrides (P1 et P2 selon mode 2j, ajout P3 si 3j)
    ctx.fillStyle = COLORS.p1Dark; ctx.fillRect(x + 12, y, 32, 6);
    ctx.fillStyle = COLORS.p1;     ctx.fillRect(x + 14, y + 2, 28, 3);
    ctx.fillStyle = COLORS.p2Dark; ctx.fillRect(x + 12, y + 50, 32, 6);
    ctx.fillStyle = COLORS.p2;     ctx.fillRect(x + 14, y + 51, 28, 3);
    if (f.playerCount >= 3) {
      // 3e ligne d'aile au centre, couleur P3
      ctx.fillStyle = COLORS.p3Dark; ctx.fillRect(x + 44, y + 4, 22, 4);
      ctx.fillStyle = COLORS.p3;     ctx.fillRect(x + 46, y + 5, 18, 2);
      ctx.fillStyle = COLORS.p3Dark; ctx.fillRect(x + 44, y + 48, 22, 4);
      ctx.fillStyle = COLORS.p3;     ctx.fillRect(x + 46, y + 49, 18, 2);
    }
    // Canons brillants
    ctx.fillStyle = COLORS.fusionGlow;
    ctx.fillRect(x + 4, y, 6, 4); ctx.fillRect(x + 4, y + 52, 6, 4);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + 4, y + 1, 6, 1); ctx.fillRect(x + 4, y + 53, 6, 1);
    // Propulsion
    if (fr % 3 === 0) {
      particlesRef.current.push({
        pos: { x: f.pos.x + 4, y: f.pos.y + FUSED_H / 2 },
        vel: { x: -3 - Math.random(), y: (Math.random() - 0.5) * 1 },
        life: 12, maxLife: 12, size: 3, color: COLORS.fusion,
      });
    }
  };

  const drawBoss = (ctx: CanvasRenderingContext2D, b: Boss) => {
    const x = Math.floor(b.pos.x), y = Math.floor(b.pos.y);
    if (b.entryProgress < 1) ctx.globalAlpha = b.entryProgress;
    const main = b.phase === 3 ? COLORS.boss : b.phase === 2 ? "#D85A30" : COLORS.bossDark;
    const dark = b.phase === 3 ? COLORS.bossDark : "#712B13";
    const eye = COLORS.bossEye;
    const pulse = b.phase === 3 ? Math.sin(frameCountRef.current * 0.3) * 2 : 0;
    ctx.fillStyle = dark; ctx.fillRect(x + 10 + pulse, y, 100 - pulse * 2, 120);
    ctx.fillStyle = main; ctx.fillRect(x + 14, y + 4, 92, 112);
    ctx.fillStyle = dark; ctx.fillRect(x, y + 20, 14, 80); ctx.fillRect(x + 106, y + 20, 14, 80);
    ctx.fillStyle = main; ctx.fillRect(x + 2, y + 24, 10, 72); ctx.fillRect(x + 108, y + 24, 10, 72);
    ctx.fillStyle = dark; ctx.fillRect(x + 30, y + 40, 60, 40);
    ctx.fillStyle = main; ctx.fillRect(x + 34, y + 44, 52, 32);
    ctx.fillStyle = eye; ctx.fillRect(x + 50, y + 52, 20, 16);
    ctx.fillStyle = "#FFE5A0"; ctx.fillRect(x + 54, y + 56, 12, 8);
    ctx.fillStyle = dark;
    ctx.fillRect(x + 40, y - 10, 12, 14); ctx.fillRect(x + 68, y - 10, 12, 14);
    ctx.fillRect(x + 40, y + 116, 12, 14); ctx.fillRect(x + 68, y + 116, 12, 14);
    ctx.fillStyle = main;
    ctx.fillRect(x + 42, y - 8, 8, 10); ctx.fillRect(x + 70, y - 8, 8, 10);
    ctx.fillRect(x + 42, y + 118, 8, 10); ctx.fillRect(x + 70, y + 118, 8, 10);
    ctx.fillStyle = b.phase === 3 ? eye : dark;
    ctx.fillRect(x - 8, y + 30, 14, 8); ctx.fillRect(x - 8, y + 82, 14, 8);
    if (b.phase >= 2) {
      ctx.fillStyle = eye;
      ctx.fillRect(x + 20, y + 24, 4, 4); ctx.fillRect(x + 96, y + 24, 4, 4);
      ctx.fillRect(x + 20, y + 92, 4, 4); ctx.fillRect(x + 96, y + 92, 4, 4);
    }
    if (b.phase >= 3) {
      ctx.globalAlpha = 0.5 + Math.sin(frameCountRef.current * 0.2) * 0.3;
      ctx.fillStyle = COLORS.bossEye;
      ctx.fillRect(x + 4, y + 40, 6, 40); ctx.fillRect(x + 110, y + 40, 6, 40);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  };

  // ==========================================================================
  // Boucle principale
  // ==========================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    if (starsRef.current.length === 0) initStars();
    const loop = () => {
      if (gameState === "playing") update();
      render(ctx);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [gameState, initStars]);

  // Lance la partie effective
  const startGame = (playerCount: number, levelIdx: number) => {
    playerCountRef.current = playerCount;
    currentLevelRef.current = LEVELS[levelIdx];
    setLastEarnedMedal(null);
    resetGame();
    setGameState("playing");
  };

  const effectLabels: Record<string, { label: string; color: string }> = {
    spread: { label: "SPR", color: "text-blue-300" },
    rapid: { label: "RPD", color: "text-yellow-300" },
    laser: { label: "LSR", color: "text-pink-300" },
  };

  const playerLabels = ["P1", "P2", "P3"];
  const playerTextColors = ["text-red-400", "text-blue-400", "text-green-400"];
  const playerBgColors = ["bg-red-500", "bg-blue-500", "bg-green-500"];
  const playerBgDark = ["bg-red-950", "bg-blue-950", "bg-green-950"];
  const playerBorder = ["border-red-500", "border-blue-500", "border-green-500"];
  const playerBorderClass = ["border-red-700", "border-blue-700", "border-green-700"];
  const playerShipNames = ["X-WING", "A-WING", "Y-WING"];

  // Configuration des contrôles par joueur
  const PLAYER_CONTROLS: { move: string; fire: string; bomb: string }[] = [
    { move: "WASD / ZQSD", fire: "SPACE", bomb: "C" },
    { move: "ARROWS", fire: "ENTER", bomb: "R-SHIFT" },
    { move: "I J K L", fire: "U", bomb: "O" },
  ];

  // Petit composant : panneau latéral d'un joueur (HP, bombes, effets, contrôles)
  const PlayerPanel: React.FC<{ idx: number; align: "left" | "right" }> = ({ idx, align }) => {
    const p = hudData.players[idx];
    if (!p) return null;
    const ctrl = PLAYER_CONTROLS[idx];
    return (
      <div className={`flex flex-col gap-2 w-[180px] border-2 ${playerBorderClass[idx]} bg-black/70 p-2 ${align === "right" ? "items-end" : "items-start"}`}>
        {/* Header : label + nom du vaisseau */}
        <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <span className={`${playerTextColors[idx]} text-sm font-bold tracking-widest`}>
            {playerLabels[idx]}
          </span>
          <span className="text-gray-400 text-[10px] tracking-widest">{playerShipNames[idx]}</span>
        </div>
        {/* Barre de vie */}
        <div className="w-full">
          <div className={`w-full h-3 ${playerBgDark[idx]} border ${playerBorder[idx]} overflow-hidden`}>
            <div className={`h-full ${playerBgColors[idx]} transition-all duration-150`}
              style={{ width: `${(p.hp / p.maxHp) * 100}%`, marginLeft: align === "right" ? "auto" : 0 }} />
          </div>
          <div className={`text-[9px] text-gray-400 mt-0.5 ${align === "right" ? "text-right" : ""}`}>
            HP {Math.floor(p.hp)}/{p.maxHp}
          </div>
        </div>
        {/* Bombes + Bouclier */}
        <div className={`flex items-center gap-2 text-xs ${align === "right" ? "flex-row-reverse" : ""}`}>
          <div className="flex items-center gap-0.5 text-yellow-300">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < p.bombs ? "" : "opacity-20"}>★</span>
            ))}
          </div>
          {p.shield > 0 && (<span className="text-green-400">▣×{p.shield}</span>)}
        </div>
        {/* Effets actifs */}
        {p.effects.length > 0 && (
          <div className={`flex gap-1 text-[10px] ${align === "right" ? "flex-row-reverse" : ""}`}>
            {p.effects.map((eff) => {
              const lv = p.levels[eff as keyof WeaponLevels] ?? 0;
              return (
                <span key={eff} className={effectLabels[eff]?.color ?? "text-white"}>
                  {effectLabels[eff]?.label ?? eff.toUpperCase()}
                  {lv > 0 && <span className="text-yellow-200">·{lv}</span>}
                </span>
              );
            })}
          </div>
        )}
        {/* Séparateur */}
        <div className="w-full border-t border-gray-700 my-1"></div>
        {/* Contrôles */}
        <div className={`flex flex-col gap-0.5 text-[10px] w-full ${align === "right" ? "items-end" : "items-start"}`}>
          <div className="text-gray-500 tracking-widest text-[9px] mb-0.5">CONTROLS</div>
          <div className={`flex gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
            <span className="text-gray-400">MOVE</span>
            <span className={playerTextColors[idx]}>{ctrl.move}</span>
          </div>
          <div className={`flex gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
            <span className="text-gray-400">FIRE</span>
            <span className={playerTextColors[idx]}>{ctrl.fire}</span>
          </div>
          <div className={`flex gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
            <span className="text-gray-400">BOMB</span>
            <span className={playerTextColors[idx]}>{ctrl.bomb}</span>
          </div>
        </div>
        {/* État alive/dead */}
        {!p.alive && (
          <div className="text-red-500 text-[10px] tracking-widest font-bold mt-1">✗ DESTROYED</div>
        )}
      </div>
    );
  };

  // Affichage des médailles d'un niveau
  const MedalDisplay: React.FC<{ medal: Medal | null; size?: "sm" | "md" | "lg" }> = ({ medal, size = "sm" }) => {
    const sz = size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base";
    if (medal === "gold")
      return <span className={`${sz}`} title="Gold: no death + combo ≥ ×4">🥇</span>;
    if (medal === "silver")
      return <span className={`${sz}`} title="Silver: no death">🥈</span>;
    if (medal === "bronze")
      return <span className={`${sz}`} title="Bronze: completed">🥉</span>;
    return <span className={`${sz} opacity-20`}>⚫</span>;
  };

  // Layout des panneaux selon le nombre de joueurs
  // 1j  → P1 à gauche seul
  // 2j  → P1 gauche, P2 droite
  // 3j  → P1 gauche, P2 droite, P3 sous le canvas centré
  const playerCount = hudData.players.length;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono select-none p-4">
      {/* Conteneur global : panneaux côté + jeu au centre */}
      <div className="flex items-start gap-3">
        {/* Panneau gauche */}
        {gameState === "playing" && playerCount >= 1 && (
          <PlayerPanel idx={0} align="left" />
        )}

        {/* Canvas + UI in-game */}
        <div className="flex flex-col items-center">
          <div className="relative border-4 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.4)]"
            style={{ width: CANVAS_W, maxWidth: "100%" }}>

            {/* HUD haut : score + combo + fusion */}
            {gameState === "playing" && (
              <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-center px-3 py-2 bg-gradient-to-b from-black/90 to-transparent pointer-events-none">
                <div className="flex flex-col items-center min-w-[140px]">
                  <span className="text-yellow-300 text-[10px] tracking-[0.3em]">SCORE</span>
                  <span className="text-yellow-100 text-2xl tracking-widest font-bold tabular-nums">
                    {String(hudData.score).padStart(6, "0")}
                  </span>
                  {hudData.combo > 1 && (
                    <span className={`text-sm tracking-widest font-bold ${
                      hudData.combo >= 16 ? "text-pink-300" :
                      hudData.combo >= 8 ? "text-red-400" :
                      hudData.combo >= 4 ? "text-orange-300" : "text-yellow-300"
                    } animate-pulse`}>
                      COMBO ×{hudData.combo}
                    </span>
                  )}
                  {hudData.fusion.kind === "separate" && hudData.fusion.progress > 0.1 && (
                    <div className="mt-1 text-pink-300 text-[10px] tracking-widest animate-pulse">
                      FUSION : {Math.floor(hudData.fusion.progress * 100)}%
                    </div>
                  )}
                  {hudData.fusion.kind === "fused" && (
                    <div className="mt-1 flex flex-col items-center">
                      <span className="text-pink-300 text-xs tracking-widest font-bold animate-pulse">⚡ FUSION ⚡</span>
                      <div className="w-32 h-2 bg-pink-950 border border-pink-500 mt-1">
                        <div className="h-full bg-pink-400"
                          style={{ width: `${(hudData.fusion.hp / hudData.fusion.maxHp) * 100}%` }} />
                      </div>
                      <span className="text-[9px] text-pink-200">F = SPLIT</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Barre boss */}
            {gameState === "playing" && hudData.boss && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none">
                <div className="text-red-300 text-xs tracking-widest">
                  IMPERIAL DREADNAUGHT — PHASE {hudData.boss.phase}
                </div>
                <div className="w-[400px] h-4 bg-red-950 border-2 border-red-500 overflow-hidden">
                  <div className={`h-full transition-all duration-150 ${
                    hudData.boss.phase === 3 ? "bg-red-500" :
                    hudData.boss.phase === 2 ? "bg-orange-500" : "bg-red-700"
                  }`} style={{ width: `${(hudData.boss.hp / hudData.boss.maxHp) * 100}%` }} />
                </div>
              </div>
            )}

            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
              className="block w-full" style={{ imageRendering: "pixelated" }} />

            {/* Overlays CRT */}
            <div className="absolute inset-0 pointer-events-none z-10"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 3px)",
                mixBlendMode: "multiply",
              }} />
            <div className="absolute inset-0 pointer-events-none z-10"
              style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)" }} />
            <div className="absolute inset-0 pointer-events-none z-10 opacity-30"
              style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,0,0,0.04) 0px, rgba(0,255,255,0.04) 1px, transparent 2px)" }} />

            {/* === MENU PRINCIPAL === */}
            {gameState === "menu" && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
                <h1 className="text-yellow-300 text-5xl tracking-[0.4em] mb-2 drop-shadow-[0_0_10px_rgba(234,179,8,0.7)]">STAR</h1>
                <h1 className="text-red-400 text-5xl tracking-[0.4em] mb-10 drop-shadow-[0_0_10px_rgba(239,68,68,0.7)]">RAID II</h1>
                <button
                  onClick={() => { ensureAudio(); setGameState("playerSelect"); }}
                  className="px-8 py-3 border-2 border-yellow-400 text-yellow-300 tracking-[0.3em] text-sm hover:bg-yellow-400 hover:text-black transition-colors mb-2"
                >
                  ► NEW GAME ◄
                </button>
                <div className="text-cyan-300 text-xs tracking-widest mt-6 opacity-70 text-center max-w-md">
                  <div>★ COLLECT POWER-UPS — REPEAT FOR PERMANENT UPGRADES (LV1→3) ★</div>
                  <div>★ STAY CLOSE TO ALLY 2s = FUSION INTO SUPER-SHIP (press F to split) ★</div>
                  <div>★ CHAIN KILLS FOR COMBO MULTIPLIER — UP TO ×16 ★</div>
                  <div>★ EARN MEDALS : 🥉 finish — 🥈 no death — 🥇 no death + combo ★</div>
                </div>
              </div>
            )}

            {/* === SÉLECTION JOUEURS === */}
            {gameState === "playerSelect" && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
                <h2 className="text-yellow-300 text-3xl tracking-[0.3em] mb-2">SELECT PLAYERS</h2>
                <div className="text-cyan-200 text-xs tracking-widest mb-8 opacity-70">How many pilots?</div>
                <div className="flex gap-4 mb-8">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => { setSelectedPlayerCount(n); setGameState("levelSelect"); }}
                      className={`w-40 h-48 border-2 flex flex-col items-center justify-center transition-all
                        ${n === 1 ? "border-red-500 hover:bg-red-500/20" :
                          n === 2 ? "border-blue-500 hover:bg-blue-500/20" :
                          "border-green-500 hover:bg-green-500/20"}`}
                    >
                      <div className="text-5xl mb-2">{n}</div>
                      <div className="text-lg tracking-widest mb-2">
                        {n === 1 ? "SOLO" : n === 2 ? "DUO" : "TRIO"}
                      </div>
                      <div className="text-[10px] opacity-70 px-2 text-center">
                        {n === 1 && "Solo run — challenging"}
                        {n === 2 && "Co-op + Fusion"}
                        {n === 3 && "Trio + Triple fusion"}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-gray-400 grid grid-cols-3 gap-6 max-w-xl">
                  <div className="text-red-300">
                    <div className="text-red-400 mb-1 font-bold">P1 — X-WING</div>
                    <div>Move: WASD / ZQSD</div>
                    <div>Fire: SPACE (hold)</div>
                    <div>Bomb: C</div>
                  </div>
                  <div className="text-blue-300">
                    <div className="text-blue-400 mb-1 font-bold">P2 — A-WING</div>
                    <div>Move: ARROW KEYS</div>
                    <div>Fire: ENTER (hold)</div>
                    <div>Bomb: RIGHT SHIFT</div>
                  </div>
                  <div className="text-green-300">
                    <div className="text-green-400 mb-1 font-bold">P3 — Y-WING</div>
                    <div>Move: I J K L</div>
                    <div>Fire: U (hold)</div>
                    <div>Bomb: O</div>
                  </div>
                </div>
                <button onClick={() => setGameState("menu")} className="mt-6 text-gray-400 text-xs tracking-widest hover:text-white">
                  ← BACK
                </button>
              </div>
            )}

            {/* === SÉLECTION NIVEAU === */}
            {gameState === "levelSelect" && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto py-4">
                <h2 className="text-yellow-300 text-3xl tracking-[0.3em] mb-1">SELECT LEVEL</h2>
                <div className="text-cyan-200 text-xs tracking-widest mb-2 opacity-70">
                  {selectedPlayerCount} PILOT{selectedPlayerCount > 1 ? "S" : ""} READY
                </div>
                {/* Stats globales : médailles totales débloquées */}
                <div className="text-yellow-300 text-xs tracking-widest mb-3 flex items-center gap-2">
                  <span>🥇 {Object.values(medals).filter((m) => m === "gold").length}</span>
                  <span>🥈 {Object.values(medals).filter((m) => m === "silver").length}</span>
                  <span>🥉 {Object.values(medals).filter((m) => m === "bronze").length}</span>
                  <span className="text-gray-500">/ 10</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto px-2">
                  {LEVELS.map((lvl, idx) => {
                    const myMedal = medals[lvl.id] ?? null;
                    return (
                      <button
                        key={lvl.id}
                        onClick={() => { setSelectedLevel(idx); startGame(selectedPlayerCount, idx); }}
                        className="w-[300px] border-2 border-gray-600 hover:border-yellow-400 hover:bg-yellow-500/10 transition-all px-3 py-2 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-yellow-300 text-sm font-bold tracking-widest">
                            {String(lvl.id).padStart(2, "0")} {lvl.name}
                          </div>
                          <div className="text-yellow-400 text-xs">
                            {"★".repeat(lvl.difficulty)}{"☆".repeat(5 - lvl.difficulty)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <div className="text-gray-400 text-[10px] tracking-wider">{lvl.subtitle}</div>
                          <div className="flex items-center gap-0.5">
                            <MedalDisplay medal={myMedal} size="sm" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setGameState("playerSelect")} className="mt-3 text-gray-400 text-xs tracking-widest hover:text-white">
                  ← BACK
                </button>
              </div>
            )}

            {/* === VICTORY === */}
            {gameState === "victory" && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
                <h2 className="text-yellow-300 text-5xl tracking-[0.4em] mb-4 drop-shadow-[0_0_10px_rgba(234,179,8,0.7)]">VICTORY!</h2>
                <div className="text-cyan-300 text-lg mb-2">{LEVELS[selectedLevel]?.name} CLEARED</div>

                {/* Médaille gagnée */}
                {lastEarnedMedal && (
                  <div className="flex flex-col items-center my-3">
                    <div className="text-[10px] text-gray-400 tracking-widest mb-1">MEDAL EARNED</div>
                    <div className="text-7xl mb-1">
                      <MedalDisplay medal={lastEarnedMedal} size="lg" />
                    </div>
                    <div className="text-yellow-200 text-sm tracking-widest uppercase">
                      {lastEarnedMedal === "gold" && "★ GOLD — PERFECT RUN ★"}
                      {lastEarnedMedal === "silver" && "SILVER — NO DEATH"}
                      {lastEarnedMedal === "bronze" && "BRONZE — COMPLETED"}
                    </div>
                    {lastEarnedMedal !== "gold" && (
                      <div className="text-gray-500 text-[10px] tracking-wider mt-1">
                        {lastEarnedMedal === "silver" && "Tip: keep combo ≥ ×4 for GOLD"}
                        {lastEarnedMedal === "bronze" && "Tip: finish without a death for SILVER"}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-yellow-300 text-base mb-1 mt-2">FINAL SCORE</div>
                <div className="text-yellow-100 text-3xl tracking-widest mb-6 tabular-nums">
                  {String(hudData.score).padStart(6, "0")}
                </div>
                <div className="text-cyan-300 text-sm tracking-widest animate-pulse">► PRESS ENTER FOR LEVEL SELECT ◄</div>
              </div>
            )}

            {/* === GAME OVER === */}
            {gameState === "gameover" && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
                <h2 className="text-red-500 text-5xl tracking-[0.4em] mb-6 drop-shadow-[0_0_10px_rgba(239,68,68,0.7)]">GAME OVER</h2>
                <div className="text-yellow-300 text-xl mb-2">FINAL SCORE</div>
                <div className="text-yellow-100 text-4xl tracking-widest mb-8 tabular-nums">
                  {String(hudData.score).padStart(6, "0")}
                </div>
                <div className="text-cyan-300 text-sm tracking-widest animate-pulse">► PRESS ENTER FOR LEVEL SELECT ◄</div>
              </div>
            )}
          </div>

          {/* P3 sous le canvas en mode trio */}
          {gameState === "playing" && playerCount >= 3 && (
            <div className="mt-3">
              <PlayerPanel idx={2} align="left" />
            </div>
          )}

          <div className="mt-4 text-gray-600 text-xs tracking-widest">
            ★ STAR RAID II — 1-3 PLAYERS — 10 LEVELS — V5 ★
          </div>
        </div>

        {/* Panneau droit (P2 si ≥2 joueurs) */}
        {gameState === "playing" && playerCount >= 2 && (
          <PlayerPanel idx={1} align="right" />
        )}
      </div>
    </div>
  );
};

export default SpaceShooter;
