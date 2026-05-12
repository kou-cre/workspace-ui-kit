"use client";

import { useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";

import { type Note, type StatusKey, type Milestone, type NoteFolder, noteKindSchema, noteStatusSchema, PRIORITY_ORDER } from "@/lib/schema";
import { PRIORITY_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { InlineDateField } from "@/components/primitives/InlineDateField";
import { InlineFieldRow } from "@/components/primitives/InlineFieldRow";
import { InlineSelectField } from "@/components/primitives/InlineSelectField";
import { InlineTextareaField } from "@/components/primitives/InlineTextareaField";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";
import { Pane4Toggle } from "@/components/workspace/Pane4Toggle";

const KIND_OPTIONS = noteKindSchema.options;
const STATUS_OPTIONS = noteStatusSchema.options;
const PRIORITY_OPTIONS = PRIORITY_ORDER.map((p) => PRIORITY_LABELS[p]);

type NoteDetailPaneProps = {
  note: Note;
  milestones: Milestone[];
  noteFolders: NoteFolder[];
  pane4Open: boolean;
  onTogglePane4: () => void;
  onUpdateNote: (field: keyof Note, value: string) => void;
  onSetNotePhase: (phase: StatusKey | null) => void;
  onDeleteNote: () => void;
  onMoveToPhase: (phase: StatusKey) => void;
};

export function NoteDetailPane({
  note,
  milestones,
  noteFolders,
  pane4Open,
  onTogglePane4,
  onUpdateNote,
  onSetNotePhase,
  onDeleteNote,
  onMoveToPhase,
}: NoteDetailPaneProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const phaseOptions = [
    "なし",
    ...milestones.map((m) => m.label),
    ...noteFolders.map((f) => f.label),
  ];

  const handlePhaseSave = (label: string) => {
    if (label === "なし") {
      onSetNotePhase(null);
      return;
    }
    const m = milestones.find((ms) => ms.label === label);
    if (m) { onSetNotePhase(m.id); return; }
    const f = noteFolders.find((nf) => nf.label === label);
    if (f) onSetNotePhase(f.id);
  };

  const currentPhaseLabel = note.phase
    ? (milestones.find((m) => m.id === note.phase)?.label
        ?? noteFolders.find((f) => f.id === note.phase)?.label
        ?? "なし")
    : "なし";

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <p className="text-sm font-medium text-muted-foreground">メモ詳細</p>
        <Pane4Toggle open={pane4Open} onToggle={onTogglePane4} />
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 py-4">
          <dl className="flex flex-col gap-3 text-sm">
            <InlineFieldRow label="日付">
              <InlineDateField
                value={note.date}
                onSave={(v) => onUpdateNote("date", v)}
                ariaLabel="日付"
              />
            </InlineFieldRow>

            <InlineFieldRow label="種類">
              <InlineSelectField
                value={note.kind}
                options={KIND_OPTIONS}
                onSave={(v) => onUpdateNote("kind", v)}
                ariaLabel="メモの種類"
              />
            </InlineFieldRow>

            <InlineFieldRow label="ステータス">
              <InlineSelectField
                value={note.status}
                options={STATUS_OPTIONS}
                onSave={(v) => onUpdateNote("status", v)}
                ariaLabel="メモのステータス"
              />
            </InlineFieldRow>

            <InlineFieldRow label="優先度">
              <InlineSelectField
                value={PRIORITY_LABELS[note.priority ?? "normal"]}
                options={PRIORITY_OPTIONS}
                onSave={(v) => {
                  const key = PRIORITY_ORDER.find((p) => PRIORITY_LABELS[p] === v);
                  if (key) onUpdateNote("priority", key);
                }}
                ariaLabel="優先度"
              />
            </InlineFieldRow>

            <InlineFieldRow label="グループ">
              <InlineSelectField
                value={currentPhaseLabel}
                options={phaseOptions}
                onSave={handlePhaseSave}
                ariaLabel="グループ"
              />
            </InlineFieldRow>
          </dl>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">内容</p>
            <InlineTextareaField
              value={note.text}
              onSave={(v) => onUpdateNote("text", v)}
              ariaLabel="メモの内容"
              placeholder="詳細を記入... (Cmd+Enter で保存)"
            />
          </div>
        </div>
      </ScrollArea>

      {/* フッター */}
      <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
        {!note.isAction && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ArrowRight className="size-4 shrink-0" />
              アクションとして登録
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs">登録先マイルストーン</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {milestones.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => onMoveToPhase(m.id)}>
                    {m.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
          このメモを削除
        </Button>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="メモを削除"
        itemName="このメモ"
        onConfirm={onDeleteNote}
      />
    </div>
  );
}
