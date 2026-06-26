# デプロイ手順（サブスク枠でAIを動かす）

AIアシスタント（相談＆整理）は **Claude Agent SDK の `query()`**（サブスク枠・APIキー不要）で動く。
`query()` は `claude` CLI をサブプロセス起動するため、**常駐 Node ホスト**が必要。
**Vercel のサーバーレスは不向き**（コールドスタート・短いタイムアウト・FS読取専用）。

> 前提：**自分専用・非共有**の個人利用。Anthropic は「第三者向けプロダクトでサブスク認証を使わせること」を
> 事前承認なしには許可していない。複数人に提供・商用化する場合は従量API（`ANTHROPIC_API_KEY`）へ切り替える。

---

## 手順

### 1. サブスク用の長期トークンを発行（ローカルで1回）

```bash
claude setup-token
```

→ サブスクに紐づく **1年有効の OAuth トークン**が表示される。これを控える（従量課金にならない）。

### 2. 常駐ホストにデプロイ（推奨：Railway / 代替：Render）

リポジトリ：`kou-cre/workspace-ui-kit`

**Railway の場合**
1. https://railway.app → New Project → Deploy from GitHub repo → `kou-cre/workspace-ui-kit`
2. ビルド/起動は自動検出（`npm run build` → `npm run start`）。`PORT` は Railway が注入し `next start` が従う
3. 下記の環境変数を設定（Variables）

**Render の場合**：New → Web Service → 同リポジトリ。Build `npm run build` / Start `npm run start`。

### 3. 環境変数

| 変数 | 内容 |
|------|------|
| `CLAUDE_CODE_OAUTH_TOKEN` | 手順1のトークン（**これがサブスク枠の鍵**） |
| `DATABASE_URL` | Neon 接続（プール） |
| `DATABASE_URL_UNPOOLED` | Neon 直結 |
| `AUTH_SECRET` | NextAuth 用シークレット |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth |
| `AUTH_URL` | デプロイ後の URL（例 `https://workspace-ui-kit.up.railway.app`）。OAuth コールバックに必要 |

> `CLAUDE_CODE_OAUTH_TOKEN` 以外は、既存の Vercel など現行デプロイの環境変数をそのまま移植すればよい。

### 4. Google OAuth のリダイレクトURI追加

Google Cloud Console → 認証情報 → OAuth クライアント → 承認済みリダイレクトURIに
`https://<デプロイURL>/api/auth/callback/google` を追加。

### 5. 疎通確認

1. デプロイ後 `https://<デプロイURL>/api/connection` を開く → `{"connected": true, ...}` ならサブスク枠でAI接続OK
   - `connected:false` の場合、`CLAUDE_CODE_OAUTH_TOKEN` の設定漏れ or トークン期限切れ
2. アプリにログイン → 案件を開く → ✨アシスタント → 相談/ダンプ→提案→承認→反映 を確認

---

## Vercel を残したい場合

- **全部 Railway に寄せる**（最小手間・推奨）
- もしくは **Vercel＝画面＋DB／AIだけ Railway の小サービスに分離**し、`/api/assistant` 相当を Railway 側に置いて画面から `fetch`。構成は増えるが Vercel の URL を維持できる

---

## メモ

- `claude` CLI は `@anthropic-ai/claude-agent-sdk` に同梱（別途インストール不要）。Linux x64 ホストで動く
- トークンは1年で失効。失効したら `claude setup-token` で再発行して差し替え
- AIエンジン詳細・絶対制約は `ADS/月次課題/5月/4ヶ月目/AI機能_ブレインダンプ/` の3点セット参照
