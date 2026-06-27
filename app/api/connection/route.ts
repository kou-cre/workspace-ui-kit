import { NextResponse } from "next/server";

// Agent SDK は claude CLI をサブプロセス起動するため Node ランタイム必須。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI接続ステータス確認。APIキー（従量課金）は使わず、Claude サブスク枠で
 * 繋がっているかを確認する。AIはローカル開発専用なので本番(Vercel)では未接続を返す。
 *
 * `query(...).accountInfo()` はアカウント/プラン情報のみ取得し、生成ターンを回さない
 * （quota を消費しない）。
 */
export async function GET() {
  // AIはローカル開発専用。本番(Vercel)は claude CLI が無いので未接続を返す。
  if (process.env.VERCEL) {
    return NextResponse.json({
      connected: false,
      devOnly: true,
      error: "AI機能はローカル開発サーバーでのみ利用できます。",
    });
  }

  try {
    // 動的 import：Vercel 関数へ 212MB バイナリを載せない（next.config と併用）。
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
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
        hint: "ローカルで `claude` にログイン済みか確認してください（APIキーは不要・サブスク枠）。",
      },
      { status: 200 },
    );
  }
}
