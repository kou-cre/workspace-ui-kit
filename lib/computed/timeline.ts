/**
 * タイムライン計算ヘルパー（純粋関数）。
 *
 * - 始業時刻 + duration の累積で各タスクの開始/終了時刻を派生
 * - task.time が "HH:MM" なら、その時刻を固定開始時刻として尊重
 * - currentMin が workStartMin より大きい場合、起点を currentMin にオーバーライド
 *   （現在時刻より前にタスクが流れないようにする）
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
 * 順序＋累積でタイムラインを計算する。
 * - tasks は `order` 昇順 + `duration > 0` 済みであることを呼び元が保証する
 * - task.time が "HH:MM" で、それが現在の cursor より後ろの時刻なら、その時刻に固定（前に空き時間ができる）
 * - currentMin が指定されており workStartMin より大きい場合、cursor の起点を currentMin にする
 */
export function computeTimeline(
  workStartTime: string,
  currentMin: number | null,
  tasks: TimelineTask[],
): TimelineEntry[] {
  const workMin = parseHHMM(workStartTime) ?? 9 * 60;
  const startCursor =
    currentMin !== null && currentMin > workMin ? currentMin : workMin;

  let cursor = startCursor;
  const result: TimelineEntry[] = [];
  for (const task of tasks) {
    const fixedStart = parseHHMM(task.time);
    const start =
      fixedStart !== null && fixedStart > cursor ? fixedStart : cursor;
    const duration = Math.max(0, task.duration);
    const end = start + duration;
    result.push({
      task,
      startTime: formatHHMM(start),
      endTime: formatHHMM(end),
      startMin: start,
      endMin: end,
      overflow: end > 24 * 60,
      beforeNow: currentMin !== null && start < currentMin,
    });
    cursor = end;
  }
  return result;
}

/** 合計分数。 */
export function sumDuration(tasks: TimelineTask[]): number {
  return tasks.reduce((s, t) => s + Math.max(0, t.duration), 0);
}
