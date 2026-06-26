import { NextResponse } from "next/server";
import { query } from "@anthropic-ai/claude-agent-sdk";

import { db } from "@/lib/db";
import type { ChatTurn, AssistantTurn } from "@/lib/brainDump/schema";
import {
  buildContextBlock,
  buildSystemPrompt,
  parseAssistantTurn,
  normalizeTurn,
  todayIsoOf,
} from "@/lib/brainDump/prompt";

// Claude Agent SDK は claude CLI をサブプロセス起動するため Node ランタイム必須。
// APIキー（従量課金）は使わず、ローカルの Claude ログイン（OAuth＝サブスク枠）を継承する。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 使用モデル。サブスク枠で動く。速度優先で sonnet、品質優先なら "opus"。 */
const MODEL = "sonnet";

type Body = { projectId?: string; messages?: ChatTurn[] };

async function runQuery(prompt: string, systemPrompt: string): Promise<string> {
  const q = query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt,
      settingSources: [],
      allowedTools: [],
      maxTurns: 1,
      cwd: process.cwd(),
    },
  });

  let text = "";
  for await (const m of q) {
    if (m.type === "assistant") {
      for (const block of m.message.content) {
        if (block.type === "text") text += block.text;
      }
    } else if (m.type === "result") {
      if (m.subtype === "success" && typeof m.result === "string") text = m.result;
    }
  }
  return text.trim();
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です。" }, { status: 400 });
  }

  const projectId = body.projectId;
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
      const text = await runQuery(prompt, systemPrompt);
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
        hint: "ローカルで `claude` にログイン済みか確認してください（APIキーは不要・サブスク枠で動きます）。Vercel等のリモートでは動きません。",
      },
      { status: 200 },
    );
  }
}
