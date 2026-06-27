# AI生成サイドカー（自宅 Mac 常駐）

Vercel 上のアプリは画面・DB・認証だけを担当し、**AIの生成1回**だけをこの極小サービスへ転送する。
理由：サブスク枠で動かすには `claude` CLI（約212MB）が要るが、それは Vercel のサーバーレス関数
（展開後250MB上限）に載らないため。ここを Mac に常駐させれば、Vercel はそのまま使える。

```
Vercel（画面/DB/認証・無料のまま）
   │  fetch  /generate, /health   ← Bearer SIDECAR_SECRET で認証
   ▼
このサイドカー（自宅 Mac・常駐）
   └ claude ログイン継承（＝サブスク枠・APIキー不要・トークン不要）
```

> 前提：**完全に自分専用・非共有**。URL とシークレットは誰にも渡さない。

> ⚠️ **重要：このフォルダ（Google Drive 上）では `npm install` しないこと。**
> `node_modules` には claude CLI（約212MB）が入る。Google Drive がこの巨大バイナリを
> 常時同期しようとし、`npm run dev` 起動時にファイル監視と衝突して **CPU が張り付き PC がフリーズする**。
> 実運用のサイドカーは **Drive 外の `~/workspace-ai-sidecar/`** に置き、そこで `npm install` して
> launchd 常駐させている（下記「実運用の設置場所」参照）。このフォルダはソースの正本（git管理）専用。

---

## 実運用の設置場所（現状・2026-06-27）

- 設置先：`~/workspace-ai-sidecar/`（**Google Drive の外**。Drive 上だと同期 churn でフリーズするため）
- 常駐：`~/Library/LaunchAgents/com.kosuke.workspace-ai-sidecar.plist`（RunAtLoad / KeepAlive）
- スリープ抑止：`com.kosuke.workspace-ai-caffeinate.plist`
- 公開：**Tailscale Funnel** 固定URL `https://kosukemac-studio.tail3541f8.ts.net` → `127.0.0.1:8787`
- 更新手順：このフォルダの `server.mjs` 等を編集 → `~/workspace-ai-sidecar/` へコピー → `launchctl kickstart -k gui/$(id -u)/com.kosuke.workspace-ai-sidecar`

以下は新しい Mac で一から立てる場合の汎用手順（**設置先は必ず Drive 外**にすること）。

## 1. 準備（初回のみ）

Mac で `claude` にログイン済みであること（このリポジトリの開発に使っている Mac ならOK）。

```bash
# 設置先は Google Drive の外（例: ホーム直下）。Drive 上では絶対に install しない
cp -R sidecar ~/workspace-ai-sidecar && cd ~/workspace-ai-sidecar
npm install            # @anthropic-ai/claude-agent-sdk だけを入れる（約212MB）
```

共有シークレットを生成して控える（Vercel 側にも同じ値を入れる）：

```bash
openssl rand -hex 32
```

## 2. 起動

```bash
cd sidecar
SIDECAR_SECRET="さっき生成した値" npm start
# → [sidecar] listening on http://localhost:8787 (model=sonnet)
```

ローカル疎通の確認（別ターミナル）：

```bash
curl -H "authorization: Bearer さっき生成した値" http://localhost:8787/health
# → {"connected":true,"account":{...}} ならサブスク枠まで繋がっている
```

環境変数（任意）：

| 変数 | 既定 | 説明 |
|------|------|------|
| `SIDECAR_SECRET` | （必須） | 共有シークレット。未設定だと起動しない |
| `SIDECAR_PORT` | `8787` | 待ち受けポート |
| `SIDECAR_MODEL` | `sonnet` | 既定モデル。品質優先なら `opus` |

## 3. 外部公開（Vercel から届かせる）

Vercel はクラウド上にあるので、Mac を公開URLで到達可能にする。**Tailscale Funnel** 推奨（無料・URL固定・独自ドメイン不要）。

```bash
# Tailscale 導入済み前提
tailscale funnel 8787
# → https://<mac-name>.<tailnet>.ts.net が表示される（このURLが固定）
```

アカウント不要で試すだけなら cloudflared でも可（URLは毎回変わる）：

```bash
cloudflared tunnel --url http://localhost:8787
```

## 4. Vercel 側の環境変数

Vercel プロジェクト → Settings → Environment Variables：

| 変数 | 値 |
|------|----|
| `SIDECAR_URL` | 手順3で得た公開URL（例 `https://mac.tailnet.ts.net`） |
| `SIDECAR_SECRET` | 手順1で生成した値（Mac と同一） |

設定後に再デプロイ → `https://<vercel-url>/api/connection` を開いて `{"connected":true}` を確認。

## 5. 常駐させる（任意・落ちないように）

- スリープ抑止：`caffeinate -dimsu npm start`（このプロセス実行中は Mac が寝ない）
- 自動再起動：launchd か pm2 で `node server.mjs` を常駐管理する

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| `/api/connection` が `connected:false` | Mac が起動中か／サイドカーが動作中か／トンネルが上がっているか |
| `401 unauthorized` | Vercel と Mac の `SIDECAR_SECRET` が一致しているか |
| `connected:false` でログインエラー | Mac で `claude` にログインし直す |
| しばらくして急に停止 | トークン/ログイン失効。`claude` 再ログイン |
