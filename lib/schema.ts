/**
 * AIコンサルドメインの Zod スキーマと派生型。
 * UI コンポーネントはここから型をインポートする。
 */

import { z } from "zod";

// ===== メモ種別・ステータス・優先度 =====

export const noteKindSchema = z.enum(["Todo", "アイデア", "議論余地", "課題", "メモ"]);
export type NoteKind = z.infer<typeof noteKindSchema>;

export const noteStatusSchema = z.enum(["未解決", "対応中", "解決済み"]);
export type NoteStatus = z.infer<typeof noteStatusSchema>;

export const notePrioritySchema = z.enum(["urgent", "high", "normal", "low"]);
export type NotePriority = z.infer<typeof notePrioritySchema>;
export const PRIORITY_ORDER = notePrioritySchema.options;

// ===== メモフォルダ =====

export const noteFolderSortKeySchema = z.enum(["date-desc", "date-asc", "priority-desc", "priority-asc"]);
export type NoteFolderSortKey = z.infer<typeof noteFolderSortKeySchema>;

export const noteFolderSchema = z.object({
  id: z.string(),
  label: z.string(),
  sort: noteFolderSortKeySchema.default("date-desc"),
  filterKind: noteKindSchema.nullable().default(null),
  filterStatus: noteStatusSchema.nullable().default(null),
});
export type NoteFolder = z.infer<typeof noteFolderSchema>;

// ===== マイルストーン =====

export const milestoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  dueDate: z.string().nullable().default(null),
  description: z.string().default(""),
});
export type Milestone = z.infer<typeof milestoneSchema>;

/** デフォルトマイルストーン（AIコンサルドメイン用）。新規案件・未移行データに使用。 */
export const DEFAULT_MILESTONES: Milestone[] = [
  { id: "hearing", label: "ヒアリング", dueDate: null, description: "" },
  { id: "proposal", label: "提案中", dueDate: null, description: "" },
  { id: "development", label: "開発中", dueDate: null, description: "" },
  { id: "delivery", label: "納品済み", dueDate: null, description: "" },
  { id: "maintenance", label: "保守", dueDate: null, description: "" },
];

/** 後方互換: フェーズキーは文字列。 */
export type StatusKey = string;

/** 全マイルストーン完了を表す特殊ステータス値。 */
export const COMPLETED_STATUS = "completed";

/** デフォルトマイルストーンの ID 順（後方互換・デフォルトソート）。 */
export const STATUS_ORDER: readonly string[] = DEFAULT_MILESTONES.map((m) => m.id);

// ===== フリーメモ =====

export const subtaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean().default(false),
});
export type Subtask = z.infer<typeof subtaskSchema>;

// ===== Google Calendar =====

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
};

export const noteSchema = z.object({
  id: z.string(),
  date: z.string(),
  endDate: z.string().default(""),
  time: z.string().default(""),
  kind: noteKindSchema,
  status: noteStatusSchema,
  phase: z.string().nullable().default(null),
  priority: notePrioritySchema.default("normal"),
  isAction: z.boolean().default(false),
  done: z.boolean().default(false),
  subtasks: z.array(subtaskSchema).default([]),
  title: z.string().default(""),
  text: z.string(),
  assignee: z.string().default(""),
  createdBy: z.string().default(""),
  googleEventId: z.string().nullable().default(null),
});
export type Note = z.infer<typeof noteSchema>;

// ===== プロジェクトメンバー =====

export const projectMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

// ===== 招待中メンバー =====

export const pendingInviteSchema = z.object({
  id: z.string(),
  email: z.string(),
});
export type PendingInvite = z.infer<typeof pendingInviteSchema>;

// ===== 案件 =====

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  clients: z.array(z.string()).default([]),
  status: z.string(),
  archived: z.boolean().default(false),
  milestones: z.array(milestoneSchema).default(DEFAULT_MILESTONES),
  noteFolders: z.array(noteFolderSchema).default([]),
  notes: z.array(noteSchema),
  members: z.array(z.string()).default([]),
  ownerId: z.string().default(""),
  projectMembers: z.array(projectMemberSchema).default([]),
  pendingInvites: z.array(pendingInviteSchema).default([]),
});
export type Project = z.infer<typeof projectSchema>;

// ===== ワークスペースメタ =====

export const workspaceSchema = z.object({
  name: z.string(),
  icon: z.string(),
});

export const projectsSchema = z.array(projectSchema);

/** 個人タスク専用プロジェクトの固定 ID。Pane1 ダッシュボードで使用。 */
export const PERSONAL_PROJECT_ID = "__personal__";

/** 集計・表示用: カレンダー / 日別 Todo リストのアイテム型。 */
export type CalendarTodo = Note & { projectId: string; projectName: string };
