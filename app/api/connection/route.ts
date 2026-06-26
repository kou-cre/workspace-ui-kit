import { NextResponse } from "next/server";
import { query } from "@anthropic-ai/claude-agent-sdk";

// Agent SDK は claude CLI をサブプロセス起動するため Node ランタイム必須。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI接続ステータス確認（デプロイ後の疎通チェック用）。
 *
 * APIキー（従量課金）は使わず、Claude サブスク枠で繋がっているかを確認する。
 * - ローカル：`claude` ログイン済みなら OK
 * - デプロイ：環境変数 CLAUDE_CODE_OAUTH_TOKEN（`claude setup-token` で発行）で OK
 *
 * `query(...).accountInfo()` はアカウント/プラン情報のみ取得し、生成ターンを回さない
 * （quota を消費しない）。
 */
export async function GET() {
  try {
    const q = query({
      prompt: "ping",
      options: {
        settingSources: [],
        allowedTools: [],
        maxTurns: 1,
        cwd: process.cwd(),
      },
    });

    const info = await q.accountInfo();

    return NextResponse.json({ connected: true, account: info ?? null });
  } catch (err) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
        hint: "ローカルは `claude` ログイン、デプロイは環境変数 CLAUDE_CODE_OAUTH_TOKEN を確認（APIキーは不要・サブスク枠）。",
      },
      { status: 200 },
    );
  }
}
