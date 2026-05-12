"use client";

import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { useDroppable, useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { type Project, type StatusKey, type Note, type Milestone, COMPLETED_STATUS } from "@/lib/schema";
import { getMilestoneBadgeVariant } from "@/lib/labels";
import { getDaysLabel } from "@/lib/computed/profile";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { DeleteConfirmDialog } from "@/components/workspace/DeleteConfirmDialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  InlineComboboxField,
  type ComboOption,
} from "@/components/primitives/InlineComboboxField";
import { InlineSelectField } from "@/components/primitives/InlineSelectField";

// ===== MilestoneDropZone =====

function MilestoneDropZone({
  milestoneId,
  children,
}: {
  milestoneId: string;
  children: ReactNode;
}) {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${milestoneId}`,
    data: { type: "milestone-zone", milestoneId },
  });
  const showHint = active !== null && active.data.current?.type !== "milestone";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-all duration-150",
        isOver
          ? "bg-primary/10 ring-2 ring-inset ring-primary/50"
          : showHint
          ? "ring-1 ring-inset ring-dashed ring-primary/30"
          : "",
      )}
    >
      {children}
    </div>
  );
}

// ===== SortableActionRow =====

type SortableActionRowProps = {
  action: Note;
  milestoneId: string;
  editingActionId: string | null;
  editingText: string;
  subtaskInputs: Record<string, string>;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onToggleSubtaskInput: () => void;
  onSubtaskInputChange: (v: string) => void;
  onAddSubtask: (text: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
};

function SortableActionRow({
  action,
  milestoneId,
  editingActionId,
  editingText,
  subtaskInputs,
  onToggle,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onToggleSubtaskInput,
  onSubtaskInputChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: SortableActionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: action.id,
    data: { type: "action", milestoneId, label: action.text || "タスク" },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const isEditing = editingActionId === action.id;

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col gap-1", isDragging && "pointer-events-none")}>
      {isOver && !isDragging && (
        <div className="flex items-center gap-0.5 py-0.5">
          <div className="size-1.5 shrink-0 rounded-full bg-primary" />
          <div className="h-0.5 flex-1 rounded-full bg-primary" />
        </div>
      )}
      <div className={cn("group flex items-start gap-2", isDragging && "rounded border border-dashed border-primary/30 bg-primary/5")}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing focus-visible:opacity-100 group-hover:opacity-100"
          aria-label="ドラッグして並べ替え"
        >
          <GripVertical className="size-4" />
        </button>

        <Checkbox
          id={action.id}
          checked={action.done}
          onCheckedChange={onToggle}
          className="mt-0.5 shrink-0"
        />

        {isEditing ? (
          <Input
            autoFocus
            value={editingText}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="h-6 flex-1 bg-card py-0 text-sm"
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={onStartEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onStartEdit();
            }}
            className={cn(
              "flex-1 cursor-text rounded px-0.5 text-sm leading-relaxed hover:bg-accent/50",
              action.done && "text-muted-foreground line-through",
            )}
          >
            {action.text}
          </span>
        )}

        {!action.done && action.date && (() => {
          const label = getDaysLabel(action.date);
          if (!label) return null;
          const isOverdue = label.includes("超過");
          const isToday = label === "今日";
          return (
            <span
              title={action.date}
              className={cn(
                "shrink-0 text-[11px] tabular-nums",
                isOverdue ? "text-destructive" : isToday ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          );
        })()}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSubtaskInput}
          aria-label="サブタスクを追加"
          className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="削除"
          className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 />
        </Button>
      </div>

      {(action.subtasks?.length ?? 0) > 0 && (
        <div className="ml-12 flex flex-col gap-1 border-l border-border pl-3">
          {action.subtasks!.map((sub) => (
            <div key={sub.id} className="group flex items-center gap-2">
              <Checkbox
                id={sub.id}
                checked={sub.done}
                onCheckedChange={() => onToggleSubtask(sub.id)}
                className="size-3.5 shrink-0"
              />
              <span
                className={cn(
                  "flex-1 text-xs leading-relaxed",
                  sub.done && "text-muted-foreground line-through",
                )}
              >
                {sub.text}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDeleteSubtask(sub.id)}
                aria-label="サブタスクを削除"
                className="size-5 shrink-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}

      {subtaskInputs[action.id] !== undefined && (
        <div className="ml-12 flex gap-1.5 border-l border-border pl-3">
          <Input
            autoFocus
            value={subtaskInputs[action.id]}
            onChange={(e) => onSubtaskInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = subtaskInputs[action.id].trim();
                if (t) onAddSubtask(t);
              }
              if (e.key === "Escape") onToggleSubtaskInput();
            }}
            placeholder="サブタスクを追加..."
            className="h-6 flex-1 bg-card py-0 text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              const t = subtaskInputs[action.id].trim();
              if (t) onAddSubtask(t);
            }}
            disabled={!subtaskInputs[action.id]?.trim()}
            className="h-6 px-2 text-xs"
          >
            追加
          </Button>
        </div>
      )}
    </div>
  );
}

// ===== SortableMilestoneWrapper =====

function SortableMilestoneWrapper({
  id,
  children,
}: {
  id: string;
  children: (props: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id, data: { type: "milestone" } });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
        ),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
    >
      {isOver && !isDragging && (
        <div className="mb-1 flex items-center gap-0.5">
          <div className="size-1.5 shrink-0 rounded-full bg-primary" />
          <div className="h-0.5 flex-1 rounded-full bg-primary" />
        </div>
      )}
      {children({ attributes, listeners })}
    </div>
  );
}

// ===== ProjectDetailPane =====

type ProjectDetailPaneProps = {
  project: Project;
  allClientOptions: ComboOption[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (id: string) => void;
  onUpdateProjectStatus: (status: StatusKey) => void;
  onUpdateClients: (clients: string[]) => void;
  onAddMilestone: (id: string, label: string) => void;
  onUpdateMilestone: (id: string, label: string) => void;
  onDeleteMilestone: (id: string) => void;
  onToggleAction: (noteId: string) => void;
  onAddAction: (phase: StatusKey, text: string) => void;
  onDeleteAction: (noteId: string) => void;
  onUpdateAction: (noteId: string, text: string) => void;
  onAddSubtask: (noteId: string, text: string) => void;
  onToggleSubtask: (noteId: string, subtaskId: string) => void;
  onDeleteSubtask: (noteId: string, subtaskId: string) => void;
};

export function ProjectDetailPane({
  project,
  allClientOptions,
  selectedMilestoneId,
  onSelectMilestone,
  onUpdateProjectStatus,
  onUpdateClients,
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onToggleAction,
  onAddAction,
  onDeleteAction,
  onUpdateAction,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: ProjectDetailPaneProps) {
  const [openMilestones, setOpenMilestones] = useState<Set<string>>(
    new Set([project.status]),
  );
  const [newActionTexts, setNewActionTexts] = useState<Record<string, string>>({});
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [subtaskInputs, setSubtaskInputs] = useState<Record<string, string>>({});

  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [editingMilestoneName, setEditingMilestoneName] = useState("");

  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");

  const [msCtxMenu, setMsCtxMenu] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const msCtxRef = useRef<HTMLDivElement>(null);

  const [deletingMilestone, setDeletingMilestone] = useState<{ id: string; label: string } | null>(null);

  const milestones = project.milestones;
  const isAllCompleted = project.status === COMPLETED_STATUS;
  const currentMilestoneIndex = isAllCompleted
    ? milestones.length
    : milestones.findIndex((m) => m.id === project.status);

  const allActions = project.notes.filter((n) => n.isAction);
  const totalActions = allActions.length;
  const totalDone = allActions.filter((a) => a.done).length;
  const totalPct = totalActions === 0 ? 0 : Math.round((totalDone / totalActions) * 100);

  const getMilestoneActions = (milestoneId: string): Note[] =>
    project.notes.filter((n) => n.isAction && n.phase === milestoneId);

  const toggleMilestone = (id: string, open: boolean) => {
    setOpenMilestones((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const getNewActionText = (milestoneId: string) => newActionTexts[milestoneId] ?? "";

  const handleAddAction = (milestoneId: string) => {
    const trimmed = getNewActionText(milestoneId).trim();
    if (!trimmed) return;
    onAddAction(milestoneId, trimmed);
    setNewActionTexts((prev) => ({ ...prev, [milestoneId]: "" }));
  };

  const startEdit = (actionId: string, currentText: string) => {
    setEditingActionId(actionId);
    setEditingText(currentText);
  };

  const commitEdit = (actionId: string) => {
    const trimmed = editingText.trim();
    if (trimmed) onUpdateAction(actionId, trimmed);
    setEditingActionId(null);
  };

  const cancelEdit = () => {
    setEditingActionId(null);
    setEditingText("");
  };

  const startMilestoneEdit = (id: string, label: string) => {
    setEditingMilestoneId(id);
    setEditingMilestoneName(label);
  };

  const commitMilestoneEdit = (id: string) => {
    const trimmed = editingMilestoneName.trim();
    if (trimmed) onUpdateMilestone(id, trimmed);
    setEditingMilestoneId(null);
  };

  const cancelMilestoneEdit = () => {
    setEditingMilestoneId(null);
    setEditingMilestoneName("");
  };

  const handleAddMilestone = () => {
    const trimmed = newMilestoneName.trim();
    if (!trimmed) return;
    const id = `ms-${Date.now()}`;
    onAddMilestone(id, trimmed);
    setNewMilestoneName("");
    setShowAddMilestone(false);
    setOpenMilestones((prev) => new Set([...prev, id]));
  };

  useEffect(() => {
    if (!msCtxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (msCtxRef.current && !msCtxRef.current.contains(e.target as Node)) setMsCtxMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMsCtxMenu(null); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onEsc); };
  }, [msCtxMenu]);

  const handleStatusSave = (label: string) => {
    if (label === "完了") { onUpdateProjectStatus(COMPLETED_STATUS); return; }
    const m = milestones.find((ms) => ms.label === label);
    if (m) onUpdateProjectStatus(m.id);
  };

  const handleMilestoneCircleClick = (milestoneId: string, msIdx: number, isCurrent: boolean) => {
    if (isCurrent) {
      if (msIdx === milestones.length - 1) {
        onUpdateProjectStatus(COMPLETED_STATUS);
      } else {
        onUpdateProjectStatus(milestones[msIdx + 1].id);
      }
    } else {
      onUpdateProjectStatus(milestoneId);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* プロジェクトヘッダー */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">プロジェクト名</p>
          <p className="truncate font-semibold">{project.name}</p>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">クライアント</p>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onUpdateClients([...project.clients, ""])}
              aria-label="クライアントを追加"
              className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Plus />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {project.clients.length === 0 ? (
              <InlineComboboxField
                value=""
                options={allClientOptions}
                onSave={(v) => onUpdateClients(v ? [v] : [])}
                onCreate={() => {}}
                ariaLabel="クライアントを選択または追加"
                placeholder="クライアントを選択または追加..."
                searchPlaceholder="クライアントを検索または入力..."
              />
            ) : (
              project.clients.map((client, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <InlineComboboxField
                      value={client}
                      options={allClientOptions.filter(
                        (o) =>
                          o.value === client || !project.clients.includes(o.value),
                      )}
                      onSave={(v) => {
                        const next = [...project.clients];
                        next[idx] = v;
                        onUpdateClients(next.filter(Boolean));
                      }}
                      onCreate={() => {}}
                      ariaLabel={`クライアント ${idx + 1}`}
                      placeholder="クライアントを選択または追加..."
                      searchPlaceholder="クライアントを検索または入力..."
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      onUpdateClients(project.clients.filter((_, i) => i !== idx))
                    }
                    aria-label="クライアントを削除"
                    className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <p className="text-xs text-muted-foreground">ステータス</p>
          {milestones.length > 0 ? (
            <InlineSelectField
              value={isAllCompleted ? "完了" : (milestones.find((m) => m.id === project.status)?.label ?? "未設定")}
              options={[...milestones.map((m) => m.label), "完了"]}
              onSave={handleStatusSave}
              ariaLabel="プロジェクトステータス"
            />
          ) : (
            <p className="text-sm text-muted-foreground">マイルストーンを追加してください</p>
          )}
        </div>
      </div>

      {/* 全体進捗サマリー */}
      {totalActions > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>全体進捗</span>
            <span className="tabular-nums">
              {totalDone}/{totalActions}（{totalPct}%）
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${totalPct}%` }}
            />
          </div>
        </div>
      )}

      {/* マイルストーン縦並びアコーディオン */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col px-4 py-3">
          <SortableContext
            items={milestones.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
          {milestones.map((milestone, idx) => {
            const msIdx = idx;
            const isCompleted = msIdx < currentMilestoneIndex;
            const isCurrent = !isAllCompleted && msIdx === currentMilestoneIndex;
            const isOpen = openMilestones.has(milestone.id);
            const actions = getMilestoneActions(milestone.id);
            const doneCount = actions.filter((a) => a.done).length;
            const isEditingName = editingMilestoneId === milestone.id;

            return (
              <SortableMilestoneWrapper key={milestone.id} id={milestone.id}>
              {({ attributes: dragAttrs, listeners: dragListeners }) => (
              <div className="flex gap-3">
                {/* タイムライン列 */}
                <div className="flex flex-col items-center pt-3">
                  <button
                    type="button"
                    onClick={() => handleMilestoneCircleClick(milestone.id, msIdx, isCurrent)}
                    aria-label={isCurrent ? `${milestone.label}を完了にする` : `${milestone.label}を進行中にする`}
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isCompleted || isCurrent
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary/80"
                        : "border-muted-foreground bg-background hover:border-primary hover:bg-primary/10",
                    )}
                  >
                    {isCompleted && <Check className="size-3" />}
                    {isCurrent && <span className="size-2 animate-pulse rounded-full bg-primary-foreground" />}
                  </button>
                  {idx < milestones.length - 1 && (
                    <div
                      className={cn(
                        "mt-1 w-0.5 flex-1",
                        isCompleted ? "bg-primary" : "bg-border",
                      )}
                    />
                  )}
                </div>

                {/* マイルストーン本体 */}
                <Collapsible
                  open={isOpen}
                  onOpenChange={(open) => toggleMilestone(milestone.id, open)}
                  className="mb-3 min-w-0 flex-1"
                >
                  {/* ヘッダー行 */}
                  <div className={cn(
                    "group flex items-center gap-1.5 rounded-md py-1 hover:bg-accent/40",
                    selectedMilestoneId === milestone.id && "bg-accent/40",
                  )}>
                    <button
                      type="button"
                      {...dragAttrs}
                      {...dragListeners}
                      className="cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label="ドラッグして並べ替え"
                    >
                      <GripVertical className="size-4" />
                    </button>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        toggleMilestone(milestone.id, !isOpen);
                        onSelectMilestone(milestone.id);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMsCtxMenu({ id: milestone.id, label: milestone.label, x: e.clientX, y: e.clientY });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleMilestone(milestone.id, !isOpen);
                          onSelectMilestone(milestone.id);
                        }
                      }}
                      className="flex flex-1 cursor-pointer select-none items-center gap-1.5"
                    >
                      {isEditingName ? (
                        <Input
                          autoFocus
                          value={editingMilestoneName}
                          onChange={(e) => setEditingMilestoneName(e.target.value)}
                          onBlur={() => commitMilestoneEdit(milestone.id)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") { e.preventDefault(); commitMilestoneEdit(milestone.id); }
                            if (e.key === "Escape") cancelMilestoneEdit();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => e.stopPropagation()}
                          className="h-6 flex-1 bg-card py-0 text-sm font-medium"
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex-1 px-0.5 text-sm font-medium",
                            !isCompleted && !isCurrent && "text-muted-foreground",
                          )}
                        >
                          {milestone.label}
                        </span>
                      )}

                      {milestone.dueDate && (() => {
                        const label = getDaysLabel(milestone.dueDate!);
                        if (!label) return null;
                        const overdue = label.includes("超過");
                        const today = label === "今日";
                        return (
                          <span
                            title={milestone.dueDate!}
                            className={cn(
                              "shrink-0 text-[11px] tabular-nums",
                              overdue ? "text-destructive" : today ? "font-medium text-primary" : "text-muted-foreground",
                            )}
                          >
                            {label}
                          </span>
                        );
                      })()}

                      <Badge
                        variant={getMilestoneBadgeVariant(milestone.id)}
                        size="xs"
                        className="shrink-0"
                      >
                        {doneCount}/{actions.length}
                      </Badge>

                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                          isOpen && "rotate-180",
                        )}
                      />
                    </div>
                  </div>

                  {/* 進捗バー */}
                  {actions.length > 0 && (
                    <div className="mb-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          isCompleted || isCurrent
                            ? "bg-primary"
                            : "bg-muted-foreground/30",
                        )}
                        style={{
                          width: `${(doneCount / actions.length) * 100}%`,
                        }}
                      />
                    </div>
                  )}

                  <CollapsibleContent>
                    <MilestoneDropZone milestoneId={milestone.id}>
                      <div className="flex flex-col gap-2 pb-2 pt-1">
                        {actions.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">
                            アクションはまだありません（ここにドロップ可）
                          </p>
                        ) : (
                          <SortableContext
                            items={actions.map((a) => a.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {actions.map((action) => (
                              <SortableActionRow
                                key={action.id}
                                action={action}
                                milestoneId={milestone.id}
                                editingActionId={editingActionId}
                                editingText={editingText}
                                subtaskInputs={subtaskInputs}
                                onToggle={() => onToggleAction(action.id)}
                                onStartEdit={() => startEdit(action.id, action.text)}
                                onEditChange={setEditingText}
                                onCommitEdit={() => commitEdit(action.id)}
                                onCancelEdit={cancelEdit}
                                onDelete={() => onDeleteAction(action.id)}
                                onToggleSubtaskInput={() =>
                                  setSubtaskInputs((prev) =>
                                    prev[action.id] !== undefined
                                      ? (({ [action.id]: _, ...rest }) => rest)(prev)
                                      : { ...prev, [action.id]: "" },
                                  )
                                }
                                onSubtaskInputChange={(v) =>
                                  setSubtaskInputs((prev) => ({
                                    ...prev,
                                    [action.id]: v,
                                  }))
                                }
                                onAddSubtask={(text) => {
                                  onAddSubtask(action.id, text);
                                  setSubtaskInputs((prev) => ({
                                    ...prev,
                                    [action.id]: "",
                                  }));
                                }}
                                onToggleSubtask={(subtaskId) =>
                                  onToggleSubtask(action.id, subtaskId)
                                }
                                onDeleteSubtask={(subtaskId) =>
                                  onDeleteSubtask(action.id, subtaskId)
                                }
                              />
                            ))}
                          </SortableContext>
                        )}

                        {/* アクション追加 */}
                        <div className="flex gap-2 pt-1">
                          <Input
                            value={getNewActionText(milestone.id)}
                            onChange={(e) =>
                              setNewActionTexts((prev) => ({
                                ...prev,
                                [milestone.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddAction(milestone.id);
                            }}
                            placeholder="アクションを追加..."
                            className="h-7 flex-1 bg-card text-xs"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddAction(milestone.id)}
                            disabled={!getNewActionText(milestone.id).trim()}
                            className="h-7 px-2 text-xs"
                          >
                            <Plus />
                            追加
                          </Button>
                        </div>
                      </div>
                    </MilestoneDropZone>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              )}
              </SortableMilestoneWrapper>
            );
          })}
          </SortableContext>

          {/* マイルストーン追加 */}
          {showAddMilestone ? (
            <div className="ml-8 flex gap-2 pt-1">
              <Input
                autoFocus
                value={newMilestoneName}
                onChange={(e) => setNewMilestoneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMilestone();
                  if (e.key === "Escape") {
                    setShowAddMilestone(false);
                    setNewMilestoneName("");
                  }
                }}
                placeholder="マイルストーン名..."
                className="h-7 flex-1 bg-card text-xs"
              />
              <Button
                size="sm"
                onClick={handleAddMilestone}
                disabled={!newMilestoneName.trim()}
                className="h-7 px-2 text-xs"
              >
                追加
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => { setShowAddMilestone(false); setNewMilestoneName(""); }}
                className="size-7 text-muted-foreground"
              >
                <X />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddMilestone(true)}
              className="ml-8 flex items-center gap-1.5 rounded-md px-1 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              マイルストーンを追加
            </button>
          )}
        </div>
      </ScrollArea>

      {/* マイルストーン右クリックコンテキストメニュー */}
      {msCtxMenu && (() => {
        const menuW = 160;
        const menuH = 100;
        const x = Math.min(msCtxMenu.x, window.innerWidth - menuW - 8);
        const y = Math.min(msCtxMenu.y, window.innerHeight - menuH - 8);
        return (
          <div
            ref={msCtxRef}
            className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg"
            style={{ left: x, top: y }}
          >
            <button
              type="button"
              onClick={() => {
                setMsCtxMenu(null);
                startMilestoneEdit(msCtxMenu.id, msCtxMenu.label);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              名前を変更
            </button>
            <button
              type="button"
              onClick={() => {
                setMsCtxMenu(null);
                setDeletingMilestone({ id: msCtxMenu.id, label: msCtxMenu.label });
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-accent hover:text-destructive"
            >
              削除
            </button>
          </div>
        );
      })()}

      {/* マイルストーン削除確認ダイアログ */}
      <DeleteConfirmDialog
        open={deletingMilestone !== null}
        onOpenChange={(open) => { if (!open) setDeletingMilestone(null); }}
        title="マイルストーンを削除"
        itemName={deletingMilestone?.label ?? ""}
        onConfirm={() => {
          if (deletingMilestone) onDeleteMilestone(deletingMilestone.id);
          setDeletingMilestone(null);
        }}
      />
    </div>
  );
}
