"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { type CalendarTodo } from "@/lib/schema";

const isDone = (t: CalendarTodo) =>
  t.status === "解決済み" || (t.isAction && t.done);

function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const end = new Date(y, m - 1, d + 6);
  const em = end.getMonth() + 1;
  const ed = end.getDate();
  return m === em
    ? `${y}年${m}月${d}〜${ed}日`
    : `${y}年${m}月${d}日〜${em}月${ed}日`;
}

function formatMonthLabel(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}年${Number(m)}月`;
}

type Props = {
  scope: "week" | "month";
  scopeDate: string;
  periodTodos: CalendarTodo[];
  reviewNotes: CalendarTodo[];
  onAddReview: () => void;
  onUpdateReview: (id: string, text: string) => void;
  onDeleteReview: (id: string) => void;
};

export function ReviewPane({
  scope,
  scopeDate,
  periodTodos,
  reviewNotes,
  onAddReview,
  onUpdateReview,
  onDeleteReview,
}: Props) {
  const doneCount = periodTodos.filter(isDone).length;
  const totalCount = periodTodos.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;
  const label = scope === "week" ? formatWeekLabel(scopeDate) : formatMonthLabel(scopeDate);
  const sectionLabel = scope === "week" ? "週次振り返り" : "月次振り返り";

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="font-medium">{label}</p>
        {totalCount > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{totalCount} 完了
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* タスク進捗 */}
        {totalCount > 0 ? (
          <div className="px-4 py-3">
            <div className="rounded-md bg-card p-3 ring-1 ring-border">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">タスク達成率</p>
                <p className="text-xs font-medium tabular-nums">{Math.round(progress * 100)}%</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">この期間のタスクはありません</p>
          </div>
        )}

        <Separator />

        {/* 振り返りノート */}
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{sectionLabel}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onAddReview}
              aria-label="振り返りを追加"
              className="size-6 text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" />
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {reviewNotes.map(note => (
              <ReviewCard
                key={note.id}
                note={note}
                onUpdate={(text) => onUpdateReview(note.id, text)}
                onDelete={() => onDeleteReview(note.id)}
              />
            ))}
            {reviewNotes.length === 0 && (
              <p className="text-xs text-muted-foreground/60">+ で振り返りメモを追加できます</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: CalendarTodo;
  onUpdate: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(note.text);

  return (
    <div className="group relative rounded-md bg-card p-2 ring-1 ring-border">
      <Textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text !== note.text) onUpdate(text); }}
        onKeyDown={e => {
          if (e.key === "Escape") { setText(note.text); (e.target as HTMLTextAreaElement).blur(); }
        }}
        placeholder="振り返りを書き出す..."
        autoFocus={note.text === ""}
        className="min-h-[4rem] resize-none border-none bg-transparent p-0 text-xs leading-relaxed shadow-none focus-visible:ring-0"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label="削除"
        className="absolute right-1 top-1 size-5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}
