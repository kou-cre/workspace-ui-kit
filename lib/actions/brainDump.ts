"use server";

/**
 * アシスタントの提案を保存する Server Action。
 *
 * AIの呼び出し自体は `app/api/assistant/route.ts`（Claude Agent SDK の query()／サブスク枠）が担い、
 * ここは「ユーザーが承認した提案だけをDBへ保存する」コミット処理のみを担う。
 */

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { createMilestone, updateMilestone } from "@/lib/actions/milestones";
import { createNote, createSubtask } from "@/lib/actions/notes";
import { updateProject } from "@/lib/actions/projects";
import type {
  ProposedItem,
  ProposedMilestone,
  ProposedProjectUpdate,
} from "@/lib/brainDump/schema";

/**
 * 承認された提案だけを保存する。
 * - 新規マイルストーンは nanoid で採番し tempId → 実ID を解決。
 * - items.milestoneRef は「tempId→実ID / 既存ID はそのまま / それ以外は null」に解決。
 * - projectUpdate があれば概要を更新。
 */
export async function commitBrainDump(input: {
  projectId: string;
  milestones: ProposedMilestone[];
  items: ProposedItem[];
  projectUpdate?: ProposedProjectUpdate | null;
}): Promise<{ milestoneIdMap: Record<string, string>; noteIds: string[] }> {
  const session = await auth();
  const createdBy = session?.user?.name ?? "";

  // 既存マイルストーンID（rejected な tempId を null に落とすため）
  const existing = await db.milestone.findMany({
    where: { projectId: input.projectId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));

  // 0) 概要更新（承認済みのみ）
  if (input.projectUpdate) {
    await updateProject(input.projectId, "description", input.projectUpdate.description);
  }

  // 1) 承認された新規マイルストーンを作成し tempId→実ID を作る
  const milestoneIdMap: Record<string, string> = {};
  for (const m of input.milestones) {
    const realId = nanoid();
    milestoneIdMap[m.tempId] = realId;
    await createMilestone(input.projectId, realId, m.label);
    if (m.dueDate) await updateMilestone(realId, "dueDate", m.dueDate);
  }

  // 2) 承認されたアイテムを Note として保存
  const noteIds: string[] = [];
  for (const it of input.items) {
    const id = nanoid();
    const ref = it.milestoneRef;
    const phase = ref
      ? (milestoneIdMap[ref] ?? (existingIds.has(ref) ? ref : null))
      : null;

    await createNote(input.projectId, {
      id,
      date: it.date,
      kind: it.kind,
      status: "未解決",
      phase,
      priority: it.priority,
      isAction: it.isAction,
      title: it.title,
      text: it.text,
      createdBy,
    });

    for (const st of it.subtasks) {
      if (st.trim()) await createSubtask(id, st);
    }
    noteIds.push(id);
  }

  revalidatePath("/");
  return { milestoneIdMap, noteIds };
}
