// Pure game logic for freefall — no DOM, no React.
// All coordinates are in logical units: width is fixed at LOGICAL_W,
// height varies with the viewport aspect ratio.

export const LOGICAL_W = 424;
export const BALL_R = 13;
export const PLATFORM_H = 12;

const GRAVITY = 2600;
const MAX_FALL = 920;
const SPACING = 150; // vertical distance between platforms
const KEY_ACCEL = 6800;
const KEY_MAX = 570;
const KEY_DAMP = 12;
const RISE_START = 150;
const RISE_MAX = 430;
const WALL_MARGIN = 10;
const GAP_MAX = 96;
const GAP_MIN = 64;
// Ball slips through a gap when its center is at least this far inside the
// edge — forgiving compared to requiring the full radius to fit.
const FIT = BALL_R * 0.55;

export interface Gap {
  l: number;
  r: number;
}

export interface Platform {
  y: number;
  gaps: Gap[]; // sorted left to right
  counted: boolean;
}

export interface GameState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  platforms: Platform[];
  score: number;
  time: number;
  riseSpeed: number;
  dead: boolean;
  standing: boolean;
  h: number; // logical height of the playfield
}

export interface GameInput {
  dir: number; // -1 | 0 | 1 from keyboard
  dragX: number | null; // absolute target x while touch-dragging
}

function gapWidth(score: number): number {
  return Math.max(GAP_MIN, GAP_MAX - score * 0.7);
}

function makePlatform(y: number, score: number): Platform {
  const gw = gapWidth(score);
  const two = score >= 6 && Math.random() < Math.min(0.38, (score - 5) * 0.03);
  const gaps: Gap[] = [];
  if (two) {
    const w = gw * 0.8;
    const half = LOGICAL_W / 2;
    const span = half - w - WALL_MARGIN - 20;
    const l1 = WALL_MARGIN + Math.random() * span;
    const l2 = half + 20 + Math.random() * span;
    gaps.push({ l: l1, r: l1 + w }, { l: l2, r: l2 + w });
  } else {
    const l = WALL_MARGIN + Math.random() * (LOGICAL_W - gw - WALL_MARGIN * 2);
    gaps.push({ l, r: l + gw });
  }
  return { y, gaps, counted: false };
}

export function createGame(h: number): GameState {
  const s: GameState = {
    x: LOGICAL_W / 2,
    y: h * 0.22,
    vx: 0,
    vy: 0,
    platforms: [],
    score: 0,
    time: 0,
    riseSpeed: RISE_START,
    dead: false,
    standing: false,
    h,
  };
  for (let y = h * 0.55; y < h + SPACING; y += SPACING) {
    s.platforms.push(makePlatform(y, 0));
  }
  return s;
}

export function step(s: GameState, dt: number, input: GameInput): void {
  if (s.dead) return;
  s.time += dt;
  s.riseSpeed = Math.min(RISE_MAX, RISE_START + s.score * 4.2 + s.time * 2.2);

  for (const p of s.platforms) p.y -= s.riseSpeed * dt;

  // Keep a platform queued just below the bottom edge.
  let lowest = -Infinity;
  for (const p of s.platforms) lowest = Math.max(lowest, p.y);
  while (lowest < s.h + SPACING) {
    lowest = lowest === -Infinity ? s.h + PLATFORM_H : lowest + SPACING;
    s.platforms.push(makePlatform(lowest, s.score));
  }

  // Horizontal: drag is positional, keyboard is velocity-based.
  if (input.dragX !== null) {
    s.x = input.dragX;
    s.vx = 0;
  } else {
    if (input.dir !== 0) s.vx += input.dir * KEY_ACCEL * dt;
    else s.vx *= Math.exp(-KEY_DAMP * dt);
    s.vx = Math.max(-KEY_MAX, Math.min(KEY_MAX, s.vx));
    s.x += s.vx * dt;
  }
  if (s.x < BALL_R) {
    s.x = BALL_R;
    s.vx = 0;
  } else if (s.x > LOGICAL_W - BALL_R) {
    s.x = LOGICAL_W - BALL_R;
    s.vx = 0;
  }

  // Vertical
  s.vy = Math.min(s.vy + GRAVITY * dt, MAX_FALL);
  s.y += s.vy * dt;
  s.standing = false;

  if (s.y > s.h - BALL_R) {
    s.y = s.h - BALL_R;
    s.vy = 0;
    s.standing = true;
  }

  for (const p of s.platforms) {
    const top = p.y;
    const bot = p.y + PLATFORM_H;
    if (s.y + BALL_R <= top || s.y - BALL_R >= bot) continue;
    if (s.y < top) {
      // Contact from above: land unless the ball is over a gap.
      const over = p.gaps.some((g) => s.x - FIT >= g.l && s.x + FIT <= g.r);
      if (!over) {
        s.y = top - BALL_R;
        s.vy = 0;
        s.standing = true;
      }
    } else if (s.y <= bot) {
      // Center inside the slot: confine the ball to the nearest gap.
      let g: Gap | null = null;
      let bestD = Infinity;
      for (const gg of p.gaps) {
        const d = Math.abs(s.x - (gg.l + gg.r) / 2);
        if (d < bestD) {
          bestD = d;
          g = gg;
        }
      }
      if (g) {
        if (s.x < g.l + FIT) {
          s.x = g.l + FIT;
          s.vx = 0;
        } else if (s.x > g.r - FIT) {
          s.x = g.r - FIT;
          s.vx = 0;
        }
      }
    }
  }

  if (s.standing && s.y - BALL_R <= 1) {
    s.dead = true;
  }

  for (const p of s.platforms) {
    if (!p.counted && p.y + PLATFORM_H < s.y - BALL_R) {
      p.counted = true;
      s.score++;
    }
  }
  s.platforms = s.platforms.filter((p) => p.y + PLATFORM_H > -40);
}
