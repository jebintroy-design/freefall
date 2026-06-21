"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { base } from "wagmi/chains";
import { config } from "@/lib/wagmi";
import { FREEFALL, BUILDER_SUFFIX, basescanTxUrl, truncAddr } from "@/lib/contract";
import type { Connector } from "wagmi";
import Leaderboard from "@/components/Leaderboard";
import {
  LOGICAL_W,
  BALL_R,
  PLATFORM_H,
  createGame,
  step,
  type GameState,
  type GameInput,
  type Platform,
} from "@/lib/game";

type Mode = "title" | "starting" | "playing" | "dead" | "board";

interface AttestState {
  step: "idle" | "wallet" | "confirming" | "success" | "error";
  hash?: `0x${string}`;
  message?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  sp: number;
}

const DRAG_SENSITIVITY = 1.2;
const TRAIL_LEN = 16;
const BALL_GLOW = "#19e3ff";
const NEON_PINK = "#ff2d95";

function humanizeError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const msg = err?.shortMessage || err?.message || "something went wrong";
  if (/user rejected|user denied|rejected the request|request rejected/i.test(msg)) {
    return "transaction rejected";
  }
  return msg.length > 90 ? `${msg.slice(0, 90)}…` : msg;
}

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<Mode>("title");
  const [score, setScore] = useState(0);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [attest, setAttest] = useState<AttestState>({ step: "idle" });
  const [hasOpenSession, setHasOpenSession] = useState(false);
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [warnModal, setWarnModal] = useState(false);
  const [walletPicker, setWalletPicker] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const modeRef = useRef<Mode>("title");
  const stateRef = useRef<GameState | null>(null);
  const inputRef = useRef<GameInput>({ dir: 0, dragX: null });
  const keysRef = useRef({ left: false, right: false });
  const dragRef = useRef<{ id: number; startPx: number; startBallX: number } | null>(null);
  const sizeRef = useRef({ cssW: 424, cssH: 800, dpr: 1, scale: 1, h: 800 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const shakeRef = useRef(0);
  const deathAtRef = useRef(0);
  const lastScoreRef = useRef(0);
  const titleRef = useRef({ y: -60, vy: 120, t: 0 });
  const spinnerRef = useRef({ t: 0 });
  const squashRef = useRef({ sx: 1, sy: 1 });
  const faceRef = useRef({ look: 0, fall: 0, lastX: LOGICAL_W / 2 });
  const blinkRef = useRef({ timer: 2.5, phase: 0 });
  const sessionRef = useRef(false);
  const pendingScoreRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const boardFromRef = useRef<Mode>("title");

  const { address, chainId, isConnected } = useConnection();
  const connectors = useConnectors();
  const { connectAsync, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const wrongChain = isConnected && chainId !== base.id;

  const bestRead = useReadContract({
    ...FREEFALL,
    functionName: "bestScore",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const goMode = useCallback((m: Mode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  const setSession = useCallback((open: boolean) => {
    sessionRef.current = open;
    setHasOpenSession(open);
  }, []);

  const setPending = useCallback((n: number | null) => {
    pendingScoreRef.current = n;
    setPendingScore(n);
  }, []);

  const startRun = useCallback(() => {
    setAttest({ step: "idle" });
    setWarnModal(false);
    stateRef.current = createGame(sizeRef.current.h);
    trailRef.current = [];
    particlesRef.current = [];
    shakeRef.current = 0;
    lastScoreRef.current = 0;
    setScore(0);
    inputRef.current.dragX = null;
    dragRef.current = null;
    goMode("playing");
  }, [goMode]);

  const playRanked = useCallback(async () => {
    setMenuError(null);
    setPending(null); // the new session replaces any unattested run
    spinnerRef.current.t = 0;
    goMode("starting");
    try {
      const hash = await writeContractAsync({
        ...FREEFALL,
        functionName: "startGame",
        chainId: base.id,
        dataSuffix: BUILDER_SUFFIX,
      });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("transaction reverted");
      setSession(true);
      startRun();
    } catch (e) {
      goMode("title");
      setMenuError(humanizeError(e));
    }
  }, [goMode, setPending, setSession, startRun, writeContractAsync]);

  const requestRanked = useCallback(() => {
    if (pendingScoreRef.current !== null && !warnedRef.current) {
      warnedRef.current = true;
      setWarnModal(true);
      return;
    }
    playRanked();
  }, [playRanked]);

  const attestNow = useCallback(async () => {
    const sc = pendingScoreRef.current;
    if (!sc || sc <= 0) return;
    setAttest({ step: "wallet" });
    try {
      const hash = await writeContractAsync({
        ...FREEFALL,
        functionName: "attestScore",
        args: [BigInt(sc)],
        chainId: base.id,
        dataSuffix: BUILDER_SUFFIX,
      });
      setAttest({ step: "confirming", hash });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") {
        setAttest({ step: "error", hash, message: "transaction reverted" });
        return;
      }
      setAttest({ step: "success", hash });
      setSession(false);
      setPending(null);
      bestRead.refetch();
    } catch (e) {
      setAttest((a) => ({ step: "error", hash: a.hash, message: humanizeError(e) }));
    }
  }, [bestRead, setPending, setSession, writeContractAsync]);

  const retry = useCallback(() => {
    requestRanked();
  }, [requestRanked]);

  const openBoard = useCallback(() => {
    boardFromRef.current = modeRef.current === "dead" ? "dead" : "title";
    goMode("board");
  }, [goMode]);

  const pickWallet = useCallback(
    async (connector: Connector) => {
      setMenuError(null);
      setConnectingId(connector.uid);
      try {
        await connectAsync({ connector });
        setWalletPicker(false);
      } catch (e) {
        setMenuError(humanizeError(e));
      } finally {
        setConnectingId(null);
      }
    },
    [connectAsync],
  );

  // close the picker once a wallet is connected
  useEffect(() => {
    if (isConnected) setWalletPicker(false);
  }, [isConnected]);

  // forget the local session when the wallet disconnects or changes
  useEffect(() => {
    if (!isConnected) {
      setSession(false);
      setPending(null);
    }
  }, [isConnected, address, setSession, setPending]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const applySize = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const scale = cssW / LOGICAL_W;
      const h = cssH / scale;
      sizeRef.current = { cssW, cssH, dpr, scale, h };
      if (stateRef.current) stateRef.current.h = h;
      if (!starsRef.current.length) {
        const stars: Star[] = [];
        for (let i = 0; i < 70; i++) {
          stars.push({
            x: Math.random() * LOGICAL_W,
            y: Math.random() * h,
            r: 0.6 + Math.random() * 1.4,
            sp: 0.3 + Math.random() * 0.9,
          });
        }
        starsRef.current = stars;
      }
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        keysRef.current.left = true;
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        keysRef.current.right = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const spawnParticles = (x: number, y: number) => {
      const out: Particle[] = [];
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 130 + Math.random() * 340;
        out.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.8 });
      }
      particlesRef.current = out;
    };

    const update = (dt: number) => {
      const m = modeRef.current;

      // blink
      const blink = blinkRef.current;
      blink.timer -= dt;
      if (blink.timer <= 0) {
        blink.phase = 0.16;
        blink.timer = 2 + Math.random() * 3;
      }
      blink.phase = Math.max(0, blink.phase - dt);

      // starfield drifts upward; faster while playing
      const starSpeed =
        m === "playing" && stateRef.current ? stateRef.current.riseSpeed * 0.3 : 26;
      for (const st of starsRef.current) {
        st.y -= st.sp * starSpeed * dt;
        if (st.y < -2) {
          st.y = sizeRef.current.h + 2;
          st.x = Math.random() * LOGICAL_W;
        }
      }

      const face = faceRef.current;
      const squash = squashRef.current;
      const lerp = 1 - Math.exp(-14 * dt);

      if (m === "title" || m === "board") {
        const tb = titleRef.current;
        tb.t += dt;
        tb.vy += 1500 * dt;
        tb.y += tb.vy * dt;
        if (tb.y > sizeRef.current.h + 80) {
          tb.y = -60;
          tb.vy = 100;
          trailRef.current = [];
        }
        trailRef.current.push({ x: LOGICAL_W / 2, y: tb.y });
        if (trailRef.current.length > TRAIL_LEN) trailRef.current.shift();
        face.look += (0 - face.look) * lerp;
        face.fall += (0.35 - face.fall) * lerp;
        squash.sx += (0.96 - squash.sx) * lerp;
        squash.sy += (1.06 - squash.sy) * lerp;
      } else if (m === "starting") {
        spinnerRef.current.t += dt;
        face.look += (0 - face.look) * lerp;
        face.fall += (0 - face.fall) * lerp;
        squash.sx += (1 - squash.sx) * lerp;
        squash.sy += (1 - squash.sy) * lerp;
      } else if (m === "playing") {
        const s = stateRef.current;
        if (!s) return;
        step(s, dt, {
          dir: (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0),
          dragX: inputRef.current.dragX,
        });
        trailRef.current.push({ x: s.x, y: s.y });
        if (trailRef.current.length > TRAIL_LEN) trailRef.current.shift();

        // face + squash react to motion
        const realVx = dt > 0 ? (s.x - face.lastX) / dt : 0;
        face.lastX = s.x;
        face.look += (Math.max(-1, Math.min(1, realVx / 480)) - face.look) * lerp;
        face.fall += (Math.max(-0.4, Math.min(1, s.vy / 750)) - face.fall) * lerp;
        const stretch = Math.min(s.vy / 3200, 0.16);
        const tx = s.standing ? 1.16 : 1 - stretch * 0.6;
        const ty = s.standing ? 0.8 : 1 + stretch;
        squash.sx += (tx - squash.sx) * lerp;
        squash.sy += (ty - squash.sy) * lerp;

        if (s.score !== lastScoreRef.current) {
          lastScoreRef.current = s.score;
          setScore(s.score);
        }
        if (s.dead) {
          goMode("dead");
          deathAtRef.current = performance.now();
          shakeRef.current = 1;
          spawnParticles(s.x, s.y);
          warnedRef.current = false;
          if (s.score > 0) {
            pendingScoreRef.current = s.score;
            setPendingScore(s.score);
          }
        }
      } else {
        if (trailRef.current.length) trailRef.current.shift();
      }

      shakeRef.current = Math.max(0, shakeRef.current - dt * 2.4);
      const parts = particlesRef.current;
      for (const pt of parts) {
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 900 * dt;
      }
      particlesRef.current = parts.filter((pt) => pt.life > 0);
    };

    const drawStars = (h: number) => {
      for (const st of starsRef.current) {
        if (st.y > h + 2) continue;
        ctx.fillStyle = `rgba(150, 200, 255, ${(0.1 + st.sp * 0.22).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawTrail = () => {
      const trail = trailRef.current;
      const n = trail.length;
      if (n < 2) return;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const f = i / n;
        ctx.fillStyle = `rgba(34, 210, 255, ${(f * 0.3).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, BALL_R * (0.2 + 0.6 * f), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawBall = (x: number, y: number) => {
      const { sx, sy } = squashRef.current;
      const { look, fall } = faceRef.current;
      const blink = blinkRef.current;
      // 1 = open, dips to 0 mid-blink
      const open = blink.phase > 0 ? Math.abs(1 - 2 * (blink.phase / 0.16)) : 1;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);

      ctx.shadowColor = BALL_GLOW;
      ctx.shadowBlur = 26;
      const g = ctx.createRadialGradient(
        -BALL_R * 0.35,
        -BALL_R * 0.4,
        BALL_R * 0.15,
        0,
        0,
        BALL_R,
      );
      g.addColorStop(0, "#dafdff");
      g.addColorStop(0.4, "#54f0ff");
      g.addColorStop(1, "#0a9fd8");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // eyes
      const ex = BALL_R * 0.36;
      const ey = -BALL_R * 0.08;
      const eyeR = BALL_R * 0.27;
      const px = look * BALL_R * 0.15;
      const py = fall * BALL_R * 0.17;
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(sgn * ex, ey, eyeR, Math.max(eyeR * open, eyeR * 0.08), 0, 0, Math.PI * 2);
        ctx.fill();
        if (open > 0.25) {
          ctx.fillStyle = "#082638";
          ctx.beginPath();
          ctx.ellipse(
            sgn * ex + px,
            ey + py,
            eyeR * 0.52,
            eyeR * 0.52 * open,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }

      // glossy highlight
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.ellipse(
        -BALL_R * 0.4,
        -BALL_R * 0.5,
        BALL_R * 0.22,
        BALL_R * 0.13,
        -0.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    };

    const drawParticles = () => {
      const parts = particlesRef.current;
      if (!parts.length) return;
      ctx.globalCompositeOperation = "lighter";
      for (const pt of parts) {
        ctx.fillStyle = `rgba(61, 242, 255, ${Math.max(0, pt.life / 0.8).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawPlatform = (p: Platform, score: number) => {
      const hue = (328 + score * 5) % 360;
      const segs: Array<[number, number]> = [];
      let cur = 0;
      for (const g of p.gaps) {
        if (g.l > cur) segs.push([cur, g.l]);
        cur = g.r;
      }
      if (cur < LOGICAL_W) segs.push([cur, LOGICAL_W]);
      for (const [a, b] of segs) {
        ctx.fillStyle = `hsl(${hue} 50% 13%)`;
        ctx.beginPath();
        ctx.roundRect(a, p.y, b - a, PLATFORM_H, 3);
        ctx.fill();
        ctx.strokeStyle = `hsl(${hue} 95% 62%)`;
        ctx.shadowColor = `hsl(${hue} 95% 60%)`;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a + 2, p.y + 1);
        ctx.lineTo(b - 2, p.y + 1);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    const renderTitle = (h: number) => {
      const tb = titleRef.current;
      const cy = h * 0.26;
      const fontStack = "system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.font = `800 64px ${fontStack}`;
      const gapW = 32;
      const d = (tb.y - cy) / 80;
      const spread = 18 * Math.exp(-d * d);

      drawTrail();
      drawBall(LOGICAL_W / 2, tb.y);

      ctx.textBaseline = "middle";
      const grad = ctx.createLinearGradient(40, 0, LOGICAL_W - 40, 0);
      grad.addColorStop(0, "#54f0ff");
      grad.addColorStop(1, NEON_PINK);
      ctx.fillStyle = grad;
      ctx.shadowColor = "#7b6cff";
      ctx.shadowBlur = 26;
      ctx.textAlign = "right";
      ctx.fillText("free", LOGICAL_W / 2 - gapW / 2 - spread, cy);
      ctx.textAlign = "left";
      ctx.fillText("fall", LOGICAL_W / 2 + gapW / 2 + spread, cy);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };

    const renderStarting = (h: number) => {
      const t = spinnerRef.current.t;
      const cx = LOGICAL_W / 2;
      const cy = h * 0.38;
      drawBall(cx, cy);
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.shadowColor = BALL_GLOW;
      ctx.shadowBlur = 12;
      const a0 = t * 4.2;
      ctx.strokeStyle = "rgba(61, 242, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, BALL_R + 15, a0, a0 + Math.PI * 1.2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 45, 149, 0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, BALL_R + 15, a0 + Math.PI, a0 + Math.PI * 1.6);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const render = () => {
      const { dpr, scale, h } = sizeRef.current;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#070811");
      bg.addColorStop(0.6, "#0b0d1f");
      bg.addColorStop(1, "#141031");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, LOGICAL_W, h);
      drawStars(h);

      const m = modeRef.current;
      if (m === "title" || m === "board") {
        renderTitle(h);
        return;
      }
      if (m === "starting") {
        renderStarting(h);
        return;
      }
      const s = stateRef.current;
      if (!s) return;

      ctx.save();
      const sh = shakeRef.current;
      if (sh > 0) {
        ctx.translate((Math.random() - 0.5) * sh * 18, (Math.random() - 0.5) * sh * 18);
      }
      for (const p of s.platforms) drawPlatform(p, s.score);
      drawTrail();
      if (m === "playing") drawBall(s.x, s.y);
      drawParticles();
      ctx.restore();
    };

    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000, 1 / 30);
      last = t;
      update(dt);
      render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [goMode]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (modeRef.current !== "playing") return;
    const s = stateRef.current;
    if (!s) return;
    dragRef.current = { id: e.pointerId, startPx: e.clientX, startBallX: s.x };
    inputRef.current.dragX = s.x;
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const { scale } = sizeRef.current;
    const x = drag.startBallX + ((e.clientX - drag.startPx) / scale) * DRAG_SENSITIVITY;
    inputRef.current.dragX = Math.max(BALL_R, Math.min(LOGICAL_W - BALL_R, x));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current?.id !== e.pointerId) return;
    dragRef.current = null;
    inputRef.current.dragX = null;
  };

  const attestBusy = attest.step === "wallet" || attest.step === "confirming";
  const onchainBest = bestRead.data !== undefined ? bestRead.data.toString() : "—";
  // Base Account first, then EIP-6963 discovered extensions (MetaMask, Rabby, …)
  const walletConnectors = [...connectors].sort(
    (a, b) => (a.id === "baseAccount" ? -1 : 0) - (b.id === "baseAccount" ? -1 : 0),
  );

  return (
    <div
      ref={containerRef}
      className="game-shell"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      <div className="vignette" />

      {(mode === "playing" || mode === "dead") && (
        <div className="hud">
          <div className="hud-score" key={score}>
            {score}
          </div>
        </div>
      )}

      {mode === "title" && (
        <>
          {isConnected && address && (
            <div className="wallet-pill">
              {truncAddr(address)}
              <button className="chip-x" onClick={() => disconnect()}>
                ✕
              </button>
            </div>
          )}
          <div className="menu">
            {!isConnected ? (
              <>
                <button
                  className="btn btn-arcade"
                  onClick={() => {
                    setMenuError(null);
                    setWalletPicker(true);
                  }}
                >
                  insert coin
                </button>
                <div className="menu-note">connect a wallet on Base</div>
              </>
            ) : wrongChain ? (
              <button
                className="btn btn-arcade"
                onClick={() => switchChain({ chainId: base.id })}
                disabled={switchPending}
              >
                {switchPending ? "switching…" : "switch to base"}
              </button>
            ) : (
              <>
                <button className="btn btn-arcade" onClick={requestRanked}>
                  play
                </button>
                <div className="menu-note">drag or ← → to steer</div>
              </>
            )}
            <button className="btn btn-ghost" onClick={openBoard}>
              ★ top 10
            </button>
            {(menuError || connectError) && (
              <div className="error-text">{menuError ?? humanizeError(connectError)}</div>
            )}
          </div>
        </>
      )}

      {mode === "starting" && (
        <div className="starting-label">
          <div className="starting-main">dropping in…</div>
          <div className="overlay-note">confirming startGame() on Base</div>
        </div>
      )}

      {mode === "dead" && (
        <div className="overlay">
          <div className="overlay-panel">
            <div className="overlay-title">game over</div>
            <div className="overlay-score">{score}</div>
            <div className="overlay-sub">onchain best {onchainBest}</div>
            {attest.step === "success" ? (
              <div className="attest-area">
                <div className="attest-done">score attested ✓</div>
                {attest.hash && (
                  <a
                    className="txlink"
                    href={basescanTxUrl(attest.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view on basescan
                  </a>
                )}
              </div>
            ) : hasOpenSession && pendingScore !== null ? (
              <div className="attest-area">
                {attest.step === "error" && <div className="error-text">{attest.message}</div>}
                <button className="btn btn-arcade btn-pink" onClick={attestNow} disabled={attestBusy}>
                  {attest.step === "wallet"
                    ? "confirm in wallet…"
                    : attest.step === "confirming"
                      ? "attesting…"
                      : attest.step === "error"
                        ? "retry attest"
                        : "attest score"}
                </button>
                {attest.step === "confirming" && attest.hash && (
                  <a
                    className="txlink"
                    href={basescanTxUrl(attest.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view tx
                  </a>
                )}
                <div className="overlay-note">unattested scores don&apos;t count</div>
              </div>
            ) : hasOpenSession && score === 0 ? (
              <div className="overlay-note">score 0 can&apos;t be attested</div>
            ) : null}
            <div className="overlay-actions">
              <button className="btn btn-chunky" onClick={retry} disabled={attestBusy}>
                retry
              </button>
              <button className="btn btn-ghost" onClick={openBoard} disabled={attestBusy}>
                top 10
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => goMode("title")}
                disabled={attestBusy}
              >
                menu
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "board" && <Leaderboard onBack={() => goMode(boardFromRef.current)} />}

      {walletPicker && !isConnected && (
        <div className="overlay overlay-modal">
          <div className="overlay-panel wallet-picker">
            <div className="overlay-warn-title">choose wallet</div>
            <div className="wallet-list">
              {walletConnectors.map((c) => (
                <button
                  key={c.uid}
                  className="wallet-option"
                  onClick={() => pickWallet(c)}
                  disabled={!!connectingId}
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" className="wallet-icon" />
                  ) : (
                    <span className="wallet-icon wallet-icon-fallback">{c.name.charAt(0)}</span>
                  )}
                  <span className="wallet-name">
                    {c.name}
                    {c.id === "baseAccount" && <span className="wallet-tag">recommended</span>}
                  </span>
                  {connectingId === c.uid && <span className="wallet-spin">…</span>}
                </button>
              ))}
              {!walletConnectors.length && (
                <div className="overlay-note">
                  no wallets found — install MetaMask, Rabby, or Coinbase Wallet
                </div>
              )}
            </div>
            {menuError && <div className="error-text">{menuError}</div>}
            <button
              className="btn btn-ghost"
              onClick={() => {
                setWalletPicker(false);
                setMenuError(null);
              }}
              disabled={!!connectingId}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {warnModal && (
        <div className="overlay overlay-modal">
          <div className="overlay-panel">
            <div className="overlay-warn-title">heads up</div>
            <div className="overlay-sub">
              your score of {pendingScore ?? 0} hasn&apos;t been attested — it will be lost.
            </div>
            <div className="overlay-actions">
              <button
                className="btn btn-chunky"
                onClick={() => {
                  setWarnModal(false);
                  playRanked();
                }}
              >
                play anyway
              </button>
              <button className="btn btn-ghost" onClick={() => setWarnModal(false)}>
                cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
