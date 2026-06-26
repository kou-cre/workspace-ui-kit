import type { ReactNode } from "react";

/**
 * ChatMarkdown — AIチャット返信に出る軽量 Markdown だけを描画する。
 *
 * 汎用 Markdown ではなく、アシスタント返信に実際に現れる範囲に限定した最小実装:
 *   **強調** / `インラインコード` / 箇条書き(- * ・) / 番号付き(1.) / 段落(空行) / 改行。
 *
 * 依存を増やさず、見た目はセマンティックトークンに寄せる（色・太さの className 上書きをしない）。
 * 間隔は親の gap で管理する。
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (let m = INLINE.exec(text); m !== null; m = INLINE.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + token.length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[-*・]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;

export function ChatMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;

        const isBullet = lines.every((l) => BULLET.test(l));
        const isOrdered = lines.every((l) => ORDERED.test(l));

        if (isBullet || isOrdered) {
          return (
            <ul key={bi} className="flex flex-col gap-1">
              {lines.map((line, li) => {
                const marker = isOrdered
                  ? `${line.match(/^\s*(\d+)/)?.[1] ?? li + 1}.`
                  : "•";
                const content = line.replace(isOrdered ? ORDERED : BULLET, "");
                return (
                  <li key={li} className="flex gap-2">
                    <span aria-hidden className="select-none text-muted-foreground">
                      {marker}
                    </span>
                    <span>{renderInline(content, `${bi}-${li}`)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {renderInline(line, `${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
