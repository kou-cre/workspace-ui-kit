"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  type CalendarTodo,
  DEFAULT_WORK_START_TIME,
  TIMELINE_SNAP_MINUTES,
} from "@/lib/schema";
import {
  computeTimeline,
  formatHHMM,
  parseHHMM,
  snapTo15Minutes,
  sumDuration,
  type TimelineEntry,
} from "@/lib/computed/timeline";
import { cn } from "@/lib/utils";

/** 1分あたりのピクセル数。60px=1時間 → 1日=1440px。 */
const PIXELS_PER_MINUTE = 1;

/** 左の時刻ラベル列の幅（px）。 */
const TIME_GUTTER_PX = 56;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const isDone = (t: CalendarTodo) =>
  t.status === "解決済み" || (t.isAction && t.done);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

type Props = {
  date: string;
  todos: CalendarTodo[];
  selectedNoteId: string | null;
  workStartTime: string;
  onWorkStartTimeChange: (time: string) => void;
  onSelectNote: (noteId: string, projectId: string) => void;
  onToggle: (noteId: string, projectId: string) => void;
  /** リサイズ・移動確定時。time=null なら time は変更しない（下端=duration のみ）。 */
  onResize: (noteId: string, projectId: string, time: string | null, duration: number) => void;
};

export function DayTimelinePane({
  date,
  todos,
  selectedNoteId,
  workStartTime,
  onWorkStartTimeChange,
  onSelectNote,
  onToggle,
  onResize,
}: Props) {
  // 現在時刻を 1 分ごとに更新
  const [now, setNow] = useState<number>(() => nowMinutes());
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isToday = date === todayISO();
  const currentMin = isToday ? now : null;

  const entries: TimelineEntry[] = useMemo(
    () =>
      computeTimeline(
        currentMin,
        todos.map((t) => ({
          id: t.id,
          title: t.title,
          duration: t.duration,
          order: t.order ?? 0,
          time: t.time,
          projectId: t.projectId,
        })),
      ),
    [currentMin, todos],
  );

  const total = sumDuration(
    todos
      .filter((t) => parseHHMM(t.time) !== null)
      .map((t) => ({
        id: t.id,
        title: t.title,
        duration: t.duration,
        order: 0,
        time: t.time,
        projectId: t.projectId,
      })),
  );

  // 初期スクロール位置: 今日なら現在時刻、別日なら始業時刻の少し上
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current) return;
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    const targetMin =
      currentMin !== null
        ? currentMin
        : (parseHHMM(workStartTime) ?? 9 * 60);
    viewport.scrollTop = Math.max(0, targetMin * PIXELS_PER_MINUTE - 120);
    scrolledRef.current = true;
  }, [currentMin, workStartTime]);

  // 全体 droppable（未割当からのドロップ用）
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: "timeline-zone",
    data: {
      type: "timeline-zone",
      getDropMinutes: () => containerRef.current?.dataset.lastDropMin,
    },
  });

  // ドロップ位置の Y → 分の変換
  // useDroppable は座標を渡してこないので、pointermove で記録しておく
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const min = snapTo15Minutes(y / PIXELS_PER_MINUTE);
      const clamped = Math.max(0, Math.min(24 * 60 - 15, min));
      container.dataset.lastDropMin = String(clamped);
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, []);

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <p className="font-medium">タイムライン</p>
          {total > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              合計 {Math.floor(total / 60)}h {total % 60}m
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground" />
          <Input
            type="time"
            value={workStartTime}
            onChange={(e) => onWorkStartTimeChange(e.target.value || DEFAULT_WORK_START_TIME)}
            className="h-7 w-24 text-xs"
            aria-label="始業時刻"
          />
        </div>
      </div>

      <div ref={scrollViewportRef} className="flex-1 min-h-0 overflow-auto">
        <div
          ref={(node) => {
            setDroppableRef(node);
            containerRef.current = node;
          }}
          className={cn(
            "relative",
            isOver && "bg-primary/5",
          )}
          style={{ height: 24 * 60 * PIXELS_PER_MINUTE }}
        >
          {/* 時刻軸の水平線とラベル */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute inset-x-0 border-t border-border/40"
              style={{ top: h * 60 * PIXELS_PER_MINUTE }}
            >
              <span
                className="absolute -top-2 left-1 bg-canvas px-1 text-[10px] tabular-nums text-muted-foreground"
              >
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}

          {/* タスクブロック */}
          {entries.map((entry) => {
            const todo = todos.find((t) => t.id === entry.task.id);
            if (!todo) return null;
            return (
              <TimelineBlock
                key={entry.task.id}
                entry={entry}
                todo={todo}
                isSelected={selectedNoteId === entry.task.id}
                onToggle={() => onToggle(todo.id, todo.projectId)}
                onSelect={() => onSelectNote(todo.id, todo.projectId)}
                onResize={(time, duration) =>
                  onResize(todo.id, todo.projectId, time, duration)
                }
              />
            );
          })}

          {/* 現在時刻バー */}
          {currentMin !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: currentMin * PIXELS_PER_MINUTE }}
              aria-label="現在時刻"
            >
              <span className="ml-1 inline-block rounded bg-destructive px-1 text-[10px] font-medium tabular-nums text-destructive-foreground">
                {formatHHMM(currentMin)}
              </span>
              <div className="h-px flex-1 bg-destructive" />
            </div>
          )}

          {todos.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 px-6 text-center">
              <p className="text-sm text-muted-foreground">タイムラインは空です</p>
              <p className="text-xs text-muted-foreground">
                左から未割当タスクをドラッグするか、タスク詳細で所要時間と時刻を設定してください
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineBlock({
  entry,
  todo,
  isSelected,
  onToggle,
  onSelect,
  onResize,
}: {
  entry: TimelineEntry;
  todo: CalendarTodo;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onResize: (time: string | null, duration: number) => void;
}) {
  const done = isDone(todo);

  /** リサイズ・移動中の楽観表示。 */
  const [drag, setDrag] = useState<{
    startMin: number;
    duration: number;
    kind: "move" | "top" | "bottom";
  } | null>(null);

  const startMin = drag ? drag.startMin : entry.startMin;
  const duration = drag ? drag.duration : Math.max(TIMELINE_SNAP_MINUTES, todo.duration);
  const endMin = startMin + duration;

  const beginPointerOp = (kind: "move" | "top" | "bottom") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const initialStartMin = entry.startMin;
    const initialDuration = Math.max(TIMELINE_SNAP_MINUTES, todo.duration);

    const onMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - startY;
      const deltaMin = snapTo15Minutes(deltaY / PIXELS_PER_MINUTE);
      if (kind === "move") {
        const newStart = Math.max(0, Math.min(24 * 60 - initialDuration, initialStartMin + deltaMin));
        setDrag({ startMin: newStart, duration: initialDuration, kind });
      } else if (kind === "top") {
        // 上端: 開始時刻を変える（duration は維持）
        const newStart = Math.max(0, initialStartMin + deltaMin);
        setDrag({ startMin: newStart, duration: initialDuration, kind });
      } else {
        const newDuration = Math.max(TIMELINE_SNAP_MINUTES, initialDuration + deltaMin);
        setDrag({ startMin: initialStartMin, duration: newDuration, kind });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDrag((curr) => {
        if (curr) {
          if (curr.kind === "bottom") {
            onResize(null, curr.duration);
          } else {
            // move / top どちらも time を書き換える
            onResize(formatHHMM(curr.startMin), curr.duration);
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // 横並びレイアウト: TIME_GUTTER_PX を差し引いた領域を laneCount で等分
  const laneWidthPct = 100 / entry.laneCount;
  const laneLeftPct = entry.lane * laneWidthPct;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (!drag) onSelect();
        e.stopPropagation();
      }}
      onPointerDown={beginPointerOp("move")}
      className={cn(
        "absolute z-10 flex cursor-grab flex-col gap-0.5 overflow-hidden rounded-md border border-border bg-card px-2 py-1 text-left transition-colors hover:border-primary/40 active:cursor-grabbing",
        isSelected && "ring-2 ring-primary",
        entry.beforeNow && "opacity-60",
        done && "opacity-60",
        drag && "z-30 cursor-grabbing shadow-lg ring-1 ring-primary/40",
      )}
      style={{
        top: startMin * PIXELS_PER_MINUTE,
        height: Math.max(20, duration * PIXELS_PER_MINUTE - 1),
        left: `calc(${TIME_GUTTER_PX}px + (100% - ${TIME_GUTTER_PX}px) * ${laneLeftPct / 100})`,
        width: `calc((100% - ${TIME_GUTTER_PX}px) * ${laneWidthPct / 100} - 2px)`,
      }}
    >
      {/* 上端リサイズハンドル */}
      <div
        onPointerDown={beginPointerOp("top")}
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize touch-none rounded-t-md hover:bg-primary/30"
        aria-label="開始時刻をドラッグして変更"
      />

      <div className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
        <span>{formatHHMM(startMin)}</span>
        <span>–</span>
        <span>{formatHHMM(endMin)}</span>
        {entry.overflow && !drag && (
          <AlertTriangle className="size-3 text-destructive" aria-label="24:00 を超過" />
        )}
      </div>

      <div className="flex min-w-0 items-start gap-1.5">
        <Checkbox
          checked={done}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-0.5 size-3.5 shrink-0"
        />
        <span
          className={cn(
            "min-w-0 truncate text-xs leading-tight",
            done && "line-through",
          )}
        >
          {todo.title || todo.text || "未記入"}
        </span>
      </div>

      {duration >= 45 && (
        <Badge variant="secondary" size="xs" className="self-start">
          {duration}分
        </Badge>
      )}

      {/* 下端リサイズハンドル */}
      <div
        onPointerDown={beginPointerOp("bottom")}
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize touch-none rounded-b-md hover:bg-primary/30"
        aria-label="所要時間をドラッグして変更"
      />
    </div>
  );
}
