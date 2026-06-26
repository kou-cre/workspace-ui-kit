/**
 * AIアシスタントで選べるモデル一覧（UIと API の両方で参照する単一の正本）。
 *
 * いずれも Claude のサブスク枠（Claude Max）で利用できるエイリアス。従量APIキーは使わない。
 * 速度と賢さ・消費枠のトレードオフでユーザーが切り替える。
 */
export const ASSISTANT_MODELS = [
  { id: "sonnet", label: "Sonnet", hint: "速い・標準" },
  { id: "opus", label: "Opus", hint: "賢い・じっくり" },
  { id: "haiku", label: "Haiku", hint: "最速・軽い" },
] as const;

export type AssistantModelId = (typeof ASSISTANT_MODELS)[number]["id"];

/** 既定モデル。速度優先の Sonnet。 */
export const DEFAULT_MODEL: AssistantModelId = "sonnet";

/** 受け取った値が許可モデルか検証する（API 側で不正値を弾く）。 */
export function isAssistantModel(value: unknown): value is AssistantModelId {
  return typeof value === "string" && ASSISTANT_MODELS.some((m) => m.id === value);
}

/** id から表示ラベルを引く（不明な値は既定の Sonnet 表示）。 */
export function modelLabel(id: string): string {
  return ASSISTANT_MODELS.find((m) => m.id === id)?.label ?? "Sonnet";
}
