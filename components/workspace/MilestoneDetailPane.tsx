"use client";

import { type Milestone, type Note } from "@/lib/schema";
import { getDaysLabel } from "@/lib/computed/profile";
import { cn } from "@/lib/utils";
import { InlineDateField } from "@/components/primitives/InlineDateField";
import { InlineFieldRow } from "@/components/primitives/InlineFieldRow";
import { InlineTextField } from "@/components/primitives/InlineTextField";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Pane4Toggle } from "@/components/workspace/Pane4Toggle";

type MilestoneDetailPaneProps = {
  milestone: Milestone;
  actions: Note[];
  pane4Open: boolean;
  onTogglePane4: () => void;
  onUpdateLabel: (label: string) => void;
  onUpdateDueDate: (date: string | null) => void;
};

export function MilestoneDetailPane({
  milestone,
  actions,
  pane4Open,
  onTogglePane4,
  onUpdateLabel,
  onUpdateDueDate,
}: MilestoneDetailPaneProps) {
  const doneCount = actions.filter((a) => a.done).length;
  const pct =
    actions.length === 0 ? 0 : Math.round((doneCount / actions.length) * 100);

  const daysLabel = milestone.dueDate ? getDaysLabel(milestone.dueDate) : null;
  const isOverdue = daysLabel?.includes("超過") ?? false;
  const isToday = daysLabel === "今日";

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <p className="text-sm font-medium text-muted-foreground">
          マイルストーン詳細
        </p>
        <Pane4Toggle open={pane4Open} onToggle={onTogglePane4} />
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 py-4">
          <dl className="flex flex-col gap-3 text-sm">
            <InlineFieldRow label="名前">
              <InlineTextField
                value={milestone.label}
                onSave={onUpdateLabel}
                ariaLabel="マイルストーン名"
                placeholder="名前を入力..."
              />
            </InlineFieldRow>

            <InlineFieldRow label="期日">
              <InlineDateField
                value={milestone.dueDate ?? ""}
                onSave={(v) => onUpdateDueDate(v || null)}
                ariaLabel="マイルストーン期日"
              />
            </InlineFieldRow>
          </dl>

          {daysLabel && (
            <div
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                isOverdue
                  ? "bg-destructive/10 text-destructive"
                  : isToday
                    ? "bg-primary/10 font-medium text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {daysLabel}
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>アクション進捗</span>
              <span className="tabular-nums">
                {doneCount}/{actions.length}（{pct}%）
              </span>
            </div>
            {actions.length > 0 ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                アクションはまだありません
              </p>
            )}
          </div>

          {actions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {actions.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      a.done ? "bg-muted-foreground" : "bg-primary",
                    )}
                  />
                  <span
                    className={cn(
                      "leading-relaxed",
                      a.done && "text-muted-foreground line-through",
                    )}
                  >
                    {a.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
