"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { type CalendarTodo, type GoogleCalendarEvent } from "@/lib/schema";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const MAX_VISIBLE = 3;

const CHIP_COLORS = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
];

function getChipColor(projectId: string): string {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) & 0xff;
  return CHIP_COLORS[h % CHIP_COLORS.length];
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon=0

  const days: Array<{ date: Date; isCurrent: boolean }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ date: new Date(year, month, 1 - firstDayOfWeek + i), isCurrent: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrent: true });
  }
  const remainder = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remainder; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrent: false });
  }
  return days;
}

const isDone = (t: CalendarTodo) =>
  t.status === "解決済み" || (t.isAction && t.done);

// ===== DraggableTodoChip =====

function DraggableTodoChip({
  todo,
  isSelected,
}: {
  todo: CalendarTodo;
  isSelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-todo-${todo.id}`,
    data: { type: "calendar-todo", todo },
  });
  const done = isDone(todo);
  const chipColor = getChipColor(todo.projectId);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "w-full truncate rounded px-1 py-px leading-tight",
        "cursor-grab active:cursor-grabbing touch-none select-none",
        isDragging && "opacity-20",
        isSelected
          ? done
            ? "bg-primary-foreground/15 text-primary-foreground/50 line-through"
            : "bg-primary-foreground/20 text-primary-foreground"
          : done
          ? "bg-muted-foreground/10 text-muted-foreground line-through"
          : chipColor,
      )}
    >
      {todo.title || todo.text || "(無題)"}
    </div>
  );
}

// ===== GoogleEventChip =====

function GoogleEventChip({ title, isSelected }: { title: string; isSelected: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-0.5 truncate rounded px-1 py-px leading-tight text-xs",
        isSelected
          ? "bg-primary-foreground/20 text-primary-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      <CalendarDays className="size-2.5 shrink-0" />
      <span className="truncate">{title}</span>
    </div>
  );
}

// ===== DroppableDayCell =====

function DroppableDayCell({
  dateStr,
  isSelected,
  isToday,
  isCurrent,
  dow,
  date,
  dayTodos,
  googleDayEvents,
  onSelectDate,
}: {
  dateStr: string;
  isSelected: boolean;
  isToday: boolean;
  isCurrent: boolean;
  dow: number;
  date: Date;
  dayTodos: CalendarTodo[];
  googleDayEvents: GoogleCalendarEvent[];
  onSelectDate: (d: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cal-day-${dateStr}`,
    data: { type: "calendar-day", dateStr },
  });

  const allItems = [...googleDayEvents.map((e) => ({ kind: "google" as const, event: e })), ...dayTodos.map((t) => ({ kind: "todo" as const, todo: t }))];
  const visible = allItems.slice(0, MAX_VISIBLE);
  const overflow = allItems.length - MAX_VISIBLE;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelectDate(dateStr)}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md p-1 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "bg-primary text-primary-foreground"
          : isToday
          ? "bg-muted"
          : "hover:bg-accent",
        !isCurrent && "opacity-35",
        isOver && !isSelected && "ring-2 ring-inset ring-primary bg-primary/5",
      )}
    >
      {/* 日付数字 */}
      <span
        className={cn(
          "mb-0.5 w-full text-right tabular-nums leading-none",
          isToday && !isSelected && "font-semibold",
          dow === 5 && !isSelected && "text-primary",
          dow === 6 && !isSelected && "text-destructive",
        )}
      >
        {date.getDate()}
      </span>

      {/* チップ（Google Calendar + ワークスペース Todo） */}
      <div className="flex min-h-0 flex-col gap-px overflow-hidden">
        {visible.map((item) =>
          item.kind === "google" ? (
            <GoogleEventChip key={`g-${item.event.id}`} title={item.event.title} isSelected={isSelected} />
          ) : (
            <DraggableTodoChip key={item.todo.id} todo={item.todo} isSelected={isSelected} />
          ),
        )}
        {overflow > 0 && (
          <span
            className={cn(
              "px-1 leading-tight",
              isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
    </button>
  );
}

// ===== CalendarPane =====

type Props = {
  todos: CalendarTodo[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  activeTab?: "calendar" | "summary";
  onTabChange?: (tab: "calendar" | "summary") => void;
  googleEvents?: GoogleCalendarEvent[];
};

export function CalendarPane({
  todos,
  selectedDate,
  onSelectDate,
  activeTab,
  onTabChange,
  googleEvents = [],
}: Props) {
  const today = toDateStr(new Date());
  const [viewYear, setViewYear] = useState(() => Number(selectedDate.split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => Number(selectedDate.split("-")[1]) - 1);

  const todosByDate = useMemo(() => {
    const map: Record<string, CalendarTodo[]> = {};
    for (const t of todos) {
      if (!t.date) continue;
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    }
    for (const dateStr in map) {
      map[dateStr].sort((a, b) => (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0));
    }
    return map;
  }, [todos]);

  const googleEventsByDate = useMemo(() => {
    const map: Record<string, GoogleCalendarEvent[]> = {};
    for (const e of googleEvents) {
      if (!e.start) continue;
      if (!map[e.start]) map[e.start] = [];
      map[e.start].push(e);
    }
    return map;
  }, [googleEvents]);

  const days = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        {onTabChange && (
          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => onTabChange("calendar")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === "calendar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              カレンダー
            </button>
            <button
              type="button"
              onClick={() => onTabChange("summary")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === "summary"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              プロジェクトサマリー
            </button>
          </div>
        )}
        <div className="flex flex-1 items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={prevMonth} aria-label="前月" className="size-7">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-sm font-medium tabular-nums">
            {viewYear}年{viewMonth + 1}月
          </span>
          <Button variant="ghost" size="icon-sm" onClick={nextMonth} aria-label="次月" className="size-7">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectDate(today)}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          今日
        </Button>
      </div>

      {/* カレンダーグリッド（DndContext は Workspace 側で包む） */}
      <div className="flex min-h-0 flex-1 flex-col gap-px p-2">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "flex items-center justify-center py-1 text-xs font-medium",
                i === 5 && "text-primary",
                i === 6 && "text-destructive",
                i !== 5 && i !== 6 && "text-muted-foreground",
              )}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 日セル */}
        <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-px">
          {days.map(({ date, isCurrent }, idx) => {
            const dateStr = toDateStr(date);
            const dayTodos = todosByDate[dateStr] ?? [];
            const googleDayEvents = googleEventsByDate[dateStr] ?? [];
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === today;
            const dow = (date.getDay() + 6) % 7;

            return (
              <DroppableDayCell
                key={idx}
                dateStr={dateStr}
                isSelected={isSelected}
                isToday={isToday}
                isCurrent={isCurrent}
                dow={dow}
                date={date}
                dayTodos={dayTodos}
                googleDayEvents={googleDayEvents}
                onSelectDate={onSelectDate}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
