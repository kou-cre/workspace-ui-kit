import { describe, it, expect } from "vitest";

import { normalizeDate } from "@/lib/brainDump/normalizeDate";
import { assistantTurnSchema } from "@/lib/brainDump/schema";
import { parseAssistantTurn } from "@/lib/brainDump/prompt";

// 基準日: 2026-06-26（金曜 / getDay()=5）
const TODAY = new Date(2026, 5, 26);

describe("normalizeDate: ISO passthrough", () => {
  it("yyyy-MM-dd はそのまま", () => {
    expect(normalizeDate("2026-12-01", TODAY)).toBe("2026-12-01");
  });
  it("yyyy/MM/dd は - 区切りへ", () => {
    expect(normalizeDate("2026/12/01", TODAY)).toBe("2026-12-01");
  });
  it("1桁月日も補正", () => {
    expect(normalizeDate("2026-7-1", TODAY)).toBe("2026-07-01");
  });
});

describe("normalizeDate: 相対表現", () => {
  it.each([
    ["今日", "2026-06-26"],
    ["本日", "2026-06-26"],
    ["明日", "2026-06-27"],
    ["あさって", "2026-06-28"],
    ["昨日", "2026-06-25"],
    ["3日後", "2026-06-29"],
    ["１週間後", "2026-07-03"], // 全角数字も許容
    ["1ヶ月後", "2026-07-26"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDate(input, TODAY)).toBe(expected);
  });
});

describe("normalizeDate: 月末・週末・来週", () => {
  it("今月末", () => expect(normalizeDate("今月末", TODAY)).toBe("2026-06-30"));
  it("来月末", () => expect(normalizeDate("来月末", TODAY)).toBe("2026-07-31"));
  it("来月", () => expect(normalizeDate("来月", TODAY)).toBe("2026-07-01"));
  it("週末（金曜基準→翌土曜）", () =>
    expect(normalizeDate("週末", TODAY)).toBe("2026-06-27"));
  it("来週", () => expect(normalizeDate("来週", TODAY)).toBe("2026-07-03"));
});

describe("normalizeDate: 曜日", () => {
  it("金曜（当日と一致）→ 当日", () =>
    expect(normalizeDate("金曜", TODAY)).toBe("2026-06-26"));
  it("月曜 → 次の月曜", () =>
    expect(normalizeDate("月曜日", TODAY)).toBe("2026-06-29"));
  it("来週月曜 → +1週", () =>
    expect(normalizeDate("来週月曜", TODAY)).toBe("2026-07-06"));
});

describe("normalizeDate: M月D日 / D日", () => {
  it("未来の M月D日", () =>
    expect(normalizeDate("7月1日", TODAY)).toBe("2026-07-01"));
  it("過ぎた M月D日 → 翌年", () =>
    expect(normalizeDate("6月20日", TODAY)).toBe("2027-06-20"));
  it("未来の D日 → 今月", () =>
    expect(normalizeDate("30日", TODAY)).toBe("2026-06-30"));
  it("過ぎた D日 → 翌月", () =>
    expect(normalizeDate("10日", TODAY)).toBe("2026-07-10"));
});

describe("normalizeDate: 解釈不能・空入力は空文字", () => {
  it.each(["", "  ", "未定", "そのうち", "あとで"])(
    "%j → ''",
    (input) => {
      expect(normalizeDate(input, TODAY)).toBe("");
    },
  );
  it("today を破壊しない", () => {
    const ref = new Date(2026, 5, 26).getTime();
    normalizeDate("7月1日", TODAY);
    expect(TODAY.getTime()).toBe(ref);
  });
});

describe("assistantTurnSchema", () => {
  it("提案つきの応答を受け入れる", () => {
    const result = assistantTurnSchema.safeParse({
      reply: "要件確定マイルストーンに紐付けました",
      milestones: [{ tempId: "m1", label: "要件確定", dueDate: "来月末" }],
      items: [
        {
          kind: "Todo",
          title: "NOFY仕様書を読む",
          text: "今日中に目を通す",
          milestoneRef: "m1",
          subtasks: ["1章", "2章"],
          priority: "high",
          isAction: true,
          date: "今日中",
        },
        {
          kind: "アイデア",
          title: "",
          text: "請求書テンプレ改善",
          milestoneRef: null,
          subtasks: [],
          priority: "normal",
          isAction: false,
          date: "",
        },
      ],
      projectUpdate: { description: "NOFY請求自動化の要件確定フェーズ" },
    });
    expect(result.success).toBe(true);
  });

  it("提案なし（普通の相談）の応答も受け入れる", () => {
    const result = assistantTurnSchema.safeParse({
      reply: "その論点なら、まず請求条件を整理しましょう。",
      milestones: [],
      items: [],
      projectUpdate: null,
    });
    expect(result.success).toBe(true);
  });

  it("reply 欠落は弾く", () => {
    const result = assistantTurnSchema.safeParse({
      milestones: [],
      items: [],
      projectUpdate: null,
    });
    expect(result.success).toBe(false);
  });

  it("未知の kind は弾く", () => {
    const result = assistantTurnSchema.safeParse({
      reply: "x",
      milestones: [],
      items: [
        {
          kind: "タスク", // 5種別外
          title: "",
          text: "x",
          milestoneRef: null,
          subtasks: [],
          priority: "normal",
          isAction: false,
          date: "",
        },
      ],
      projectUpdate: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("parseAssistantTurn（query()出力のパース）", () => {
  it("コードフェンス＋replyのみ → defaultsで補完", () => {
    const turn = parseAssistantTurn('```json\n{ "reply": "了解しました" }\n```');
    expect(turn).not.toBeNull();
    expect(turn?.reply).toBe("了解しました");
    expect(turn?.milestones).toEqual([]);
    expect(turn?.items).toEqual([]);
    expect(turn?.projectUpdate).toBeNull();
  });

  it("itemの任意項目欠落 → defaultsで補完", () => {
    const turn = parseAssistantTurn(
      '{ "reply": "todoにしました", "items": [ { "kind": "Todo", "text": "請求書を送る", "milestoneRef": null } ] }',
    );
    expect(turn).not.toBeNull();
    const it = turn?.items[0];
    expect(it?.kind).toBe("Todo");
    expect(it?.priority).toBe("normal");
    expect(it?.subtasks).toEqual([]);
    expect(it?.isAction).toBe(false);
    expect(it?.date).toBe("");
  });

  it("前後に文章が混ざってもJSON部分を抽出", () => {
    const turn = parseAssistantTurn('はい、こちらです。\n{ "reply": "ok" }\n以上です。');
    expect(turn?.reply).toBe("ok");
  });

  it("JSONが無い / 壊れている → null", () => {
    expect(parseAssistantTurn("普通の文章です")).toBeNull();
    expect(parseAssistantTurn('{ "reply": ')).toBeNull();
  });

  it("reply 欠落のJSON → null（必須）", () => {
    expect(parseAssistantTurn('{ "items": [] }')).toBeNull();
  });
});
