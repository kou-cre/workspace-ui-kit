"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { DURATION_PRESETS } from "@/lib/schema";
import { cn } from "@/lib/utils";

export type InlineDurationFieldProps = {
  /** 所要時間（分）。0 はタイムライン非表示。 */
  value: number;
  onSave: (v: number) => void;
  ariaLabel: string;
};

function formatDuration(min: number): string {
  if (min <= 0) return "未設定";
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

export function InlineDurationField({
  value,
  onSave,
  ariaLabel,
}: InlineDurationFieldProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(value > 0 ? String(value) : "");

  const handlePick = (n: number) => {
    if (n !== value) onSave(n);
    setCustom(String(n));
    setOpen(false);
  };

  const handleCustomCommit = () => {
    const n = Math.max(0, Math.floor(Number(custom)));
    if (!Number.isFinite(n)) return;
    if (n !== value) onSave(n);
    setOpen(false);
  };

  const handleClear = () => {
    if (value !== 0) onSave(0);
    setCustom("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className="flex h-8 w-full items-center justify-start gap-2 rounded-lg border border-input bg-card px-2.5 py-1 text-left text-sm transition-colors outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:border-ring data-popup-open:ring-3 data-popup-open:ring-ring/50"
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "truncate",
            value > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {formatDuration(value)}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex flex-col gap-2 px-3 py-3">
          <p className="text-xs text-muted-foreground">プリセット</p>
          <div className="grid grid-cols-3 gap-1.5">
            {DURATION_PRESETS.map((n) => (
              <Button
                key={n}
                type="button"
                variant={n === value ? "default" : "secondary"}
                size="sm"
                onClick={() => handlePick(n)}
                className="h-7 text-xs"
              >
                {n}分
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2 px-3 py-2">
          <Input
            type="number"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                handleCustomCommit();
              }
            }}
            placeholder="カスタム（分）"
            min={0}
            step={5}
            className="h-7 text-xs"
            aria-label="カスタム所要時間"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleCustomCommit}
            className="h-7 px-2 text-xs"
          >
            保存
          </Button>
        </div>

        <Separator />

        <button
          type="button"
          onClick={handleClear}
          className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          タイムラインから外す
        </button>
      </PopoverContent>
    </Popover>
  );
}
