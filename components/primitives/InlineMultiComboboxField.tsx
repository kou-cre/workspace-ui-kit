"use client";

/**
 * InlineMultiComboboxField — 複数選択対応のインラインコンボボックス。
 *
 * - 選択済み値をチップ（Badge）として横並びで表示
 * - チップの × で個別削除、Backspace で末尾チップを削除（0件も可）
 * - 入力欄でリアルタイム絞り込み + 新規追加
 * - Popover は入力フォーカス / コンテナクリックで開く
 */

import { useRef, useState, type KeyboardEvent } from "react";
import { Archive, Check, ChevronRight, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ComboOption } from "@/components/primitives/InlineComboboxField";

export type InlineMultiComboboxFieldProps = {
  values: string[];
  options: ComboOption[];
  archivedOptions?: ComboOption[];
  onSave: (values: string[]) => void;
  ariaLabel?: string;
  placeholder?: string;
};

export function InlineMultiComboboxField({
  values,
  options,
  archivedOptions,
  onSave,
  ariaLabel = "選択",
  placeholder = "選択または追加...",
}: InlineMultiComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  const filteredOptions = options.filter(
    (o) => !trimmed || o.value.toLowerCase().includes(trimmed.toLowerCase()),
  );

  const showCreate =
    trimmed !== "" &&
    !options.find((o) => o.value === trimmed) &&
    !values.includes(trimmed);

  const toggle = (v: string) => {
    onSave(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
    setQuery("");
    inputRef.current?.focus();
  };

  const remove = (v: string) => onSave(values.filter((x) => x !== v));

  const handleCreate = () => {
    onSave([...values, trimmed]);
    setQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !query && values.length > 0) {
      remove(values[values.length - 1]);
    }
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<div role="combobox" aria-expanded={open} aria-label={ariaLabel} />}
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-card px-2.5 py-1 text-sm transition-colors",
          "hover:bg-accent/40",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        )}
      >
        {values.map((v) => {
          const opt = options.find((o) => o.value === v);
          return (
            <Badge key={v} variant="secondary" size="xs" className="gap-1 pl-0.5">
              {opt?.image ? (
                <img src={opt.image} alt={v} className="size-4 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium">
                  {v.charAt(0).toUpperCase()}
                </span>
              )}
              {v}
              <button
                type="button"
                aria-label={`${v}を削除`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(v);
                }}
                className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          );
        })}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onClick={(e) => e.stopPropagation()}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-1">
        <div className="flex flex-col">
          {showCreate && (
            <button
              type="button"
              onClick={handleCreate}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-muted"
            >
              <Plus className="size-4 shrink-0" />「{trimmed}」を追加
            </button>
          )}
          {filteredOptions.map((opt) => {
            const selected = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  selected && "text-primary",
                )}
              >
                {opt.image ? (
                  <img src={opt.image} alt={opt.value} className="size-5 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                    {opt.value.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 truncate">{opt.value}</span>
                <Check
                  className={cn(
                    "ml-auto size-4 shrink-0",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            );
          })}
          {!showCreate && filteredOptions.length === 0 && !archivedOptions?.length && (
            <p className="py-3 text-center text-sm text-muted-foreground">候補なし</p>
          )}

          {archivedOptions && archivedOptions.length > 0 && (
            <>
              <div className="my-0.5 border-t border-border/50" />
              <div
                onMouseEnter={() => setShowArchived(true)}
                onMouseLeave={() => setShowArchived(false)}
              >
                <div className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                  <Archive className="size-4 shrink-0" />
                  アーカイブ
                  <ChevronRight
                    className={cn(
                      "ml-auto size-3.5 transition-transform duration-150",
                      showArchived && "rotate-90",
                    )}
                  />
                </div>
                {showArchived && (
                  <div className="flex flex-col pl-2">
                    {archivedOptions
                      .filter((o) => !trimmed || o.value.toLowerCase().includes(trimmed.toLowerCase()))
                      .map((opt) => {
                        const selected = values.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggle(opt.value)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                              selected && "text-primary",
                            )}
                          >
                            <Check
                              className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
                            />
                            {opt.value}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
