"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type CalendarTodo } from "@/lib/schema";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

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

type Props = {
  todos: CalendarTodo[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
};

export function CalendarPane({ todos, selectedDate, onSelectDate }: Props) {
  const today = toDateStr(new Date());

  const [viewYear, setViewYear] = useState(() => Number(selectedDate.split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => Number(selectedDate.split("-")[1]) - 1);

  const todoCounts = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const t of todos) {
      if (!t.date) continue;
      if (!map[t.date]) map[t.date] = { total: 0, done: 0 };
      map[t.date].total++;
      if (isDone(t)) map[t.date].done++;
    }
    return map;
  }, [todos]);

  const days = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-1">
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

      {/* カレンダーグリッド */}
      <div className="flex min-h-0 flex-1 flex-col p-3 gap-1">
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
            const counts = todoCounts[dateStr];
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === today;
            const dow = (date.getDay() + 6) % 7; // Mon=0, Sun=6

            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                className={cn(
                  "flex flex-col items-center justify-start gap-0.5 rounded-md pt-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                    ? "bg-muted font-semibold"
                    : "hover:bg-accent",
                  !isCurrent && "opacity-35",
                  dow === 5 && !isSelected && "text-primary",
                  dow === 6 && !isSelected && "text-destructive",
                )}
              >
                <span className="tabular-nums leading-none">{date.getDate()}</span>
                {counts && counts.total > 0 && (
                  <span
                    className={cn(
                      "h-1 w-4 rounded-full",
                      isSelected
                        ? "bg-primary-foreground/60"
                        : counts.done === counts.total
                        ? "bg-muted-foreground/30"
                        : "bg-primary",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
