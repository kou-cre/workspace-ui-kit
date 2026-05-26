import { describe, it, expect } from "vitest";

import {
  computeTimeline,
  formatHHMM,
  parseHHMM,
  snapTo15Minutes,
  sumDuration,
  type TimelineTask,
} from "@/lib/computed/timeline";

const t = (id: string, time: string, duration: number, order = 0): TimelineTask => ({
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
    expect(snapTo15Minutes(7)).toBe(0);
    expect(snapTo15Minutes(8)).toBe(15);
    expect(snapTo15Minutes(23)).toBe(30);
  });
});

describe("computeTimeline (絶対時刻軸)", () => {
  it("空入力で空配列を返す", () => {
    expect(computeTimeline(null, [])).toEqual([]);
  });

  it("単一タスクで lane=0, laneCount=1", () => {
    const r = computeTimeline(null, [t("a", "09:00", 60)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      startTime: "09:00",
      endTime: "10:00",
      lane: 0,
      laneCount: 1,
      overflow: false,
      beforeNow: false,
    });
  });

  it("重ならない複数タスクは全て lane=0, laneCount=1", () => {
    const r = computeTimeline(null, [
      t("a", "09:00", 60),
      t("b", "11:00", 60),
      t("c", "14:00", 30),
    ]);
    expect(r.map((e) => e.lane)).toEqual([0, 0, 0]);
    expect(r.map((e) => e.laneCount)).toEqual([1, 1, 1]);
  });

  it("2つのタスクが重なると laneCount=2、別レーン", () => {
    const r = computeTimeline(null, [
      t("a", "09:00", 60),
      t("b", "09:30", 60),
    ]);
    expect(r[0]).toMatchObject({ lane: 0, laneCount: 2 });
    expect(r[1]).toMatchObject({ lane: 1, laneCount: 2 });
  });

  it("3つ重なると laneCount=3", () => {
    const r = computeTimeline(null, [
      t("a", "09:00", 90),
      t("b", "09:30", 60),
      t("c", "10:00", 30),
    ]);
    const sorted = r.map((e) => ({ id: e.task.id, lane: e.lane, laneCount: e.laneCount }));
    expect(sorted.find((x) => x.id === "a")?.laneCount).toBe(3);
    expect(sorted.find((x) => x.id === "b")?.laneCount).toBe(3);
    expect(sorted.find((x) => x.id === "c")?.laneCount).toBe(3);
  });

  it("レーン再利用: 早く終わったタスクのレーンを後続が使う", () => {
    const r = computeTimeline(null, [
      t("a", "09:00", 30), // 09:00-09:30 lane=0
      t("b", "09:15", 30), // 09:15-09:45 lane=1（aと重なる）
      t("c", "09:45", 30), // 09:45-10:15 lane=0（aが終了済みなので再利用）
    ]);
    const a = r.find((e) => e.task.id === "a")!;
    const b = r.find((e) => e.task.id === "b")!;
    const c = r.find((e) => e.task.id === "c")!;
    expect(a.lane).toBe(0);
    expect(b.lane).toBe(1);
    expect(c.lane).toBe(0);
  });

  it("time が空のタスクは除外される", () => {
    const r = computeTimeline(null, [
      t("a", "09:00", 60),
      t("b", "", 30),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].task.id).toBe("a");
  });

  it("不正な time も除外される", () => {
    const r = computeTimeline(null, [t("a", "not-a-time", 60)]);
    expect(r).toEqual([]);
  });

  it("currentMin より前のタスクは beforeNow=true", () => {
    const r = computeTimeline(11 * 60, [t("a", "09:00", 60), t("b", "14:00", 30)]);
    expect(r[0]).toMatchObject({ task: { id: "a" }, beforeNow: true });
    expect(r[1]).toMatchObject({ task: { id: "b" }, beforeNow: false });
  });

  it("24:00 を超える場合 overflow=true", () => {
    const r = computeTimeline(null, [t("a", "23:00", 90)]);
    expect(r[0]).toMatchObject({ startTime: "23:00", endTime: "00:30", overflow: true });
  });

  it("出力は startMin 昇順", () => {
    const r = computeTimeline(null, [
      t("c", "14:00", 30),
      t("a", "09:00", 60),
      t("b", "11:00", 60),
    ]);
    expect(r.map((e) => e.task.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sumDuration", () => {
  it("合計分数を返す", () => {
    expect(sumDuration([t("a", "09:00", 30), t("b", "10:00", 45)])).toBe(75);
  });
  it("空配列は 0", () => {
    expect(sumDuration([])).toBe(0);
  });
  it("マイナス値は 0 として扱う", () => {
    expect(sumDuration([t("a", "09:00", -10), t("b", "10:00", 30)])).toBe(30);
  });
});
