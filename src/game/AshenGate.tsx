import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Coins,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Skull,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadGameImages } from "./assets";
import { GameAudio } from "./audio";
import { TOWERS, TOWER_ORDER, type TowerId } from "./config";
import { AshenEngine, type HudSnapshot, type Phase } from "./engine";

const INITIAL: HudSnapshot = {
  phase: "menu",
  gold: 0,
  lives: 0,
  wave: 0,
  waveName: "",
  waveCount: 10,
  remaining: 0,
  paused: false,
  muted: false,
  selectedType: null,
  selectedTower: null,
};

export function AshenGate() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<AshenEngine | null>(null);
  const audioRef = useRef(new GameAudio());
  const [hud, setHud] = useState<HudSnapshot>(INITIAL);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onHud = useCallback((s: HudSnapshot) => setHud(s), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let engine: AshenEngine | null = null;

    void (async () => {
      try {
        const images = await loadGameImages();
        if (cancelled) return;
        engine = new AshenEngine(canvas, images, audioRef.current, { onHud });
        engineRef.current = engine;
        engine.start();
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();

    const onVis = () => {
      if (document.visibilityState === "visible") audioRef.current.resume();
    };
    document.addEventListener("visibilitychange", onVis);

    const ro = new ResizeObserver(() => engineRef.current?.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      engine?.destroy();
      engineRef.current = null;
    };
  }, [onHud]);

  const unlock = () => audioRef.current.unlock();

  const begin = () => {
    unlock();
    engineRef.current?.beginSiege();
  };

  const callWave = () => {
    unlock();
    engineRef.current?.callWave();
  };

  const pick = (id: TowerId) => {
    unlock();
    const cur = engineRef.current;
    if (!cur) return;
    cur.selectType(cur.snapshot().selectedType === id ? null : id);
  };

  const playing = hud.phase === "prep" || hud.phase === "combat";

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-bg text-fg">
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full touch-none"
          style={{ touchAction: "none" }}
        />
        {playing && <Hud hud={hud} />}
        {playing && hud.selectedTower && (
          <TowerPanel
            hud={hud}
            onUpgrade={(k) => engineRef.current?.upgrade(k)}
            onSell={() => engineRef.current?.sellSelected()}
            onTarget={() => engineRef.current?.cycleTargeting()}
            onClose={() => engineRef.current?.selectType(null)}
          />
        )}
        {hud.paused && playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/40">
            <p className="font-display text-3xl tracking-tight text-fg">Paused</p>
          </div>
        )}
      </div>

      {playing && (
        <Dock
          hud={hud}
          onPick={pick}
          onWave={callWave}
          onPause={() => engineRef.current?.togglePause()}
          onMute={() => engineRef.current?.setMuted(!hud.muted)}
        />
      )}

      {hud.phase === "menu" && (
        <TitleScreen
          ready={ready}
          loadError={loadError}
          onBegin={begin}
        />
      )}

      {(hud.phase === "victory" || hud.phase === "defeat") && (
        <EndScreen
          phase={hud.phase}
          wave={hud.wave}
          onRestart={() => {
            unlock();
            engineRef.current?.restart();
          }}
          onMenu={() => engineRef.current?.toMenu()}
        />
      )}
    </div>
  );
}

function TitleScreen({
  ready,
  loadError,
  onBegin,
}: {
  ready: boolean;
  loadError: string | null;
  onBegin: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-end bg-gradient-to-t from-bg/90 via-bg/35 to-bg/15 px-5 pb-10 pt-16 sm:justify-center sm:pb-0">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
        <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">
          Last watch
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
          Ashen Gate
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          The road into the keep is the last one still open. Plant ballistae,
          mortars, and rime spires along the verge. Spend gold from every kill.
          Do not let the column through.
        </p>
        <ul className="mt-5 space-y-1.5 text-sm text-muted">
          <li>Tap a tower, then a grass cell to place it.</li>
          <li>Upgrade damage or fire rate between waves.</li>
          <li>Survive ten waves. Leaks cost lives.</li>
        </ul>
        {loadError ? (
          <p className="mt-5 text-sm text-danger">{loadError}</p>
        ) : (
          <Button
            className="mt-6 w-full"
            size="lg"
            disabled={!ready}
            onClick={onBegin}
          >
            {ready ? "Hold the gate" : "Loading the field"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Hud({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">
        <Chip icon={<Heart className="size-3.5" />} label="Lives" value={hud.lives} warn={hud.lives <= 5} />
        <Chip icon={<Coins className="size-3.5" />} label="Gold" value={hud.gold} gold />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Chip
          icon={<Waves className="size-3.5" />}
          label={hud.phase === "combat" ? hud.waveName : "Next"}
          value={`${Math.max(1, hud.wave)}${hud.phase === "prep" && hud.wave === 0 ? "" : ""} / ${hud.waveCount}`}
        />
        {hud.phase === "combat" && (
          <Chip icon={<Skull className="size-3.5" />} label="Left" value={hud.remaining} />
        )}
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  value,
  warn,
  gold,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  warn?: boolean;
  gold?: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-bg/80 px-3 py-2 backdrop-blur-sm",
        warn && "border-danger/40 text-danger",
      )}
    >
      <span className={cn("text-muted", warn && "text-danger", gold && "text-gold")}>
        {icon}
      </span>
      <div className="leading-none">
        <p className="text-[10px] font-medium tracking-wide text-muted uppercase">
          {label}
        </p>
        <p className="mt-0.5 font-mono text-sm tabular-nums text-fg">{value}</p>
      </div>
    </div>
  );
}

function Dock({
  hud,
  onPick,
  onWave,
  onPause,
  onMute,
}: {
  hud: HudSnapshot;
  onPick: (id: TowerId) => void;
  onWave: () => void;
  onPause: () => void;
  onMute: () => void;
}) {
  return (
    <footer className="z-10 border-t border-border bg-surface/95 px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
          {TOWER_ORDER.map((id, i) => {
            const def = TOWERS[id];
            const selected = hud.selectedType === id;
            const broke = hud.gold < def.cost;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className={cn(
                  "flex min-w-[148px] flex-1 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-150",
                  selected
                    ? "border-accent bg-surface-2"
                    : "border-border bg-bg hover:border-border-strong",
                  broke && "opacity-50",
                )}
              >
                <img
                  src={`/game/towers/${id}.png`}
                  alt=""
                  className="size-11 shrink-0 object-contain"
                />
                <span className="min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-fg">
                      {def.name}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-gold">
                      {def.cost}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {def.blurb}
                  </span>
                  <span className="mt-1 block text-[10px] tracking-wide text-subtle uppercase">
                    {i + 1}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-11 w-11 p-0"
            onClick={onMute}
            aria-label={hud.muted ? "Unmute" : "Mute"}
          >
            {hud.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-11 w-11 p-0"
            onClick={onPause}
            aria-label={hud.paused ? "Resume" : "Pause"}
          >
            {hud.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </Button>
          <Button
            className="h-11 min-w-[9.5rem] flex-1 sm:flex-none"
            disabled={hud.phase !== "prep"}
            onClick={onWave}
          >
            {hud.phase === "combat"
              ? "Wave in motion"
              : hud.wave === 0
                ? "Call first wave"
                : `Call wave ${hud.wave + 1}`}
          </Button>
        </div>
      </div>
    </footer>
  );
}

function TowerPanel({
  hud,
  onUpgrade,
  onSell,
  onTarget,
  onClose,
}: {
  hud: HudSnapshot;
  onUpgrade: (k: "damage" | "rate") => void;
  onSell: () => void;
  onTarget: () => void;
  onClose: () => void;
}) {
  const t = hud.selectedTower;
  if (!t) return null;
  const targeting =
    t.targeting === "first"
      ? "First on the road"
      : t.targeting === "strong"
        ? "Highest health"
        : "Closest";
  return (
    <aside className="absolute bottom-3 left-3 right-3 z-10 sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-80">
      <div className="rounded-lg border border-border bg-bg/90 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.4)] backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight text-fg">
              {t.name}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Damage {t.damage} · {t.fireRate.toFixed(2)} /s · range {Math.round(t.range)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted hover:text-fg"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          <UpgradeRow
            label="Damage"
            level={t.dmgLevel}
            cost={t.dmgCost}
            gold={hud.gold}
            onClick={() => onUpgrade("damage")}
          />
          <UpgradeRow
            label="Fire rate"
            level={t.rateLevel}
            cost={t.rateCost}
            gold={hud.gold}
            onClick={() => onUpgrade("rate")}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onTarget}>
            {targeting}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSell}>
            Sell {t.sellValue}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function UpgradeRow({
  label,
  level,
  cost,
  gold,
  onClick,
}: {
  label: string;
  level: number;
  cost: number | null;
  gold: number;
  onClick: () => void;
}) {
  const maxed = cost === null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-3 py-2">
      <div>
        <p className="text-sm text-fg">{label}</p>
        <p className="text-[11px] text-muted">{maxed ? "Maxed" : `Rank ${level} / 3`}</p>
      </div>
      <Button
        size="sm"
        variant={maxed ? "ghost" : "secondary"}
        disabled={maxed || gold < (cost ?? 0)}
        onClick={onClick}
      >
        {maxed ? "Max" : `Upgrade ${cost}`}
      </Button>
    </div>
  );
}

function EndScreen({
  phase,
  wave,
  onRestart,
  onMenu,
}: {
  phase: Phase;
  wave: number;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const won = phase === "victory";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-5">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center sm:p-8">
        <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">
          {won ? "The road holds" : "The gate falls"}
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {won ? "Victory" : "Defeat"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {won
            ? "Ten waves broke on the verge. The keep still stands."
            : `The column reached the keep on wave ${wave}. Rebuild the line.`}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={onRestart}>
            <RotateCcw className="size-4" />
            Play again
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onMenu}>
            Return
          </Button>
        </div>
      </div>
    </div>
  );
}
