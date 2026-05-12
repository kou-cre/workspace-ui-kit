"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight, Check, ChevronDown, Plus, Trash2 } from "lucide-react";

import { type Note, type StatusKey, type NotePriority, type NoteKind, type NoteStatus, type Milestone, type NoteFolder, PRIORITY_ORDER } from "@/lib/schema";
import { PRIORITY_LABELS } from "@/lib/labels";
import { getDaysLabel } from "@/lib/computed/profile";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const isDone = (note: Note) =>
  note.status === "解決済み" || (note.isAction && note.done);

function sortNotes(notes: Note[], milestones: Milestone[]): Note[] {
  return [...notes].sort((a, b) => {
    const aDone = isDone(a);
    const bDone = isDone(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone) return 0;

    const aPri = PRIORITY_ORDER.indexOf(a.priority ?? "normal");
    const bPri = PRIORITY_ORDER.indexOf(b.priority ?? "normal");
    if (aPri !== bPri) return aPri - bPri;

    const getMsIdx = (phase: string | null) =>
      phase !== null ? milestones.findIndex((m) => m.id === phase) : milestones.length;
    return getMsIdx(a.phase) - getMsIdx(b.phase);
  });
}

function sortNotesForFolder(notes: Note[], sort: string): Note[] {
  return [...notes].sort((a, b) => {
    const aDone = isDone(a);
    const bDone = isDone(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone) return 0;
    switch (sort) {
      case "date-asc": return a.date.localeCompare(b.date);
      case "priority-desc":
        return PRIORITY_ORDER.indexOf(a.priority ?? "normal") - PRIORITY_ORDER.indexOf(b.priority ?? "normal");
      case "priority-asc":
        return PRIORITY_ORDER.indexOf(b.priority ?? "normal") - PRIORITY_ORDER.indexOf(a.priority ?? "normal");
      default:
        return b.date.localeCompare(a.date);
    }
  });
}

const KIND_VARIANT: Record<Note["kind"], "default" | "secondary" | "outline"> = {
  アイデア: "secondary",
  議論余地: "outline",
  "ToDo候補": "default",
};

// ===== Context Menu =====

type CtxState = { note: Note; x: number; y: number } | null;

function NoteContextMenu({
  state,
  milestones,
  onClose,
  onSetPriority,
  onPromoteToAction,
  onDeleteNote,
}: {
  state: CtxState;
  milestones: Milestone[];
  onClose: () => void;
  onSetPriority: (id: string, p: NotePriority) => void;
  onPromoteToAction: (id: string, phase: StatusKey) => void;
  onDeleteNote: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", escHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", escHandler);
    };
  }, [state, onClose]);

  if (!state) return null;

  const menuW = 176;
  const menuH = 320;
  const x = Math.min(state.x, window.innerWidth - menuW - 8);
  const y = Math.min(state.y, window.innerHeight - menuH - 8);
  const note = state.note;

  const item = (label: string, onClick: () => void, opts?: { danger?: boolean; active?: boolean }) => (
    <button
      type="button"
      onClick={() => { onClick(); onClose(); }}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent",
        opts?.danger && "text-destructive hover:text-destructive",
        opts?.active && "font-medium",
      )}
    >
      {label}
      {opts?.active && <Check className="ml-auto size-3" />}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-44 rounded-md border border-border bg-popover p-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">優先度</p>
      {PRIORITY_ORDER.map((p) =>
        item(PRIORITY_LABELS[p], () => onSetPriority(note.id, p), {
          active: (note.priority ?? "normal") === p,
        }),
      )}

      <Separator className="my-1" />

      {!note.isAction && (
        <>
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">マイルストーンに登録</p>
          {milestones.map((m) =>
            item(m.label, () => onPromoteToAction(note.id, m.id)),
          )}
          <Separator className="my-1" />
        </>
      )}

      {item("削除", () => onDeleteNote(note.id), { danger: true })}
    </div>
  );
}

// ===== NoteListPane =====

type NoteListPaneProps = {
  notes: Note[];
  milestones: Milestone[];
  noteFolders: NoteFolder[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onAddNote: (phase?: StatusKey | null, defaults?: { kind?: NoteKind; status?: NoteStatus }) => void;
  onToggleNoteStatus: (id: string) => void;
  onUpdateNoteText: (id: string, text: string) => void;
  onUpdateNotePriority: (id: string, priority: string) => void;
  onPromoteToAction: (id: string, phase: StatusKey) => void;
  onDeleteNote: (id: string) => void;
  onAddNoteFolder: (label: string) => void;
  onSelectFolder: (id: string | null) => void;
};

export function NoteListPane({
  notes,
  milestones,
  noteFolders,
  selectedNoteId,
  onSelectNote,
  onAddNote,
  onToggleNoteStatus,
  onUpdateNoteText,
  onUpdateNotePriority,
  onPromoteToAction,
  onDeleteNote,
  onAddNoteFolder,
  onSelectFolder,
}: NoteListPaneProps) {
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [ctxMenu, setCtxMenu] = useState<CtxState>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isMilestoneFilter = milestones.some((m) => m.id === phaseFilter);
  const activeMilestoneLabel = isMilestoneFilter
    ? milestones.find((m) => m.id === phaseFilter)?.label
    : null;
  const activeFolder = noteFolders.find((f) => f.id === phaseFilter) ?? null;

  const baseNotes = phaseFilter === null ? notes : notes.filter((n) => n.phase === phaseFilter);
  const filteredNotes = activeFolder
    ? sortNotesForFolder(
        baseNotes
          .filter((n) => !activeFolder.filterKind || n.kind === activeFolder.filterKind)
          .filter((n) => !activeFolder.filterStatus || n.status === activeFolder.filterStatus),
        activeFolder.sort ?? "date-desc",
      )
    : sortNotes(baseNotes, milestones);

  const handleAddNote = () => {
    onAddNote(
      phaseFilter,
      activeFolder
        ? { kind: activeFolder.filterKind ?? undefined, status: activeFolder.filterStatus ?? undefined }
        : undefined,
    );
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
    onSelectNote(note.id);
  };

  const commitEdit = (noteId: string) => {
    onUpdateNoteText(noteId, editingText);
    setEditingNoteId(null);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditingText("");
  };

  const handleContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    setCtxMenu({ note, x: e.clientX, y: e.clientY });
  };

  const getMilestoneLabel = (phase: string | null) => {
    if (!phase) return null;
    return (
      milestones.find((m) => m.id === phase)?.label ??
      noteFolders.find((f) => f.id === phase)?.label ??
      null
    );
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="font-medium">メモ</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleAddNote}
          aria-label="メモを追加"
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <Plus />
        </Button>
      </div>

      {/* フォルダフィルター */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {/* 全体 */}
        <button
          type="button"
          onClick={() => { setPhaseFilter(null); onSelectFolder(null); }}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
            phaseFilter === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          全体
        </button>

        {/* マイルストーン（DropdownMenu） */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors outline-none",
              isMilestoneFilter
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {activeMilestoneLabel ?? "マイルストーン"}
            <ChevronDown className="size-3 transition-transform data-popup-open:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-32">
            {milestones.map((m) => {
              const count = notes.filter((n) => n.phase === m.id).length;
              return (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => { setPhaseFilter(m.id); onSelectFolder(null); }}
                  className={cn(
                    "flex items-center justify-between gap-4 text-xs",
                    phaseFilter === m.id && "font-medium",
                  )}
                >
                  <span>{m.label}</span>
                  {count > 0 && (
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* カスタムフォルダ */}
        {noteFolders.map((folder) => {
          const count = notes.filter((n) => n.phase === folder.id).length;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => { setPhaseFilter(folder.id); onSelectFolder(folder.id); }}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                phaseFilter === folder.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {folder.label}
              {count > 0 && (
                <span className={cn("tabular-nums", phaseFilter === folder.id ? "opacity-80" : "opacity-60")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* フォルダ追加 */}
        {addingFolder ? (
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = newFolderName.trim();
                if (t) { onAddNoteFolder(t); setNewFolderName(""); setAddingFolder(false); }
              }
              if (e.key === "Escape") { setNewFolderName(""); setAddingFolder(false); }
            }}
            onBlur={() => {
              const t = newFolderName.trim();
              if (t) onAddNoteFolder(t);
              setNewFolderName("");
              setAddingFolder(false);
            }}
            placeholder="フォルダ名..."
            className="h-5 w-24 shrink-0 rounded-sm border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingFolder(true)}
            aria-label="フォルダを追加"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>

      {/* メモ一覧 */}
      <ScrollArea className="flex-1">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {phaseFilter
                ? `${getMilestoneLabel(phaseFilter) ?? phaseFilter}のメモはまだありません`
                : "メモはまだありません"}
            </p>
            <Button variant="outline" size="sm" onClick={() => onAddNote(phaseFilter)}>
              <Plus />
              最初のメモを追加
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredNotes.map((note, idx) => {
              const isEditing = editingNoteId === note.id;
              const milestoneLabel = getMilestoneLabel(note.phase);
              return (
                <div key={note.id}>
                  <div
                    onContextMenu={(e) => handleContextMenu(e, note)}
                    className={cn(
                      "group flex items-start gap-3 px-4 py-3 transition-colors",
                      selectedNoteId === note.id && "bg-accent",
                    )}
                  >
                    <Checkbox
                      id={`note-status-${note.id}`}
                      checked={note.status === "解決済み"}
                      indeterminate={note.status === "対応中"}
                      onCheckedChange={() => onToggleNoteStatus(note.id)}
                      aria-label="ステータスを切り替え"
                      className="mt-1 shrink-0"
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {/* バッジ行 */}
                      <button
                        type="button"
                        onClick={() => onSelectNote(note.id)}
                        className="flex flex-wrap items-center gap-1.5 text-left hover:opacity-80"
                      >
                        {note.priority === "urgent" && (
                          <Badge variant="default" size="xs" className="bg-destructive text-destructive-foreground">
                            緊急
                          </Badge>
                        )}
                        {note.priority === "high" && (
                          <Badge variant="secondary" size="xs">重要</Badge>
                        )}
                        <Badge variant={KIND_VARIANT[note.kind]} size="xs">
                          {note.kind}
                        </Badge>
                        <Badge
                          variant={note.status === "解決済み" ? "delivered" : "outline"}
                          size="xs"
                        >
                          {note.status}
                        </Badge>
                        {milestoneLabel && (
                          <Badge variant="secondary" size="xs">
                            {milestoneLabel}
                          </Badge>
                        )}
                        {note.isAction && (
                          <Badge variant="default" size="xs">アクション</Badge>
                        )}
                        {(() => {
                          const done = isDone(note);
                          if (done || !note.date) {
                            return (
                              <span className="ml-auto text-[11px] text-muted-foreground">
                                {note.date}
                              </span>
                            );
                          }
                          const label = getDaysLabel(note.date);
                          if (!label) return <span className="ml-auto text-[11px] text-muted-foreground">{note.date}</span>;
                          const isOverdue = label.includes("超過");
                          const isToday = label === "今日";
                          return (
                            <span
                              title={note.date}
                              className={cn(
                                "ml-auto text-[11px] tabular-nums",
                                isOverdue ? "text-destructive" : isToday ? "font-medium text-primary" : "text-muted-foreground",
                              )}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </button>

                      {/* テキスト行 */}
                      {isEditing ? (
                        <Input
                          ref={inputRef}
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onBlur={() => commitEdit(note.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitEdit(note.id); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          placeholder="メモの内容を入力..."
                          className="h-7 bg-background text-sm"
                        />
                      ) : (
                        <p
                          role="button"
                          tabIndex={0}
                          onClick={() => startEdit(note)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEdit(note); }}
                          className={cn(
                            "cursor-text rounded px-0.5 text-sm leading-relaxed hover:bg-accent/50",
                            note.status === "解決済み"
                              ? "text-muted-foreground line-through"
                              : note.text ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {note.text || "未記入"}
                        </p>
                      )}
                    </div>

                    {/* ホバーボタン: マイルストーンに登録 */}
                    {!note.isAction && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={cn(
                            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground",
                            "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                          )}
                          aria-label="マイルストーンに登録"
                        >
                          <ArrowRight className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-xs">登録先マイルストーン</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {milestones.map((m) => (
                              <DropdownMenuItem key={m.id} onClick={() => onPromoteToAction(note.id, m.id)}>
                                {m.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {idx < filteredNotes.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* 右クリックコンテキストメニュー */}
      <NoteContextMenu
        state={ctxMenu}
        milestones={milestones}
        onClose={() => setCtxMenu(null)}
        onSetPriority={(id, p) => onUpdateNotePriority(id, p)}
        onPromoteToAction={onPromoteToAction}
        onDeleteNote={onDeleteNote}
      />
    </div>
  );
}
