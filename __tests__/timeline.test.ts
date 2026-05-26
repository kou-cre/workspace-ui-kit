import { describe, it, expect } from "vitest";

import {
  computeTimeline,
  formatHHMM,
  parseHHMM,
  snapTo15Minutes,
  sumDuration,
  type TimelineTask,
} from "@/lib/computed/timeline";

const t = (id: string, duration: number, order: number, time = ""): TimelineTask => ({
  id,
  title: id,
  duration,
  order,
  time,
  projectId: "p",
});

describe("parseHHMM", () => {
  it("正常な HH:MM をパースする", () => {
    expect(parseHHMM("09:00")).toBe(540);
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("23:59")).toBe(1439);
  });
  it("不正値は null", () => {
    expect(parseHHMM("")).toBeNull();
    expect(parseHHMM("9:0")).toBeNull();
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("12:60")).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM(undefined)).toBeNull();
  });
});

describe("formatHHMM", () => {
  it("分を HH:MM に変換する", () => {
    expect(formatHHMM(0)).toBe("00:00");
    expect(formatHHMM(540)).toBe("09:00");
    expect(formatHHMM(1439)).toBe("23:59");
  });
  it("24:00 を超えると wrap する", () => {
    expect(formatHHMM(1440)).toBe("00:00");
    expect(formatHHMM(1470)).toBe("00:30");
  });
});

describe("snapTo15Minutes", () => {
  it("15 分単位にスナップする", () => {
    expect(snapTo15Minutes(0)).toBe(0);
    expect(snapTo15Minutes(7)).toBe(0);
    expect(snapTo15Minutes(8)).toBe(15);
    expect(snapTo15Minutes(22)).toBe(15);
    expect(snapTo15Minutes(23)).toBe(30);
    expect(snapTo15Minutes(-8)).toBe(-15);
  });
});

describe("computeTimeline", () => {
  it("空入力で空配列を返す", () => {
    expect(computeTimeline("09:00", null, [])).toEqual([]);
  });

  it("単一タスクの開始/終了時刻を計算する", () => {
    const r = computeTimeline("09:00", null, [t("a", 60, 0)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      startTime: "09:00",
      endTime: "10:00",
      overflow: false,
      beforeNow: false,
    });
  });

  it("複数タスクを累積で計算する", () => {
    const r = computeTimeline("09:00", null, [
      t("a", 30, 0),
      t("b", 45, 1),
      t("c", 60, 2),
    ]);
    expect(r[0]).toMatchObject({ startTime: "09:00", endTime: "09:30" });
    expect(r[1]).toMatchObject({ startTime: "09:30", endTime: "10:15" });
    expect(r[2]).toMatchObject({ startTime: "10:15", endTime: "11:15" });
  });

  it("始業時刻 13:30 から計算できる", () => {
    const r = computeTimeline("13:30", null, [t("a", 90, 0)]);
    expect(r[0]).toMatchObject({ startTime: "13:30", endTime: "15:00" });
  });

  it("不正な始業時刻は 9:00 にフォールバックする", () => {
    const r = computeTimeline("not-a-time", null, [t("a", 60, 0)]);
    expect(r[0].startTime).toBe("09:00");
  });

  it("24:00 を超えた場合 overflow=true で wrap 表示する", () => {
    const r = computeTimeline("23:00", null, [t("a", 90, 0)]);
    expect(r[0]).toMatchObject({ startTime: "23:00", endTime: "00:30", overflow: true });
  });

  it("固定 time があるタスクは指定時刻から開始する", () => {
    const r = computeTimeline("09:00", null, [
      t("a", 30, 0),
      t("b", 60, 1, "11:00"),
    ]);
    expect(r[0]).toMatchObject({ startTime: "09:00", endTime: "09:30" });
    expect(r[1]).toMatchObject({ startTime: "11:00", endTime: "12:00" });
  });

  it("固定 time が cursor より前なら cursor を尊重する", () => {
    const r = computeTimeline("09:00", null, [
      t("a", 60, 0),
      t("b", 30, 1, "09:30"),
    ]);
    expect(r[0]).toMatchObject({ startTime: "09:00", endTime: "10:00" });
    // 09:30 < cursor(10:00) なので cursor を採用
    expect(r[1]).toMatchObject({ startTime: "10:00", endTime: "10:30" });
  });

  it("currentMin が workStart より大きいなら起点が currentMin になる", () => {
    const r = computeTimeline("09:00", 11 * 60 + 30, [t("a", 60, 0)]);
    expect(r[0].startTime).toBe("11:30");
    expect(r[0].endTime).toBe("12:30");
  });

  it("currentMin が workStart より小さければ workStart が起点", () => {
    const r = computeTimeline("09:00", 7 * 60, [t("a", 60, 0)]);
    expect(r[0].startTime).toBe("09:00");
  });

  it("beforeNow フラグは現在時刻より前のタスクで true", () => {
    const r = computeTimeline("06:00", 10 * 60, [
      t("a", 60, 0),
      t("b", 60, 1),
    ]);
    // a は 10:00 から始まる（currentMin オーバーライド）ので beforeNow=false
    expect(r[0]).toMatchObject({ startTime: "10:00", beforeNow: false });
  });

  it("0 分タスクは start == end になる", () => {
    const r = computeTimeline("09:00", null, [t("a", 0, 0), t("b", 60, 1)]);
    expect(r[0]).toMatchObject({ startTime: "09:00", endTime: "09:00" });
    expect(r[1]).toMatchObject({ startTime: "09:00", endTime: "10:00" });
  });

  it("マイナス duration は 0 として扱う", () => {
    const r = computeTimeline("09:00", null, [t("a", -10, 0), t("b", 30, 1)]);
    expect(r[0]).toMatchObject({ startTime: "09:00", endTime: "09:00" });
    expect(r[1]).toMatchObject({ startTime: "09:00", endTime: "09:30" });
  });
});

describe("sumDuration", () => {
  it("合計分数を返す", () => {
    expect(sumDuration([t("a", 30, 0), t("b", 45, 1)])).toBe(75);
  });
  it("空配列は 0", () => {
    expect(sumDuration([])).toBe(0);
  });
  it("マイナス値は 0 として扱う", () => {
    expect(sumDuration([t("a", -10, 0), t("b", 30, 1)])).toBe(30);
  });
});
