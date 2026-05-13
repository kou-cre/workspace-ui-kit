"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { type CalendarTodo, PERSONAL_PROJECT_ID } from "@/lib/schema";

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
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="font-medium">{formatDateLabel(date)}</p>
        {todos.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {done.length}/{todos.length}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1">
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
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
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
  const done = isDone(todo);

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-4 py-3 transition-colors",
        isSelected && "bg-accent",
      )}
    >
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
          {todo.text || "未記入"}
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
