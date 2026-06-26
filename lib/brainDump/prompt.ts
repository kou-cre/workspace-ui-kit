/**
 * アシスタントのプロンプト構築・出力パース（サーバー側ユーティリティ）。
 *
 * AIエンジンは Claude Agent SDK の query()（サブスク枠／APIキー不使用）。構造化出力APIは
 * 使えないので、system prompt で JSON 形式を指定し、戻り値の文字列を assistantTurnSchema で
 * safeParse する。日付正規化など「コードで縛る」処理もここに集約する。
 */

import { format } from "date-fns";

import { assistantTurnSchema, type AssistantTurn } from "@/lib/brainDump/schema";
import { normalizeDate } from "@/lib/brainDump/normalizeDate";

const NOTE_TEXT_CLAMP = 80;

const KIND_LABEL: Record<string, string> = {
  Todo: "Todo",
  アイデア: "アイデア",
  議論余地: "議論余地",
  課題: "課題",
  メモ: "メモ",
};

type ContextProject = { name: string; description: string };
type ContextMilestone = { id: string; label: string; dueDate: string | null };
type ContextNote = {
  id: string;
  kind: string;
  status: string;
  title: string;
  text: string;
  phase: string | null;
  isAction: boolean;
  date: string;
};

/** プロジェクト概要・マイルストーン・既存メモを文脈ブロックに要約する。 */
export function buildContextBlock(
  todayIso: string,
  project: ContextProject,
  milestones: ContextMilestone[],
  notes: ContextNote[],
): string {
  const lines: string[] = [];
  lines.push(`- 今日: ${todayIso}`);
  lines.push(`- プロジェクト名: ${project.name}`);
  lines.push(`- プロジェクト概要: ${project.description.trim() || "（未設定）"}`);

  lines.push("- マイルストーン:");
  if (milestones.length === 0) {
    lines.push("  （なし）");
  } else {
    for (const m of milestones) {
      lines.push(`  - id="${m.id}" / ${m.label}${m.dueDate ? `（期日 ${m.dueDate}）` : ""}`);
    }
  }

  const summarizeNote = (n: ContextNote) => {
    const head = n.title.trim() || n.text.trim().slice(0, 24) || "（無題）";
    const body = n.text.trim().slice(0, NOTE_TEXT_CLAMP);
    const date = n.isAction && n.date ? ` @${n.date}` : "";
    return `    - noteId="${n.id}" [${KIND_LABEL[n.kind] ?? n.kind}/${n.status}] ${head}${date}${body && body !== head ? ` — ${body}` : ""}`;
  };

  lines.push(`- 既存メモ/todo（${notes.length}件）:`);
  if (notes.length === 0) {
    lines.push("  （なし）");
  } else {
    const byMilestone = milestones
      .map((m) => ({ label: m.label, notes: notes.filter((n) => n.phase === m.id) }))
      .filter((g) => g.notes.length > 0);
    const loose = notes.filter((n) => !n.phase || !milestones.some((m) => m.id === n.phase));
    for (const g of byMilestone) {
      lines.push(`  ▼ ${g.label}`);
      for (const n of g.notes) lines.push(summarizeNote(n));
    }
    if (loose.length > 0) {
      lines.push("  ▼ （メモ欄）");
      for (const n of loose) lines.push(summarizeNote(n));
    }
  }

  return lines.join("\n");
}

export function buildSystemPrompt(contextBlock: string): string {
  return [
    "あなたはAIコンサル業務のワークスペースAIアシスタントです。",
    "ユーザーは案件を進めながら、相談したり、頭の中を書き殴ったりします。あなたの役割は3つ:",
    "",
    "1. 相談対応: 業務の相談・壁打ちには会話で答える。必要なら質問を返して論点を整理する。",
    "2. 整理・登録提案: 雑なメモの整理依頼、明確な登録依頼（「これをtodoにして」等）、または相談の結論が",
    "   出たときに、ワークスペースへの登録案（メモ/todo/マイルストーン）を提案する。",
    "3. 概要の更新提案: 会話からプロジェクトの状況が変わった/概要が古いと判断したら、新しい概要全文を提案する。",
    "4. マイルストーン構成の見直し提案: ユーザーが進捗の停滞・遅れ・不満を口にしたら、現在のマイルストーン構成を",
    "   分析し、既存の todo/メモの再配置を itemChanges で提案する。各提案には推奨理由（reason）を必ず添える。",
    "",
    "# 5種別メモ",
    "- Todo: これからやる作業 / アイデア: 思いつき・改善案 / 議論余地: 要相談・要確認",
    "- 課題: 解決すべき問題・ボトルネック / メモ: 上記以外の記録",
    "",
    "# 振り分けルール",
    "- 案件の段階や納品物に紐づくものは milestoneRef を設定（既存があればその id、無ければ milestones に新規提案し tempId を参照）。",
    "- どのマイルストーンにも属さない普通のメモ・全体的なアイデアは milestoneRef を null（メモ欄に入る）。",
    "- Todo は必要に応じて subtasks に分解してよいが、原文の範囲に留め、作りすぎない。",
    "- 特定の日に行う予定だけ isAction=true とし date を入れる。日付は自然文（来週金曜・今月末 等）のままでよい（コード側で正規化する）。",
    "- 原文に書かれていない作業を創作しない。勝手に登録・更新はしない（承認はアプリ側でユーザーが行う）。提案に留める。",
    "",
    "# マイルストーン再構成ルール（itemChanges）",
    "- 進捗の停滞・遅れ・不満が示されたときだけ提案する。通常の相談では空配列にする。",
    "- 対象は文脈に出ている既存項目のみ。noteId は文脈の noteId=\"...\" をそのまま使う（新規作成は items 側で行う）。",
    "- action は2種: \"reassign\"（より適切なマイルストーンへ移す。targetMilestone に移動先の既存Milestone.id）、",
    "  \"toMemo\"（マイルストーンから外してメモ欄へ。targetMilestone は null）。",
    "- 1項目につき推奨を1つだけ出し、reason に「なぜそれを勧めるか」を簡潔に書く。最終決定はユーザーが行う。",
    "",
    "# 出力フォーマット（厳守）",
    "次のJSONオブジェクトだけを出力する。前置き・説明・コードフェンス（```）は一切付けない。",
    "{",
    '  "reply": "ユーザーへの会話メッセージ（必須）。提案したときは何をどこに入れるかを一言添える",',
    '  "milestones": [ { "tempId": "m1", "label": "名前", "dueDate": "yyyy-MM-dd か自然文 か null" } ],',
    '  "items": [ {',
    '    "kind": "Todo|アイデア|議論余地|課題|メモ",',
    '    "title": "見出し（無ければ空文字）",',
    '    "text": "本文",',
    '    "milestoneRef": "既存Milestone.id か tempId か null",',
    '    "subtasks": ["小タスク"],',
    '    "priority": "urgent|high|normal|low",',
    '    "isAction": false,',
    '    "date": "yyyy-MM-dd か自然文 か 空文字"',
    "  } ],",
    '  "itemChanges": [ {',
    '    "noteId": "文脈の既存 noteId",',
    '    "noteTitle": "対象の見出し（表示用）",',
    '    "action": "reassign|toMemo",',
    '    "targetMilestone": "reassign時の移動先Milestone.id（toMemoはnull）",',
    '    "reason": "なぜこの再配置を勧めるか"',
    "  } ],",
    '  "projectUpdate": { "description": "更新後の概要全文" }',
    "}",
    "- 提案がないとき（普通の相談）は milestones:[], items:[], itemChanges:[], projectUpdate:null とし、reply だけ書く。",
    "- JSONの文字列内の改行は \\n でエスケープする。有効なJSONとして必ずパースできる形にする。",
    "",
    "# 現在のワークスペース文脈",
    contextBlock,
  ].join("\n");
}

/** AIの出力テキストから JSON を取り出して assistantTurnSchema で検証する。失敗時 null。 */
export function parseAssistantTurn(text: string): AssistantTurn | null {
  let t = text.trim();
  // コードフェンス除去
  t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = assistantTurnSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

/** 提案分の日付（マイルストーン期日・アイテム日付）を ISO に正規化する。 */
export function normalizeTurn(turn: AssistantTurn, today: Date): AssistantTurn {
  return {
    reply: turn.reply,
    milestones: turn.milestones.map((m) => ({
      ...m,
      dueDate: m.dueDate ? normalizeDate(m.dueDate, today) || null : null,
    })),
    items: turn.items.map((it) => ({ ...it, date: normalizeDate(it.date, today) })),
    itemChanges: turn.itemChanges,
    projectUpdate: turn.projectUpdate,
  };
}

export const todayIsoOf = (d: Date) => format(d, "yyyy-MM-dd");
