import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import type { ChatTurn, AssistantTurn } from "@/lib/brainDump/schema";
import {
  buildContextBlock,
  buildSystemPrompt,
  parseAssistantTurn,
  normalizeTurn,
  todayIsoOf,
} from "@/lib/brainDump/prompt";
import { callSidecar } from "@/lib/brainDump/sidecar";
import { isAssistantModel, DEFAULT_MODEL } from "@/lib/brainDump/models";

// Prisma を使うため Node ランタイム必須。AI生成自体は Mac 常駐サイドカーへ委譲する
// （claude CLI＝サブスク枠の212MBバイナリは Vercel 関数に載らないため。詳細は DEPLOY.md）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// サイドカーの生成完了を待つ。Vercel Hobby は最大60秒。
export const maxDuration = 60;

type Body = { projectId?: string; messages?: ChatTurn[]; model?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const projectId = body.projectId;
  // 不正・未指定なら既定モデルにフォールバック（任意のモデル名を素通ししない）。
  const model = isAssistantModel(body.model) ? body.model : DEFAULT_MODEL;
  const history = (Array.isArray(body.messages) ? body.messages : []).filter((m) =>
    m?.content?.trim(),
  );
  const last = history[history.length - 1];
  if (!projectId || !last || last.role !== "user") {
    return NextResponse.json({ error: "送信するメッセージがありません。" }, { status: 400 });
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true },
  });
  if (!project) {
    return NextResponse.json({ error: "対象プロジェクトが見つかりません。" }, { status: 404 });
  }

  const [milestones, notes] = await Promise.all([
    db.milestone.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { id: true, label: true, dueDate: true },
    }),
    db.note.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        kind: true,
        status: true,
        title: true,
        text: true,
        phase: true,
        isAction: true,
        date: true,
      },
    }),
  ]);

  const today = new Date();
  const systemPrompt = buildSystemPrompt(
    buildContextBlock(todayIsoOf(today), project, milestones, notes),
  );

  const transcript = history
    .map((m) => `${m.role === "user" ? "ユーザー" : "アシスタント"}: ${m.content}`)
    .join("\n\n");
  const basePrompt = `これまでの会話:\n${transcript}\n\n上を踏まえ、最後のユーザー発言への応答を、指定のJSONオブジェクトだけで出力してください。`;

  try {
    let turn: AssistantTurn | null = null;
    for (let attempt = 0; attempt < 2 && !turn; attempt++) {
      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\n（注意：前回の出力はJSONとして解釈できませんでした。前置きもコードフェンスも付けず、有効なJSONオブジェクトだけを出力してください。）`;
      const text = await callSidecar({ prompt, systemPrompt, model });
      turn = parseAssistantTurn(text);
    }

    if (!turn) {
      return NextResponse.json(
        { error: "AIの応答を構造化できませんでした。もう一度試してください。" },
        { status: 200 },
      );
    }

    return NextResponse.json(normalizeTurn(turn, today));
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        hint: "AI生成を担う Mac 常駐サイドカーに接続できませんでした。Mac が起動しサービス／トンネルが動いているか、Vercel の SIDECAR_URL・SIDECAR_SECRET が正しいか確認してください（APIキーは不要・サブスク枠）。",
      },
      { status: 200 },
    );
  }
}
