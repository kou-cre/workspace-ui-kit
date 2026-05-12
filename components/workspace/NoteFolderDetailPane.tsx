"use client";

import {
  type NoteFolder,
  type NoteKind,
  type NoteStatus,
  type NoteFolderSortKey,
  noteKindSchema,
  noteStatusSchema,
} from "@/lib/schema";
import { InlineFieldRow } from "@/components/primitives/InlineFieldRow";
import { InlineSelectField } from "@/components/primitives/InlineSelectField";
import { InlineTextField } from "@/components/primitives/InlineTextField";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Pane4Toggle } from "@/components/workspace/Pane4Toggle";

const KIND_OPTIONS = ["すべて", ...noteKindSchema.options];
const STATUS_OPTIONS = ["すべて", ...noteStatusSchema.options];

const SORT_LABELS: Record<NoteFolderSortKey, string> = {
  "date-desc": "日付（新しい順）",
  "date-asc": "日付（古い順）",
  "priority-desc": "優先度（高い順）",
  "priority-asc": "優先度（低い順）",
};
const SORT_OPTIONS = Object.values(SORT_LABELS);

type NoteFolderDetailPaneProps = {
  folder: NoteFolder;
  noteCount: number;
  pane4Open: boolean;
  onTogglePane4: () => void;
  onUpdateFolder: (updates: Partial<NoteFolder>) => void;
};

export function NoteFolderDetailPane({
  folder,
  noteCount,
  pane4Open,
  onTogglePane4,
  onUpdateFolder,
}: NoteFolderDetailPaneProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      {/* ヘッダー */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <p className="text-sm font-medium text-muted-foreground">メモホルダー詳細</p>
        <Pane4Toggle open={pane4Open} onToggle={onTogglePane4} />
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 py-4">
          <dl className="flex flex-col gap-3 text-sm">
            <InlineFieldRow label="名前">
              <InlineTextField
                value={folder.label}
                onSave={(v) => onUpdateFolder({ label: v })}
                ariaLabel="フォルダ名"
                placeholder="フォルダ名を入力..."
              />
            </InlineFieldRow>
          </dl>

          <p className="text-xs tabular-nums text-muted-foreground">{noteCount} 件のメモ</p>

          <Separator />

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">フィルター</p>
            <dl className="flex flex-col gap-3 text-sm">
              <InlineFieldRow label="種類">
                <InlineSelectField
                  value={folder.filterKind ?? "すべて"}
                  options={KIND_OPTIONS}
                  onSave={(v) =>
                    onUpdateFolder({ filterKind: v === "すべて" ? null : (v as NoteKind) })
                  }
                  ariaLabel="種類フィルター"
                />
              </InlineFieldRow>

              <InlineFieldRow label="ステータス">
                <InlineSelectField
                  value={folder.filterStatus ?? "すべて"}
                  options={STATUS_OPTIONS}
                  onSave={(v) =>
                    onUpdateFolder({ filterStatus: v === "すべて" ? null : (v as NoteStatus) })
                  }
                  ariaLabel="ステータスフィルター"
                />
              </InlineFieldRow>
            </dl>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">並べ替え</p>
            <InlineSelectField
              value={SORT_LABELS[folder.sort ?? "date-desc"]}
              options={SORT_OPTIONS}
              onSave={(v) => {
                const key = (Object.entries(SORT_LABELS) as [NoteFolderSortKey, string][]).find(
                  ([, label]) => label === v,
                )?.[0];
                if (key) onUpdateFolder({ sort: key });
              }}
              ariaLabel="並べ替え"
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
