"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  onAddBrainDump: (date: string) => void;
  onUpdateBrainDump: (id: string, text: string) => void;
  onDeleteBrainDump: (id: string) => void;
};

export function DayTodoPane({
  date,
  todos,
  selectedNoteId,
  onSelectNote,
  onToggle,
  onAddPersonalTodo,
  onAddBrainDump,
  onUpdateBrainDump,
  onDeleteBrainDump,
}: Props) {
  const [newTodoText, setNewTodoText] = useState("");

  const handleAdd = () => {
    const trimmed = newTodoText.trim();
    if (!trimmed) return;
    onAddPersonalTodo(trimmed, date);
    setNewTodoText("");
  };

  const brainDumps = todos.filter(t => t.kind === "ブレインダンプ");
  const taskTodos = todos.filter(t => t.kind !== "ブレインダンプ");
  const pending = taskTodos.filter(t => !isDone(t));
  const done = taskTodos.filter(isDone);

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="font-medium">{formatDateLabel(date)}</p>
        {taskTodos.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {taskTodos.filter(isDone).length}/{taskTodos.length}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {/* 未完了タスク */}
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

          {/* 完了済みタスク */}
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

          {taskTodos.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-sm text-muted-foreground">この日のタスクはありません</p>
            </div>
          )}

          {/* ブレインダンプセクション */}
          <Separator />
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">ブレインダンプ</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onAddBrainDump(date)}
                aria-label="付箋を追加"
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3" />
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {brainDumps.map(dump => (
                <BrainDumpCard
                  key={dump.id}
                  dump={dump}
                  onUpdate={(text) => onUpdateBrainDump(dump.id, text)}
                  onDelete={() => onDeleteBrainDump(dump.id)}
                />
              ))}
              {brainDumps.length === 0 && (
                <p className="text-xs text-muted-foreground/60">
                  + で付箋を追加できます
                </p>
              )}
            </div>
          </div>
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

function BrainDumpCard({
  dump,
  onUpdate,
  onDelete,
}: {
  dump: CalendarTodo;
  onUpdate: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(dump.text);

  return (
    <div className="group relative rounded-md bg-card p-2 ring-1 ring-border">
      <Textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text !== dump.text) onUpdate(text); }}
        onKeyDown={e => {
          if (e.key === "Escape") { setText(dump.text); (e.target as HTMLTextAreaElement).blur(); }
        }}
        placeholder="書き出す..."
        autoFocus={dump.text === ""}
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
