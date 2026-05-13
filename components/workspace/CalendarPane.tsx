"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type CalendarTodo } from "@/lib/schema";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const MAX_CHIPS = 2;
const REVIEW_KINDS = new Set(["ブレインダンプ", "週次振り返り", "月次振り返り"]);

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildCalendarWeeks(year: number, month: number) {
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

  const weeks: Array<Array<{ date: Date; isCurrent: boolean }>> = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

const isDone = (t: CalendarTodo) =>
  t.status === "解決済み" || (t.isAction && t.done);

type CalendarScope = "day" | "week" | "month";

type Props = {
  todos: CalendarTodo[];
  selectedDate: string;
  selectedScope: CalendarScope;
  onSelectDate: (date: string) => void;
  onSelectWeek: (weekStart: string) => void;
  onSelectMonth: (monthKey: string) => void;
};

export function CalendarPane({
  todos,
  selectedDate,
  selectedScope,
  onSelectDate,
  onSelectWeek,
  onSelectMonth,
}: Props) {
  const today = toDateStr(new Date());

  const [viewYear, setViewYear] = useState(() => Number(selectedDate.split("-")[0]));
  const [viewMonth, setViewMonth] = useState(() => Number(selectedDate.split("-")[1]) - 1);

  const todosPerDay = useMemo(() => {
    const map: Record<string, CalendarTodo[]> = {};
    for (const t of todos) {
      if (!t.date || REVIEW_KINDS.has(t.kind)) continue;
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    }
    return map;
  }, [todos]);

  const weeks = useMemo(() => buildCalendarWeeks(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const viewMonthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const isMonthSelected = selectedScope === "month" && selectedDate.slice(0, 7) === viewMonthKey;

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={prevMonth} aria-label="前月" className="size-7">
            <ChevronLeft className="size-4" />
          </Button>
          <button
            onClick={() => onSelectMonth(viewMonthKey)}
            className={cn(
              "min-w-[7rem] rounded px-2 py-0.5 text-center text-sm font-medium tabular-nums transition-colors hover:bg-accent",
              isMonthSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {viewYear}年{viewMonth + 1}月
          </button>
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
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-[1.5rem_repeat(7,1fr)] gap-px">
          <div />
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

        {/* 週行 */}
        <div className="flex min-h-0 flex-1 flex-col gap-px">
          {weeks.map((week, weekIdx) => {
            const weekStart = toDateStr(week[0].date);
            const isWeekSelected = selectedScope === "week" && selectedDate === weekStart;

            return (
              <div key={weekIdx} className="grid min-h-0 flex-1 grid-cols-[1.5rem_repeat(7,1fr)] gap-px">
                {/* 週セレクタ */}
                <button
                  onClick={() => onSelectWeek(weekStart)}
                  aria-label="この週を選択"
                  className={cn(
                    "flex items-center justify-center rounded-sm transition-colors hover:bg-accent",
                    isWeekSelected && "bg-primary/10",
                  )}
                >
                  <span className={cn(
                    "h-5 w-1 rounded-full transition-colors",
                    isWeekSelected ? "bg-primary" : "bg-muted-foreground/20",
                  )} />
                </button>

                {/* 日セル */}
                {week.map(({ date, isCurrent }, idx) => {
                  const dateStr = toDateStr(date);
                  const dayTodos = todosPerDay[dateStr] ?? [];
                  const isSelected = selectedScope === "day" && dateStr === selectedDate;
                  const isToday = dateStr === today;
                  const dow = (date.getDay() + 6) % 7;
                  const visibleTodos = dayTodos.slice(0, MAX_CHIPS);
                  const overflowCount = dayTodos.length - MAX_CHIPS;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectDate(dateStr)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 overflow-hidden rounded-md p-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : isToday
                          ? "bg-muted font-semibold"
                          : isWeekSelected
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-accent",
                        !isCurrent && "opacity-35",
                        dow === 5 && !isSelected && "text-primary",
                        dow === 6 && !isSelected && "text-destructive",
                      )}
                    >
                      <span className="w-full text-center tabular-nums leading-none">{date.getDate()}</span>
                      <div className="flex w-full flex-col gap-px">
                        {visibleTodos.map(t => (
                          <span
                            key={t.id}
                            className={cn(
                              "w-full truncate rounded px-0.5 text-[10px] leading-4",
                              isSelected
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : isDone(t)
                                ? "text-muted-foreground line-through"
                                : "bg-primary/15 text-primary",
                            )}
                          >
                            {t.text || "…"}
                          </span>
                        ))}
                        {overflowCount > 0 && (
                          <span
                            className={cn(
                              "px-0.5 text-[10px] leading-4",
                              isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
                            )}
                          >
                            +{overflowCount}件
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
