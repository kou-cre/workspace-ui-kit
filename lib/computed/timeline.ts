/**
 * タイムライン計算ヘルパー（純粋関数）。
 *
 * Google カレンダー風の絶対時刻軸 UI 向け：
 *   - 各タスクは time (HH:MM) と duration を持ち、その時刻に固定配置
 *   - 重なるタスクはレーンに分けて横並び表示
 *   - time が空のタスクはタイムラインに表示しない（未割当ペイン側で扱う）
 */

import type { Note } from "@/lib/schema";

export type TimelineTask = Pick<Note, "id" | "title" | "duration" | "time"> & {
  order: number;
  projectId: string;
};

export type TimelineEntry = {
  task: TimelineTask;
  startTime: string;
  endTime: string;
  startMin: number;
  endMin: number;
  /** このタスクが属するレーン番号（0-indexed）。重なりがあると 1 以上。 */
  lane: number;
  /** このタスクが属するクラスタの総レーン数。 */
  laneCount: number;
  overflow: boolean;
  beforeNow: boolean;
};

/** "HH:MM" → 分。形式不正なら null。 */
export function parseHHMM(s: string | null | undefined): number | null {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** 分 → "HH:MM"。24:00 を超えたら wrap して表示する。 */
export function formatHHMM(minutes: number): string {
  const wrapped = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 15 分単位にスナップ。 */
export function snapTo15Minutes(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

/**
 * 重なるタスクをレーンに分割する（greedy アルゴリズム）。
 *
 * - タスクを start で sort
 * - 各タスクについて、空いているレーン（前タスクの end <= 自分の start）を探す
 * - なければ新レーン
 * - 同じ「重なりクラスタ」内のタスクは同じ laneCount を共有
 */
function assignLanes(
  entries: Array<{ startMin: number; endMin: number }>,
): Array<{ lane: number; laneCount: number }> {
  if (entries.length === 0) return [];

  // index 付きで時刻 sort
  const indexed = entries.map((e, i) => ({ ...e, i }));
  indexed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const result = entries.map(() => ({ lane: 0, laneCount: 1 }));

  // クラスタ単位で処理: 連続して重なるグループに分け、それぞれ独立にレーン割り当て
  let clusterStart = 0;
  let clusterMaxEnd = indexed[0]!.endMin;

  for (let k = 1; k <= indexed.length; k++) {
    const cur = indexed[k];
    const isInCluster = cur !== undefined && cur.startMin < clusterMaxEnd;
    if (!isInCluster || k === indexed.length) {
      // クラスタ [clusterStart, k) を確定
      const cluster = indexed.slice(clusterStart, k);
      const lanes: number[] = []; // lanes[i] = そのレーンの現時点の endMin
      for (const item of cluster) {
        // 空いているレーンを探す
        let assigned = -1;
        for (let li = 0; li < lanes.length; li++) {
          if (lanes[li] <= item.startMin) {
            assigned = li;
            break;
          }
        }
        if (assigned === -1) {
          lanes.push(item.endMin);
          assigned = lanes.length - 1;
        } else {
          lanes[assigned] = item.endMin;
        }
        result[item.i] = { lane: assigned, laneCount: 0 };
      }
      // クラスタの laneCount を確定
      const laneCount = lanes.length;
      for (const item of cluster) {
        result[item.i].laneCount = laneCount;
      }
      // 次のクラスタへ
      if (cur !== undefined) {
        clusterStart = k;
        clusterMaxEnd = cur.endMin;
      }
    } else {
      // 同じクラスタ内
      if (cur.endMin > clusterMaxEnd) clusterMaxEnd = cur.endMin;
    }
  }

  return result;
}

/**
 * タスク群から、絶対時刻配置のタイムラインエントリを計算する。
 *
 * - tasks は time が "HH:MM" 形式のもののみが対象（time が空のものは事前に除外しておく）
 * - 重なるタスクは横並びレーンで表示
 * - currentMin が指定されていれば、beforeNow フラグを立てる
 */
export function computeTimeline(
  currentMin: number | null,
  tasks: TimelineTask[],
): TimelineEntry[] {
  const valid = tasks
    .map((task) => {
      const startMin = parseHHMM(task.time);
      if (startMin === null) return null;
      const duration = Math.max(0, task.duration);
      return { task, startMin, endMin: startMin + duration };
    })
    .filter((x): x is { task: TimelineTask; startMin: number; endMin: number } => x !== null);

  const lanes = assignLanes(valid.map((v) => ({ startMin: v.startMin, endMin: v.endMin })));

  const result: TimelineEntry[] = valid.map((v, i) => ({
    task: v.task,
    startTime: formatHHMM(v.startMin),
    endTime: formatHHMM(v.endMin),
    startMin: v.startMin,
    endMin: v.endMin,
    lane: lanes[i]!.lane,
    laneCount: lanes[i]!.laneCount,
    overflow: v.endMin > 24 * 60,
    beforeNow: currentMin !== null && v.startMin < currentMin,
  }));

  // 表示順は startMin 昇順で
  result.sort((a, b) => a.startMin - b.startMin || a.lane - b.lane);
  return result;
}

/** 合計分数。 */
export function sumDuration(tasks: TimelineTask[]): number {
  return tasks.reduce((s, t) => s + Math.max(0, t.duration), 0);
}
