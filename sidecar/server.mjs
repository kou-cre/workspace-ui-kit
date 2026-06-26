// AI生成サイドカー（自宅 Mac で常駐させる極小サービス）。
//
// Vercel 上のアプリ（/api/assistant・/api/connection）から HTTP で呼ばれ、
// ローカルの `claude` ログイン（＝サブスク枠・APIキー不要）で AI 生成を1回だけ実行して返す。
// claude CLI（約212MB）は Vercel に載らないので、この1ファイルだけを Mac 側に常駐させる。
//
// 起動: SIDECAR_SECRET=... node server.mjs
// 公開: Tailscale Funnel か cloudflared で localhost:SIDECAR_PORT を外部公開し、
//       その URL を Vercel の環境変数 SIDECAR_URL に設定する。詳細は README.md。

import { createServer } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PORT = Number(process.env.SIDECAR_PORT || 8787);
const SECRET = process.env.SIDECAR_SECRET;
const DEFAULT_MODEL = process.env.SIDECAR_MODEL || "sonnet";

// シークレット未設定なら起動しない（公開URLを無防備に晒さないための fail-closed）。
if (!SECRET) {
  console.error("[sidecar] SIDECAR_SECRET が未設定です。起動を中止します。");
  console.error('[sidecar] 例: SIDECAR_SECRET="$(openssl rand -hex 32)" node server.mjs');
  process.exit(1);
}

/** Bearer シークレット照合。Vercel からのリクエストだけを通す。 */
function authorized(req) {
  return (req.headers["authorization"] || "") === `Bearer ${SECRET}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) reject(new Error("payload too large")); // 1MB 上限
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/** AI生成を1回実行し、生テキストを返す（Vercel 旧 runQuery と同一の封じ込め設定）。 */
async function runQuery({ prompt, systemPrompt, model }) {
  const q = query({
    prompt,
    options: {
      model: model || DEFAULT_MODEL,
      systemPrompt,
      settingSources: [],
      allowedTools: [], // ツール実行は禁止＝テキスト生成だけに封じ込める
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

/** サブスク接続状態を確認（生成ターンを回さず quota を消費しない）。 */
async function checkConnection() {
  const q = query({
    prompt: "ping",
    options: { settingSources: [], allowedTools: [], maxTurns: 1, cwd: process.cwd() },
  });
  return (await q.accountInfo()) ?? null;
}

const server = createServer(async (req, res) => {
  const send = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  };

  if (!authorized(req)) return send(401, { error: "unauthorized" });

  const path = (req.url || "").split("?")[0];

  try {
    if (req.method === "GET" && path === "/health") {
      const account = await checkConnection();
      return send(200, { connected: true, account });
    }
    if (req.method === "POST" && path === "/generate") {
      const body = await readJson(req);
      if (!body.prompt || !body.systemPrompt) {
        return send(400, { error: "prompt と systemPrompt は必須です。" });
      }
      const text = await runQuery(body);
      return send(200, { text });
    }
    return send(404, { error: "not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (path === "/health") return send(200, { connected: false, error: message });
    return send(500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`[sidecar] listening on http://localhost:${PORT}  (model=${DEFAULT_MODEL})`);
  console.log("[sidecar] Tailscale Funnel か cloudflared で公開し、URL を Vercel の SIDECAR_URL へ。");
});
