"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, GripVertical } from "lucide-react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type CalendarTodo,
  DEFAULT_WORK_START_TIME,
  TIMELINE_SNAP_MINUTES,
} from "@/lib/schema";
import {
  computeTimeline,
  formatHHMM,
  snapTo15Minutes,
  sumDuration,
  type TimelineEntry,
} from "@/lib/computed/timeline";
import { cn } from "@/lib/utils";

/** リサイズの感度（1分あたりのピクセル数）。15分=15px の移動で 1段階変化。 */
const PIXELS_PER_MINUTE = 1;

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
  /** リサイズ確定時に呼ばれる。time=null なら time は変更しない（下端=duration のみ）。 */
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
  // 現在時刻を 1 分ごとに更新（今日が選択されている時のみ意味を持つ）
  const [now, setNow] = useState<number>(() => nowMinutes());
  useEffect(() => {
    const tick = () => setNow(nowMinutes());
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isToday = date === todayISO();
  const currentMin = isToday ? now : null;

  const entries: TimelineEntry[] = useMemo(
    () =>
      computeTimeline(
        workStartTime,
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
    [workStartTime, currentMin, todos],
  );

  const total = sumDuration(
    todos.map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      order: 0,
      time: t.time,
      projectId: t.projectId,
    })),
  );

  const sortableIds = todos.map((t) => `timeline-${t.id}`);

  const { setNodeRef, isOver } = useDroppable({
    id: "timeline-zone",
    data: { type: "timeline-zone" },
  });

  // 現在時刻バーを描く位置（todos のうち、startMin >= currentMin の最初のエントリの直前）
  const nowLineIndex = (() => {
    if (currentMin === null) return -1;
    return entries.findIndex((e) => e.startMin >= currentMin);
  })();

  const todosById = useMemo(() => {
    const m = new Map<string, CalendarTodo>();
    for (const t of todos) m.set(t.id, t);
    return m;
  }, [todos]);

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

      <ScrollArea className="flex-1 min-h-0">
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-full flex-col gap-1.5 p-3",
            isOver && "bg-primary/5 ring-1 ring-inset ring-primary/30",
          )}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {entries.map((entry, idx) => {
              const todo = todosById.get(entry.task.id);
              if (!todo) return null;
              return (
                <Fragment key={entry.task.id}>
                  {currentMin !== null && idx === nowLineIndex && (
                    <NowLine label={formatHHMM(currentMin)} />
                  )}
                  <TimelineBlock
                    entry={entry}
                    todo={todo}
                    isSelected={selectedNoteId === entry.task.id}
                    onToggle={() => onToggle(todo.id, todo.projectId)}
                    onSelect={() => onSelectNote(todo.id, todo.projectId)}
                    onResize={(time, duration) =>
                      onResize(todo.id, todo.projectId, time, duration)
                    }
                  />
                </Fragment>
              );
            })}
            {/* 全タスクが現在時刻より前なら、末尾に現在時刻バーを表示 */}
            {currentMin !== null && nowLineIndex === -1 && entries.length > 0 && (
              <NowLine label={formatHHMM(currentMin)} />
            )}
          </SortableContext>

          {todos.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">タイムラインは空です</p>
              <p className="px-6 text-xs text-muted-foreground">
                左から未割当タスクをドラッグするか、タスク詳細で所要時間を設定してください
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function NowLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1" aria-label="現在時刻">
      <div className="h-px flex-1 bg-destructive" />
      <span className="text-xs font-medium text-destructive tabular-nums">
        {label} 現在
      </span>
      <div className="h-px flex-1 bg-destructive" />
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `timeline-${todo.id}`,
    data: {
      type: "timeline-task",
      noteId: todo.id,
      projectId: todo.projectId,
      label: todo.title || todo.text,
    },
  });
  const done = isDone(todo);

  // リサイズ中の楽観表示
  const [resizing, setResizing] = useState<{
    startTimeMin: number;
    duration: number;
  } | null>(null);

  const displayStart = resizing
    ? formatHHMM(resizing.startTimeMin)
    : entry.startTime;
  const displayEnd = resizing
    ? formatHHMM(resizing.startTimeMin + resizing.duration)
    : entry.endTime;
  const displayDuration = resizing ? resizing.duration : todo.duration;

  const beginResize = (edge: "top" | "bottom") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const initialStartMin = entry.startMin;
    const initialDuration = Math.max(TIMELINE_SNAP_MINUTES, todo.duration);

    const onMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - startY;
      const deltaMin = snapTo15Minutes(deltaY / PIXELS_PER_MINUTE);
      if (edge === "top") {
        // 上端: 開始時刻を変更（duration は逆方向に調整して終了時刻維持しない、
        // 仕様: 上をドラッグで開始時刻を移動して空き時間を作れる）
        // ここでは「開始時刻を変える、duration は維持」とする
        const newStart = Math.max(0, initialStartMin + deltaMin);
        setResizing({ startTimeMin: newStart, duration: initialDuration });
      } else {
        const newDuration = Math.max(TIMELINE_SNAP_MINUTES, initialDuration + deltaMin);
        setResizing({ startTimeMin: initialStartMin, duration: newDuration });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing((curr) => {
        if (curr) {
          if (edge === "top") {
            // 上端確定: time を上書き、duration はそのまま
            onResize(formatHHMM(curr.startTimeMin), curr.duration);
          } else {
            // 下端確定: duration のみ
            onResize(null, curr.duration);
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
        ),
        transition,
      }}
      className={cn(
        "relative flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors",
        isSelected && "ring-2 ring-primary",
        isDragging && "opacity-30",
        entry.beforeNow && "opacity-60",
        done && "opacity-60",
        resizing && "ring-1 ring-primary/40",
      )}
    >
      {/* 上端リサイズハンドル */}
      <button
        type="button"
        onPointerDown={beginResize("top")}
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize touch-none rounded-t-md hover:bg-primary/30"
        aria-label="開始時刻をドラッグして変更"
        tabIndex={-1}
      />

      <button
        type="button"
        {...listeners}
        {...attributes}
        className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="ドラッグして並び替え"
        tabIndex={-1}
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox checked={done} onCheckedChange={onToggle} className="mt-0.5 shrink-0" />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <div className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <span>{displayStart}</span>
          <span>–</span>
          <span>{displayEnd}</span>
          {entry.overflow && !resizing && (
            <AlertTriangle className="size-3 text-destructive" aria-label="24:00 を超過" />
          )}
        </div>
        <span
          className={cn(
            "text-sm leading-snug",
            done && "line-through",
          )}
        >
          {todo.title || todo.text || "未記入"}
        </span>
        <Badge variant="secondary" size="xs">
          {displayDuration}分
        </Badge>
      </button>

      {/* 下端リサイズハンドル */}
      <button
        type="button"
        onPointerDown={beginResize("bottom")}
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize touch-none rounded-b-md hover:bg-primary/30"
        aria-label="所要時間をドラッグして変更"
        tabIndex={-1}
      />
    </div>
  );
}
