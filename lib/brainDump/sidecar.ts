/**
 * Mac 常駐サイドカー（AI生成サービス）への薄いクライアント。
 *
 * AIの生成は claude CLI（サブスク枠＝約212MBバイナリ）を必要とし、Vercel のサーバーレス
 * 関数には載らない。そこで生成1回だけを自宅 Mac の常駐サービスへ HTTP で委譲する。
 * 画面・DB・認証・URL は Vercel のまま。詳細・構築手順は DEPLOY.md と sidecar/README.md。
 *
 * 環境変数:
 * - SIDECAR_URL    … サイドカーの公開URL（例 https://<mac>.<tailnet>.ts.net）
 * - SIDECAR_SECRET … 共有シークレット。公開URLを他人に叩かれてサブスク枠を消費される事故を防ぐ
 */

function endpoint(path: string): string {
  const base = process.env.SIDECAR_URL;
  if (!base) throw new Error("SIDECAR_URL が未設定です（AI生成サイドカーの接続先）。");
  return `${base.replace(/\/+$/, "")}${path}`;
}

function authHeaders(): Record<string, string> {
  const secret = process.env.SIDECAR_SECRET;
  return secret ? { authorization: `Bearer ${secret}` } : {};
}

/** AI生成を1回実行し、生テキストを返す。検証・整形は呼び出し側（Vercel）で行う。 */
export async function callSidecar(args: {
  prompt: string;
  systemPrompt: string;
  model: string;
}): Promise<string> {
  const res = await fetch(endpoint("/generate"), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AIサイドカー応答エラー (${res.status})${detail ? ` ${detail}` : ""}`);
  }

  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return (data.text ?? "").trim();
}

/** サイドカーの疎通＋サブスク接続状態を確認する（生成ターンを回さない）。 */
export async function checkSidecar(): Promise<{
  connected: boolean;
  account?: unknown;
  error?: string;
}> {
  const res = await fetch(endpoint("/health"), { headers: authHeaders() });
  const data = (await res.json().catch(() => ({}))) as {
    connected?: boolean;
    account?: unknown;
    error?: string;
  };
  return {
    connected: Boolean(data.connected),
    account: data.account,
    error: data.error,
  };
}
