/**
 * ワークスペースAIアシスタント（相談＆整理）の出力スキーマ（ハーネスの中核）。
 *
 * AI は「会話での相談対応」と「自然文の意味理解・分類」を担い、形式の正しさ・
 * 採番・日付・既定値はコード側が保証する。このファイルは「AI に許す出力の形」を
 * 固定し、検証に通らないものを弾く。
 *
 * AIエンジンは Claude Agent SDK の query()（サブスク枠／APIキー不使用）。構造化出力APIは
 * 使わず、AIにJSONで出力させて safeParse する。そのため欠落フィールドを安全に補完できるよう
 * 任意項目には default を与える（reply・kind・text・label・tempId は必須）。
 */

import { z } from "zod";
import { noteKindSchema, notePrioritySchema } from "@/lib/schema";

/** チャット1往復。/api/assistant に渡す会話履歴の要素。 */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** AI が新規に提案するマイルストーン。 */
export const proposedMilestoneSchema = z.object({
  tempId: z.string(),
  label: z.string(),
  dueDate: z.string().nullable().default(null),
});
export type ProposedMilestone = z.infer<typeof proposedMilestoneSchema>;

/** 登録候補アイテム（5種別メモ or マイルストーン配下todo）。 */
export const proposedItemSchema = z.object({
  kind: noteKindSchema,
  title: z.string().default(""),
  text: z.string(),
  milestoneRef: z.string().nullable().default(null),
  subtasks: z.array(z.string()).default([]),
  priority: notePrioritySchema.default("normal"),
  isAction: z.boolean().default(false),
  date: z.string().default(""),
});
export type ProposedItem = z.infer<typeof proposedItemSchema>;

/** プロジェクト概要の更新案。 */
export const proposedProjectUpdateSchema = z.object({
  description: z.string(),
});
export type ProposedProjectUpdate = z.infer<typeof proposedProjectUpdateSchema>;

/** 既存メモ/todo の再配置操作。reassign=別マイルストーンへ / toMemo=外してメモ化。 */
export const itemChangeActionSchema = z.enum(["reassign", "toMemo"]);
export type ItemChangeAction = z.infer<typeof itemChangeActionSchema>;

/**
 * AI が提案する「既存項目の構成変更」。進捗が停滞しているときのマイルストーン再構成に使う。
 * noteId は文脈に出した既存 Note の id を参照する。
 */
export const proposedItemChangeSchema = z.object({
  noteId: z.string(),
  noteTitle: z.string().default(""),
  action: itemChangeActionSchema.default("reassign"),
  targetMilestone: z.string().nullable().default(null),
  reason: z.string().default(""),
});
export type ProposedItemChange = z.infer<typeof proposedItemChangeSchema>;

/** アシスタントの1ターン応答（会話文 ＋ 任意の登録提案・概要更新案）。 */
export const assistantTurnSchema = z.object({
  reply: z.string(),
  milestones: z.array(proposedMilestoneSchema).default([]),
  items: z.array(proposedItemSchema).default([]),
  itemChanges: z.array(proposedItemChangeSchema).default([]),
  projectUpdate: proposedProjectUpdateSchema.nullable().default(null),
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;
