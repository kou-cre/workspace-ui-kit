/**
 * AIコンサルドメインの表示文言（labels）。
 *
 * 業種を変える受講生は、このファイルの値を業種に合わせて書き換える。
 * 例: 学校なら STATUS_LABELS を「体験 / 見学 / 入会手続き / 完了」等に変更する。
 */

import { type NotePriority, PRIORITY_ORDER } from "@/lib/schema";

/** デフォルトマイルストーンの表示名。後方互換のために残す。 */
export const STATUS_LABELS: Record<string, string> = {
  hearing: "ヒアリング",
  proposal: "提案中",
  development: "開発中",
  delivery: "納品済み",
  maintenance: "保守",
} as const;

/** 優先度の表示名。 */
export const PRIORITY_LABELS: Record<NotePriority, string> = {
  urgent: "緊急",
  high: "重要",
  normal: "通常",
  low: "低",
} as const;

export { PRIORITY_ORDER };

/** デフォルトマイルストーンの Badge variant マッピング。 */
export const STATUS_BADGE_VARIANT: Record<string, "outline" | "secondary" | "default" | "delivered"> = {
  hearing: "outline",
  proposal: "secondary",
  development: "default",
  delivery: "delivered",
  maintenance: "secondary",
} as const;

/** マイルストーン ID に対応する Badge variant を返す。
 *  デフォルト5フェーズは既存マッピング、カスタムは "secondary"。 */
export function getMilestoneBadgeVariant(
  milestoneId: string,
): "outline" | "secondary" | "default" | "delivered" {
  return (STATUS_BADGE_VARIANT[milestoneId] as "outline" | "secondary" | "default" | "delivered") ?? "secondary";
}
