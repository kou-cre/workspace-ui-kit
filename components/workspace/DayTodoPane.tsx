"use client";

import { useState } from "react";
import { Plus, GripVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { getDaysLabel } from "@/lib/computed/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { type CalendarTodo, PERSONAL_PROJECT_ID } from "@/lib/schema";

function getDueState(label: string | null): "overdue" | "soon" | "normal" | null {
  if (!label) return null;
  if (label.includes("超過")) return "overdue";
  const m = label.match(/あと (\d+) 日/);
  if (m && Number(m[1]) <= 7) return "soon";
  return "normal";
}

const isDone = (t: CalendarTodo) =>
  t.status === "解決済み" || (t.isAction && t.done);

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${weekday}）`;
}

type Props = {
  date: string;
  todos: CalendarTodo[];
  selectedNoteId: string | null;
  onSelectNote: (noteId: string, projectId: string) => void;
  onToggle: (noteId: string, projectId: string) => void;
  onAddPersonalTodo: (text: string, date: string) => void;
};

export function DayTodoPane({
  date,
  todos,
  selectedNoteId,
  onSelectNote,
  onToggle,
  onAddPersonalTodo,
}: Props) {
  const [newTodoText, setNewTodoText] = useState("");

  const handleAdd = () => {
    const trimmed = newTodoText.trim();
    if (!trimmed) return;
    onAddPersonalTodo(trimmed, date);
    setNewTodoText("");
  };

  const pending = todos.filter(t => !isDone(t));
  const done = todos.filter(isDone);

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex items-center gap-1.5">
          <p className="font-medium">{formatDateLabel(date)}</p>
          {(() => {
            const label = getDaysLabel(date);
            const state = getDueState(label);
            if (!label || state === "normal" || state === null) return null;
            return (
              <span className={cn(
                "text-xs tabular-nums font-medium",
                state === "overdue" ? "text-destructive" : "text-chart-2",
              )}>
                {label}
              </span>
            );
          })()}
        </div>
        {todos.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {done.length}/{todos.length}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col">
          {/* 未完了 */}
          {pending.map((todo, idx) => (
            <div key={todo.id}>
              <TodoRow
                todo={todo}
                isSelected={selectedNoteId === todo.id}
                onToggle={() => onToggle(todo.id, todo.projectId)}
                onSelect={() => onSelectNote(todo.id, todo.projectId)}
              />
              {idx < pending.length - 1 && <Separator />}
            </div>
          ))}

          {/* 追加入力 */}
          <div className="flex gap-2 px-4 py-3">
            <Input
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
              placeholder="個人タスクを追加..."
              className="h-7 flex-1 bg-card text-xs"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newTodoText.trim()}
              className="h-7 px-2 text-xs"
            >
              <Plus />
              追加
            </Button>
          </div>

          {/* 完了済み */}
          {done.length > 0 && (
            <>
              <Separator />
              <p className="px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">完了済み</p>
              {done.map((todo, idx) => (
                <div key={todo.id}>
                  <TodoRow
                    todo={todo}
                    isSelected={selectedNoteId === todo.id}
                    onToggle={() => onToggle(todo.id, todo.projectId)}
                    onSelect={() => onSelectNote(todo.id, todo.projectId)}
                  />
                  {idx < done.length - 1 && <Separator />}
                </div>
              ))}
            </>
          )}

          {todos.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">この日のタスクはありません</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TodoRow({
  todo,
  isSelected,
  onToggle,
  onSelect,
}: {
  todo: CalendarTodo;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-todo-${todo.id}`,
    data: { type: "calendar-todo", todo },
  });
  const done = isDone(todo);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-start gap-2 px-2 py-3 transition-colors",
        isSelected && "bg-accent",
        isDragging && "opacity-20",
      )}
    >
      {/* ドラッグハンドル */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="ドラッグして日付を変更"
        tabIndex={-1}
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        className="mt-0.5 shrink-0"
      />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <span
          className={cn(
            "text-sm leading-snug",
            done && "text-muted-foreground line-through",
          )}
        >
          {todo.title || todo.text || "未記入"}
        </span>
        {todo.projectId !== PERSONAL_PROJECT_ID && (
          <Badge variant="secondary" size="xs">
            {todo.projectName}
          </Badge>
        )}
      </button>
    </div>
  );
}
