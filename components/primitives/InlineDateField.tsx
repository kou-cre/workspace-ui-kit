"use client";

import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatISODate, parseISODate } from "@/lib/computed/profile";
import { cn } from "@/lib/utils";

export type InlineDateFieldProps = {
  value: string;
  onSave: (v: string) => void;
  ariaLabel: string;
  endValue?: string;
  onSaveEnd?: (v: string) => void;
  timeValue?: string;
  onSaveTime?: (v: string) => void;
};

export function InlineDateField({
  value,
  onSave,
  ariaLabel,
  endValue,
  onSaveEnd,
  timeValue,
  onSaveTime,
}: InlineDateFieldProps) {
  const [open, setOpen] = useState(false);
  const [showEndDate, setShowEndDate] = useState(Boolean(endValue));
  const [showTime, setShowTime] = useState(Boolean(timeValue));
  const [localEndDate, setLocalEndDate] = useState(endValue ?? "");
  const [localTime, setLocalTime] = useState(timeValue ?? "");

  const startDate = parseISODate(value);
  const endDateParsed = parseISODate(localEndDate);

  const supportsEndDate = onSaveEnd !== undefined;
  const supportsTime = onSaveTime !== undefined;

  const handleClear = () => {
    onSave("");
    onSaveEnd?.("");
    onSaveTime?.("");
    setLocalEndDate("");
    setLocalTime("");
    setShowEndDate(false);
    setShowTime(false);
    setOpen(false);
  };

  const handleToggleEndDate = () => {
    const next = !showEndDate;
    setShowEndDate(next);
    if (!next) {
      setLocalEndDate("");
      onSaveEnd?.("");
    }
  };

  const handleToggleTime = () => {
    const next = !showTime;
    setShowTime(next);
    if (!next) {
      setLocalTime("");
      onSaveTime?.("");
    }
  };

  const displayText = (): string | null => {
    if (!value) return null;
    let start = value;
    if (showTime && localTime) start = `${value} ${localTime}`;
    if (showEndDate && localEndDate) return `${start} → ${localEndDate}`;
    return start;
  };

  const rangeSelected: DateRange = { from: startDate, to: endDateParsed };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className="flex h-8 w-full items-center justify-start gap-2 rounded-lg border border-input bg-card px-2.5 py-1 text-left text-sm transition-colors outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:border-ring data-popup-open:ring-3 data-popup-open:ring-ring/50"
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", value ? "text-foreground" : "text-muted-foreground")}>
          {displayText() ?? "日付を選択"}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        {showEndDate ? (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Calendar
            mode={"range" as any}
            selected={rangeSelected as any}
            onSelect={(range: unknown) => {
              const r = range as DateRange | undefined;
              const start = formatISODate(r?.from);
              const end = formatISODate(r?.to);
              if (start !== value) onSave(start);
              setLocalEndDate(end);
              onSaveEnd?.(end);
            }}
            captionLayout="dropdown"
            startMonth={new Date(1925, 0)}
            endMonth={new Date(2050, 11)}
            defaultMonth={startDate ?? new Date()}
            autoFocus
          />
        ) : (
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={(d) => {
              const next = formatISODate(d);
              if (next !== value) onSave(next);
              if (!showTime) setOpen(false);
            }}
            captionLayout="dropdown"
            startMonth={new Date(1925, 0)}
            endMonth={new Date(2050, 11)}
            defaultMonth={startDate ?? new Date()}
            autoFocus
          />
        )}

        {showTime && (
          <div className="border-t border-border px-3 py-2">
            <Input
              type="time"
              value={localTime}
              onChange={(e) => {
                setLocalTime(e.target.value);
                onSaveTime?.(e.target.value);
              }}
              className="h-7 text-xs"
            />
          </div>
        )}

        <Separator />

        <div className="flex flex-col text-sm">
          {supportsEndDate && (
            <button
              type="button"
              onClick={handleToggleEndDate}
              className="flex items-center justify-between px-3 py-2 hover:bg-accent/50"
            >
              <span>終了日</span>
              <TogglePill active={showEndDate} />
            </button>
          )}
          {supportsTime && (
            <button
              type="button"
              onClick={handleToggleTime}
              className="flex items-center justify-between px-3 py-2 hover:bg-accent/50"
            >
              <span>時間を含む</span>
              <TogglePill active={showTime} />
            </button>
          )}
          <Separator />
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 text-left text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            クリア
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TogglePill({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
        active ? "bg-primary justify-end" : "bg-input justify-start",
      )}
    >
      <div className="size-4 rounded-full bg-background shadow-sm" />
    </div>
  );
}
