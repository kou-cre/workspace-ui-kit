"use client";

/**
 * AssistantPane — ワークスペースAIアシスタント（相談＆整理）の右スライド Sheet。
 *
 * 会話トリアージ・オーバーレイ:
 *   - 1つのチャット欄で「業務相談」と「ブレインダンプの整理」を兼ねる
 *   - 毎ターン chatAssistant が { reply, milestones, items, projectUpdate } を返す
 *   - 提案があれば吹き出し直下にカード表示 → 採否チェック＋微修正 → [承認して登録] で反映
 *   - 会話はセッション揮発（DB保存しない）。確定した提案だけがワークスペースに残る
 *
 * 状態規律: idle（空）/ 送信中 / 提案あり / 登録中 / 登録済み / エラー。
 */

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Sparkles, ArrowUp, Plus, Check, Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { InlineTextField } from "@/components/primitives/InlineTextField";
import { InlineTextareaField } from "@/components/primitives/InlineTextareaField";
import { InlineDateField } from "@/components/primitives/InlineDateField";

import { commitBrainDump } from "@/lib/actions/brainDump";
import type {
  ChatTurn,
  ProposedItem,
  ProposedMilestone,
  ProposedProjectUpdate,
  AssistantTurn,
} from "@/lib/brainDump/schema";

type Accepted<T> = T & { accepted: boolean };

type ProposalState = {
  milestones: Accepted<ProposedMilestone>[];
  items: Accepted<ProposedItem>[];
  projectUpdate: Accepted<ProposedProjectUpdate> | null;
  committed: boolean;
};

type LogEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal: ProposalState | null;
};

type AssistantPaneProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  currentDescription: string;
  existingMilestones: { id: string; label: string }[];
  onCommitted: () => void;
};

function toProposal(turn: AssistantTurn): ProposalState | null {
  const has =
    turn.milestones.length > 0 || turn.items.length > 0 || turn.projectUpdate !== null;
  if (!has) return null;
  return {
    milestones: turn.milestones.map((m) => ({ ...m, accepted: true })),
    items: turn.items.map((it) => ({ ...it, accepted: true })),
    projectUpdate: turn.projectUpdate ? { ...turn.projectUpdate, accepted: true } : null,
    committed: false,
  };
}

function strip<T>(v: T & { accepted: boolean }): T {
  const rest = { ...v } as T & { accepted?: boolean };
  delete rest.accepted;
  return rest as T;
}

export function AssistantPane({
  open,
  onOpenChange,
  projectId,
  projectName,
  currentDescription,
  existingMilestones,
  onCommitted,
}: AssistantPaneProps) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [committingId, setCommittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, sending]);

  const updateProposal = (entryId: string, fn: (p: ProposalState) => ProposalState) =>
    setLog((cur) =>
      cur.map((e) => (e.id === entryId && e.proposal ? { ...e, proposal: fn(e.proposal) } : e)),
    );

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const nextLog: LogEntry[] = [
      ...log,
      { id: nanoid(), role: "user", text, proposal: null },
    ];
    setLog(nextLog);
    setInput("");
    setSending(true);
    try {
      const history: ChatTurn[] = nextLog.map((e) => ({ role: e.role, content: e.text }));
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, messages: history }),
      });
      const data = (await res.json()) as AssistantTurn | { error: string };
      if ("error" in data) throw new Error(data.error);
      setLog((cur) => [
        ...cur,
        { id: nanoid(), role: "assistant", text: data.reply, proposal: toProposal(data) },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  const commit = async (entryId: string) => {
    const entry = log.find((e) => e.id === entryId);
    const p = entry?.proposal;
    if (!p || p.committed) return;
    const milestones = p.milestones.filter((m) => m.accepted).map(strip<ProposedMilestone>);
    const items = p.items.filter((it) => it.accepted).map(strip<ProposedItem>);
    const projectUpdate =
      p.projectUpdate?.accepted ? strip<ProposedProjectUpdate>(p.projectUpdate) : null;
    if (milestones.length === 0 && items.length === 0 && !projectUpdate) return;

    setError(null);
    setCommittingId(entryId);
    try {
      await commitBrainDump({ projectId, milestones, items, projectUpdate });
      updateProposal(entryId, (pp) => ({ ...pp, committed: true }));
      onCommitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setCommittingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="gap-0">
        <SheetHeader className="flex-row items-center gap-2 border-b border-border">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle>AIアシスタント</SheetTitle>
            <SheetDescription className="truncate">
              {projectName}｜相談・整理してメモ/todo/マイルストーンへ
            </SheetDescription>
          </div>
          {log.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto mr-8"
              onClick={() => {
                setLog([]);
                setError(null);
              }}
            >
              <Plus className="size-3.5" />
              新規チャット
            </Button>
          )}
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {log.length === 0 && !sending && (
              <div className="flex flex-col gap-2 rounded-lg bg-card p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">何でも書いてください</p>
                <p>
                  業務の相談・壁打ちにも、頭の中のメモにも答えます。整理すべき内容は、メモ・todo・マイルストーン・概要更新の提案として出します（承認するまで登録されません）。
                </p>
              </div>
            )}

            {log.map((entry) =>
              entry.role === "user" ? (
                <div key={entry.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {entry.text}
                  </div>
                </div>
              ) : (
                <div key={entry.id} className="flex flex-col gap-3">
                  <div className="max-w-[90%] rounded-lg bg-card px-3 py-2 text-sm whitespace-pre-wrap text-card-foreground">
                    {entry.text}
                  </div>
                  {entry.proposal && (
                    <ProposalBlock
                      entryId={entry.id}
                      proposal={entry.proposal}
                      currentDescription={currentDescription}
                      existingMilestones={existingMilestones}
                      committing={committingId === entry.id}
                      onUpdate={updateProposal}
                      onCommit={commit}
                    />
                  )}
                </div>
              ),
            )}

            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                考えています…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="flex flex-col gap-2 border-t border-border p-4">
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="相談・メモを書く（⌘+Enterで送信）"
              aria-label="メッセージ"
              className="max-h-40 min-h-11 flex-1 bg-card"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey) &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              size="icon"
              aria-label="送信"
              disabled={!input.trim() || sending}
              onClick={() => void send()}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function targetLabel(
  ref: string | null,
  proposalMilestones: ProposedMilestone[],
  existing: { id: string; label: string }[],
): string {
  if (!ref) return "メモ欄";
  const fromNew = proposalMilestones.find((m) => m.tempId === ref);
  if (fromNew) return `新規: ${fromNew.label}`;
  const fromExisting = existing.find((m) => m.id === ref);
  if (fromExisting) return fromExisting.label;
  return "メモ欄";
}

function ProposalBlock({
  entryId,
  proposal,
  currentDescription,
  existingMilestones,
  committing,
  onUpdate,
  onCommit,
}: {
  entryId: string;
  proposal: ProposalState;
  currentDescription: string;
  existingMilestones: { id: string; label: string }[];
  committing: boolean;
  onUpdate: (entryId: string, fn: (p: ProposalState) => ProposalState) => void;
  onCommit: (entryId: string) => void;
}) {
  const acceptedCount =
    proposal.milestones.filter((m) => m.accepted).length +
    proposal.items.filter((it) => it.accepted).length +
    (proposal.projectUpdate?.accepted ? 1 : 0);

  const plainMilestones = proposal.milestones.map(strip<ProposedMilestone>);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      {/* 概要更新案 */}
      {proposal.projectUpdate && (
        <div className="flex gap-2">
          <Checkbox
            className="mt-0.5"
            checked={proposal.projectUpdate.accepted}
            disabled={proposal.committed}
            onCheckedChange={(v) =>
              onUpdate(entryId, (p) =>
                p.projectUpdate
                  ? { ...p, projectUpdate: { ...p.projectUpdate, accepted: Boolean(v) } }
                  : p,
              )
            }
            aria-label="概要更新を採用"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Badge variant="secondary">プロジェクト概要を更新</Badge>
            {currentDescription.trim() && (
              <p className="text-xs text-muted-foreground line-through">
                {currentDescription}
              </p>
            )}
            {proposal.committed ? (
              <p className="text-sm whitespace-pre-wrap">{proposal.projectUpdate.description}</p>
            ) : (
              <InlineTextareaField
                value={proposal.projectUpdate.description}
                ariaLabel="更新後の概要"
                onSave={(value) =>
                  onUpdate(entryId, (p) =>
                    p.projectUpdate
                      ? { ...p, projectUpdate: { ...p.projectUpdate, description: value } }
                      : p,
                  )
                }
              />
            )}
          </div>
        </div>
      )}

      {/* 新規マイルストーン */}
      {proposal.milestones.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">マイルストーン</p>
          {proposal.milestones.map((m, idx) => (
            <div key={m.tempId} className="flex gap-2">
              <Checkbox
                className="mt-0.5"
                checked={m.accepted}
                disabled={proposal.committed}
                onCheckedChange={(v) =>
                  onUpdate(entryId, (p) => ({
                    ...p,
                    milestones: p.milestones.map((x, i) =>
                      i === idx ? { ...x, accepted: Boolean(v) } : x,
                    ),
                  }))
                }
                aria-label="マイルストーンを採用"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {proposal.committed ? (
                  <p className="text-sm font-medium">{m.label}</p>
                ) : (
                  <InlineTextField
                    value={m.label}
                    ariaLabel="マイルストーン名"
                    onSave={(value) =>
                      onUpdate(entryId, (p) => ({
                        ...p,
                        milestones: p.milestones.map((x, i) =>
                          i === idx ? { ...x, label: value } : x,
                        ),
                      }))
                    }
                  />
                )}
                {!proposal.committed && (
                  <InlineDateField
                    value={m.dueDate ?? ""}
                    ariaLabel="期日"
                    onSave={(value) =>
                      onUpdate(entryId, (p) => ({
                        ...p,
                        milestones: p.milestones.map((x, i) =>
                          i === idx ? { ...x, dueDate: value || null } : x,
                        ),
                      }))
                    }
                  />
                )}
                {proposal.committed && m.dueDate && (
                  <p className="text-xs text-muted-foreground">期日 {m.dueDate}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 登録アイテム */}
      {proposal.items.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">メモ / todo</p>
          {proposal.items.map((it, idx) => (
            <div key={idx} className="flex gap-2">
              <Checkbox
                className="mt-0.5"
                checked={it.accepted}
                disabled={proposal.committed}
                onCheckedChange={(v) =>
                  onUpdate(entryId, (p) => ({
                    ...p,
                    items: p.items.map((x, i) =>
                      i === idx ? { ...x, accepted: Boolean(v) } : x,
                    ),
                  }))
                }
                aria-label="アイテムを採用"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{it.kind}</Badge>
                  <Badge variant="outline">
                    → {targetLabel(it.milestoneRef, plainMilestones, existingMilestones)}
                  </Badge>
                  {it.isAction && it.date && (
                    <span className="text-xs text-muted-foreground">{it.date}</span>
                  )}
                </div>
                {it.title && <p className="text-sm font-medium">{it.title}</p>}
                {proposal.committed ? (
                  <p className="text-sm whitespace-pre-wrap">{it.text}</p>
                ) : (
                  <InlineTextareaField
                    value={it.text}
                    ariaLabel="本文"
                    onSave={(value) =>
                      onUpdate(entryId, (p) => ({
                        ...p,
                        items: p.items.map((x, i) => (i === idx ? { ...x, text: value } : x)),
                      }))
                    }
                  />
                )}
                {it.subtasks.length > 0 && (
                  <ul className="flex flex-col gap-0.5 pl-1">
                    {it.subtasks.map((st, j) => (
                      <li key={j} className="text-xs text-muted-foreground">
                        ・{st}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Separator />
      {proposal.committed ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-4 text-primary" />
          登録しました
        </p>
      ) : (
        <Button
          size="sm"
          className="self-start"
          disabled={acceptedCount === 0 || committing}
          onClick={() => onCommit(entryId)}
        >
          {committing && <Loader2 className="size-3.5 animate-spin" />}
          承認して登録（{acceptedCount}件）
        </Button>
      )}
    </div>
  );
}
