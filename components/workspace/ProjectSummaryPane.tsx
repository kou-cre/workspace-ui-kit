"use client";

import { useState } from "react";
import { Check, ArrowRight, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDaysLabel } from "@/lib/computed/profile";
import { type Project, PERSONAL_PROJECT_ID, COMPLETED_STATUS } from "@/lib/schema";

type HealthStatus = "green" | "yellow" | "red" | "none";

function getProjectHealth({
  allActionsCount,
  overdueCount,
  milestoneOverdue,
  milestoneSoon,
  soonCount,
  pendingCount,
  noDueDateCount,
}: {
  allActionsCount: number;
  overdueCount: number;
  milestoneOverdue: boolean;
  milestoneSoon: boolean;
  soonCount: number;
  pendingCount: number;
  noDueDateCount: number;
}): HealthStatus {
  if (allActionsCount === 0) return "none";
  if (overdueCount >= 2 || milestoneOverdue || soonCount >= 3) return "red";
  const allPendingUndated = pendingCount > 0 && noDueDateCount === pendingCount;
  if (overdueCount === 1 || soonCount > 0 || allPendingUndated || milestoneSoon) return "yellow";
  return "green";
}

function ProjectHealthBadge({ health }: { health: HealthStatus }) {
  if (health === "none") return null;
  const map = {
    green:  { label: "順調",   dot: "bg-green-500",   text: "text-green-700",   bg: "bg-green-500/10"   },
    yellow: { label: "注意",   dot: "bg-yellow-400",  text: "text-yellow-600",  bg: "bg-yellow-400/10"  },
    red:    { label: "要対応", dot: "bg-destructive",  text: "text-destructive", bg: "bg-destructive/10" },
  } as const;
  const { label, dot, text, bg } = map[health];
  return (
    <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", bg, text)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}

type DueState = "overdue" | "soon" | "normal" | null;

function getDueState(label: string | null): DueState {
  if (!label) return null;
  if (label.includes("超過")) return "overdue";
  if (label === "今日") return "soon";
  const m = label.match(/あと (\d+) 日/);
  if (m && Number(m[1]) <= 7) return "soon";
  return "normal";
}

function computeProjectHealth(project: Project): HealthStatus {
  const allActions = project.notes.filter((n) => n.isAction);
  const pendingActions = allActions.filter((n) => !n.done);
  const overdueActions = pendingActions.filter(
    (n) => n.kind !== "アイデア" && n.date && (getDaysLabel(n.date)?.includes("超過") ?? false),
  );
  const noDueDateCount = pendingActions.filter((n) => !n.date).length;
  const soonCount = pendingActions.filter((n) => {
    if (!n.date) return false;
    return getDueState(getDaysLabel(n.date)) === "soon";
  }).length;
  const currentMilestone = project.milestones.find((m) => m.id === project.status);
  const currentMilestoneActions = currentMilestone
    ? allActions.filter((a) => a.phase === currentMilestone.id)
    : [];
  const currentMilestoneAllDone =
    currentMilestoneActions.length > 0 &&
    currentMilestoneActions.every((a) => a.done);
  const milestoneDueLabel =
    currentMilestone?.dueDate && !currentMilestoneAllDone
      ? getDaysLabel(currentMilestone.dueDate)
      : null;
  const milestoneDueState = getDueState(milestoneDueLabel);
  return getProjectHealth({
    allActionsCount: allActions.length,
    overdueCount: overdueActions.length,
    milestoneOverdue: milestoneDueState === "overdue",
    milestoneSoon: milestoneDueState === "soon",
    soonCount,
    pendingCount: pendingActions.length,
    noDueDateCount,
  });
}

const HEALTH_ORDER: Record<HealthStatus, number> = { red: 0, yellow: 1, green: 2, none: 3 };

type Props = {
  projects: Project[];
  activeTab: "calendar" | "summary";
  onTabChange: (tab: "calendar" | "summary") => void;
  onSelectProject: (id: string) => void;
};

export function ProjectSummaryPane({ projects, activeTab, onTabChange, onSelectProject }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<"all" | "mine" | "others">("all");
  const activeProjects = projects.filter((p) => !p.archived && p.id !== PERSONAL_PROJECT_ID);

  const filteredProjects = activeProjects
    .filter((p) => {
      if (activeTab !== "summary") return true;
      if (activeSubTab === "mine") return p.clients.length === 0;
      if (activeSubTab === "others") return p.clients.length > 0;
      return true;
    })
    .sort((a, b) => HEALTH_ORDER[computeProjectHealth(a)] - HEALTH_ORDER[computeProjectHealth(b)]);

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col border-r border-border bg-canvas">
      {/* ヘッダー */}
      <div className="shrink-0 border-b border-border">
        <div className="flex h-12 items-center gap-2 px-4">
          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => onTabChange("calendar")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === "calendar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              カレンダー
            </button>
            <button
              type="button"
              onClick={() => onTabChange("summary")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === "summary"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              プロジェクトサマリー
            </button>
          </div>
          <span className="text-sm font-medium">
            {activeTab === "summary" ? filteredProjects.length : activeProjects.length} 件
          </span>
        </div>
        {activeTab === "summary" && (
          <div className="flex items-center gap-1 px-4 pb-2">
            {(["all", "mine", "others"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveSubTab(tab)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  activeSubTab === tab
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "all" ? "全体" : tab === "mine" ? "マイプロジェクト" : "それ以外"}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-3 p-4">
          {filteredProjects.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              アクティブなプロジェクトがありません
            </p>
          )}
          {filteredProjects.map((project) => {
            const allActions = project.notes.filter((n) => n.isAction);
            const doneActions = allActions.filter((n) => n.done);
            const pendingActions = allActions.filter((n) => !n.done);
            const overdueActions = pendingActions.filter(
              (n) => n.kind !== "アイデア" && n.date && (getDaysLabel(n.date)?.includes("超過") ?? false),
            );
            const noDueDateCount = pendingActions.filter((n) => !n.date).length;

            const urgentActions = pendingActions
              .filter((n) => {
                if (!n.date || n.kind === "アイデア") return false;
                const state = getDueState(getDaysLabel(n.date));
                return state === "overdue" || state === "soon";
              })
              .sort((a, b) => a.date!.localeCompare(b.date!));

            const currentMilestone = project.milestones.find((m) => m.id === project.status);
            const currentMilestoneActions = currentMilestone
              ? allActions.filter((a) => a.phase === currentMilestone.id)
              : [];
            const currentMilestoneAllDone =
              currentMilestoneActions.length > 0 &&
              currentMilestoneActions.every((a) => a.done);
            const milestoneDueLabel =
              currentMilestone?.dueDate && !currentMilestoneAllDone
                ? getDaysLabel(currentMilestone.dueDate)
                : null;
            const milestoneDueState = getDueState(milestoneDueLabel);

            const openNotes = project.notes.filter(
              (n) => !n.isAction && n.status !== "解決済み",
            );
            const issueCount = openNotes.filter((n) => n.kind === "課題").length;
            const discussionCount = openNotes.filter((n) => n.kind === "議論余地").length;

            const soonCount = urgentActions.filter(
              (n) => getDueState(getDaysLabel(n.date!)) === "soon",
            ).length;
            const health = getProjectHealth({
              allActionsCount: allActions.length,
              overdueCount: overdueActions.length,
              milestoneOverdue: milestoneDueState === "overdue",
              milestoneSoon: milestoneDueState === "soon",
              soonCount,
              pendingCount: pendingActions.length,
              noDueDateCount,
            });

            const currentIdx =
              project.status === COMPLETED_STATUS
                ? project.milestones.length
                : project.milestones.findIndex((m) => m.id === project.status);

            // 残フェーズ = 現フェーズ含む残りマイルストーン数
            const remainingPhases =
              project.status === COMPLETED_STATUS
                ? 0
                : currentIdx === -1
                ? project.milestones.length
                : project.milestones.length - currentIdx;

            const milestoneProgress = project.milestones.map((m) => {
              const acts = project.notes.filter((n) => n.isAction && n.phase === m.id);
              return { done: acts.filter((a) => a.done).length, total: acts.length };
            });

            const hasAlert = health === "red" || health === "yellow";

            return (
              <div
                key={project.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                {/* 案件名 + クライアント */}
                <div>
                  <p className="text-base font-semibold leading-tight">{project.name}</p>
                  {project.clients.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {project.clients.join(", ")}
                    </p>
                  )}
                </div>

                {/* タスク集計 */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    累計完了{" "}
                    <span className="font-medium text-foreground">{doneActions.length}件</span>
                  </span>
                  <span className="text-border">|</span>
                  <span>
                    残フェーズ{" "}
                    <span className={cn("font-medium", remainingPhases > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {remainingPhases}件
                    </span>
                  </span>
                  <span className="text-border">|</span>
                  <span>
                    残Todo{" "}
                    <span className={cn("font-medium", pendingActions.length > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {pendingActions.length}件
                    </span>
                  </span>
                  {noDueDateCount > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <span>
                        期限未定{" "}
                        <span className="font-medium text-muted-foreground">{noDueDateCount}件</span>
                      </span>
                    </>
                  )}
                  {issueCount > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <span>
                        課題{" "}
                        <span className="font-medium text-destructive">{issueCount}件</span>
                      </span>
                    </>
                  )}
                  {discussionCount > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <span>
                        議論余地{" "}
                        <span className="font-medium text-chart-2">{discussionCount}件</span>
                      </span>
                    </>
                  )}
                </div>

                {/* ─── アラートセクション（近接グループ）─── */}
                {hasAlert && (
                  <div
                    className={cn(
                      "flex flex-col gap-2 rounded-lg px-3 py-2.5",
                      health === "red" ? "bg-destructive/8" : "bg-yellow-400/10",
                    )}
                  >
                    {/* バッジ + 判定理由（全条件を列挙） */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <ProjectHealthBadge health={health} />
                      {overdueActions.length > 0 && (
                        <span className="text-xs font-medium text-destructive">
                          期限超過 {overdueActions.length}件
                        </span>
                      )}
                      {soonCount > 0 && (
                        <span className="text-xs font-medium text-yellow-600">
                          期限切迫 {soonCount}件
                        </span>
                      )}
                      {milestoneDueState === "overdue" && (
                        <span className="text-xs font-medium text-destructive">
                          マイルストーン超過
                        </span>
                      )}
                      {milestoneDueState === "soon" && (
                        <span className="text-xs font-medium text-yellow-600">
                          マイルストーン切迫
                        </span>
                      )}
                      {urgentActions.length === 0 && pendingActions.length > 0 && noDueDateCount === pendingActions.length && (
                        <span className="text-xs font-medium text-yellow-600">
                          期日未設定のみ
                        </span>
                      )}
                    </div>

                    {/* タスクリスト */}
                    {urgentActions.map((action) => {
                      const label = getDaysLabel(action.date!);
                      const state = getDueState(label);
                      return (
                        <div key={action.id} className="flex items-center gap-2">
                          <CircleDot
                            className={cn(
                              "size-3.5 shrink-0",
                              state === "overdue" ? "text-destructive" : "text-yellow-600",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs">{action.title || action.text || "（無題）"}</span>
                          {label && (
                            <span
                              className={cn(
                                "shrink-0 text-[11px] tabular-nums font-medium",
                                state === "overdue" ? "text-destructive" : "text-yellow-600",
                              )}
                            >
                              {label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* マイルストーンステッパー */}
                {project.milestones.length > 0 && (
                  <MilestoneStepper
                    milestones={project.milestones}
                    currentIdx={currentIdx}
                    currentDueLabel={milestoneDueLabel}
                    currentDueState={milestoneDueState}
                    milestoneProgress={milestoneProgress}
                  />
                )}

                {/* フッター */}
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                  {health === "green" ? <ProjectHealthBadge health="green" /> : <div />}
                  <button
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className="flex items-center gap-0.5 text-xs text-primary hover:underline"
                  >
                    プロジェクト詳細を見る
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

type MilestoneProgress = { done: number; total: number };

function MilestoneStepper({
  milestones,
  currentIdx,
  currentDueLabel,
  currentDueState,
  milestoneProgress,
}: {
  milestones: { id: string; label: string }[];
  currentIdx: number;
  currentDueLabel: string | null;
  currentDueState: DueState;
  milestoneProgress: MilestoneProgress[];
}) {
  const getMilestoneFill = (idx: number): number => {
    if (idx < 0 || idx >= milestoneProgress.length) return 0;
    const prog = milestoneProgress[idx];
    if (idx > currentIdx) return 0;
    if (prog.total === 0) return idx < currentIdx ? 1 : 0;
    return prog.done / prog.total;
  };

  return (
    <div className="flex items-start">
      {milestones.map((m, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isLast = i === milestones.length - 1;

        // 連続するゲージバーになるよう左右それぞれのコネクター埋め率を計算
        // セグメント i-1→i の総埋め率 = getMilestoneFill(i-1)
        // そのセグメントはノードi-1の右コネクター（前半）＋ノードiの左コネクター（後半）で構成
        const prevFill = getMilestoneFill(i - 1);
        const selfFill = getMilestoneFill(i);
        const leftConnFill = i === 0 ? 0 : Math.max((prevFill - 0.5) * 2, 0);
        const rightConnFill = isLast ? 0 : Math.min(selfFill * 2, 1);

        return (
          <div key={m.id} className="flex flex-1 flex-col items-center gap-1 min-w-0">
            <div className="flex h-7 w-full items-center">
              {/* 左コネクター */}
              <div className={cn("h-0.5 flex-1 relative overflow-hidden", i === 0 ? "invisible" : "bg-border")}>
                {i > 0 && leftConnFill > 0 && (
                  <div className="absolute inset-y-0 left-0 bg-chart-2" style={{ width: `${leftConnFill * 100}%` }} />
                )}
              </div>
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full font-bold transition-colors",
                  isDone
                    ? "size-6 bg-chart-2 text-primary-foreground text-[9px]"
                    : isCurrent
                    ? "size-7 bg-primary text-primary-foreground text-[11px] ring-2 ring-primary/30 ring-offset-1"
                    : "size-5 border border-border bg-background text-muted-foreground text-[9px]",
                )}
              >
                {isDone ? <Check className="size-3 stroke-[3]" /> : i + 1}
              </div>
              {/* 右コネクター */}
              <div className={cn("h-0.5 flex-1 relative overflow-hidden", isLast ? "invisible" : "bg-border")}>
                {!isLast && rightConnFill > 0 && (
                  <div className="absolute inset-y-0 left-0 bg-chart-2" style={{ width: `${rightConnFill * 100}%` }} />
                )}
              </div>
            </div>
            <span
              className={cn(
                "w-full text-center text-[10px] leading-tight truncate px-0.5",
                isDone ? "text-muted-foreground/60" : isCurrent ? "text-foreground font-semibold" : "text-muted-foreground",
              )}
            >
              {m.label}
            </span>
            {isCurrent && currentDueLabel && (
              <span
                className={cn(
                  "text-[10px] tabular-nums font-medium leading-none",
                  currentDueState === "overdue"
                    ? "text-destructive"
                    : currentDueState === "soon"
                    ? "text-chart-2"
                    : "text-muted-foreground",
                )}
              >
                {currentDueLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
