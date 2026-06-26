import { NextResponse } from "next/server";

import { checkSidecar } from "@/lib/brainDump/sidecar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI接続ステータス確認（デプロイ後の疎通チェック用）。
 *
 * 実体は自宅 Mac の常駐サイドカーが `query(...).accountInfo()` でサブスク接続を確認する
 * （生成ターンを回さず quota を消費しない）。本ルートはその結果を中継するだけ。
 * - connected:true  … Vercel → サイドカー → サブスク枠、まで全部繋がっている
 * - connected:false … SIDECAR_URL/SECRET 未設定、Mac/トンネル停止、claude 未ログイン 等
 */
export async function GET() {
  try {
    const result = await checkSidecar();
    return NextResponse.json({
      connected: result.connected,
      account: result.account ?? null,
      error: result.error,
    });
  } catch (err) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
        hint: "Vercel の SIDECAR_URL・SIDECAR_SECRET、Mac 常駐サービスとトンネルの起動、Mac 側の `claude` ログインを確認してください（APIキーは不要・サブスク枠）。",
      },
      { status: 200 },
    );
  }
}
