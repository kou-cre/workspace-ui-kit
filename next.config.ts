import type { NextConfig } from "next";
import path from "node:path";

// プロジェクトルートを明示する。次の事故を防ぐ目的:
//   1. 親ディレクトリ（ホーム直下など）に lockfile が紛れていると Next.js が
//      そこをワークスペースルートと誤認識し、`outputFileTracing` が想定外の範囲を辿る
//   2. モノレポに将来取り込まれた場合でも本ディレクトリが基準になる
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Google Drive パスに "@" が含まれるため enhanced-resolve がモジュール解決に失敗する。
    // process.cwd() はシンボリックリンクを解決しないので "@" を含まないパスになる。
    // そのパスを resolve.modules の先頭に置くことで、enhanced-resolve が
    // "@" 入りの実パスを辿る前にシンボリックリンク側で tailwindcss を発見できる。
    const cwd = process.cwd();
    config.resolve.symlinks = false;
    config.resolve.modules = [
      path.join(cwd, "node_modules"),
      "node_modules",
    ];
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: path.join(cwd, "node_modules/tailwindcss"),
    };
    return config;
  },
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // Claude Agent SDK は claude CLI をサブプロセス起動するため、バンドルせず外部化する。
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
