/**
 * 自然文・ISO の日付表現を yyyy-MM-dd（ローカル）へ正規化する。
 *
 * ハーネスの「コードで縛る」側。AI が返す日付は揺れるので、ここで決まった
 * 形式に落とす。解釈できないものは空文字を返す（誤った日付を作らない）。
 *
 * 基準日（today）は server action から渡す。テスト時は固定値を渡せる。
 */

import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  nextDay,
  setDate,
  type Day,
} from "date-fns";

const toIso = (d: Date) => format(d, "yyyy-MM-dd");

/** 曜日文字 → date-fns の Day（0=日, 1=月, …, 6=土）。 */
const WEEKDAYS: Record<string, Day> = {
  日: 0,
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
};

/** 全角数字を半角へ。 */
function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * @param input AI が返した日付表現（ISO・自然文・空文字）
 * @param today 基準日（デフォルトは現在）
 * @returns yyyy-MM-dd、または解釈不能・空入力なら ""
 */
export function normalizeDate(input: string, today: Date = new Date()): string {
  const raw = toHalfWidthDigits((input ?? "").trim());
  if (!raw) return "";

  // 1) ISO（yyyy-MM-dd / yyyy/MM/dd）
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? "" : toIso(dt);
  }

  // 2) 相対（今日・明日 など）
  const relative: Record<string, number> = {
    今日: 0,
    本日: 0,
    きょう: 0,
    今日中: 0,
    明日: 1,
    あした: 1,
    明日中: 1,
    明後日: 2,
    あさって: 2,
    昨日: -1,
    きのう: -1,
  };
  if (raw in relative) return toIso(addDays(today, relative[raw]));

  // 3) N日後 / N週間後 / Nヶ月後
  const daysAfter = raw.match(/^(\d+)日後$/);
  if (daysAfter) return toIso(addDays(today, Number(daysAfter[1])));
  const weeksAfter = raw.match(/^(\d+)週間後$/);
  if (weeksAfter) return toIso(addDays(today, Number(weeksAfter[1]) * 7));
  const monthsAfter = raw.match(/^(\d+)[ヶか]月後$/);
  if (monthsAfter) return toIso(addMonths(today, Number(monthsAfter[1])));

  // 4) 月末系
  if (raw === "今月末" || raw === "月末") return toIso(endOfMonth(today));
  if (raw === "来月末") return toIso(endOfMonth(addMonths(today, 1)));
  if (raw === "来月") return toIso(setDate(addMonths(today, 1), 1));

  // 5) 週末（= 今週の土曜）/ 来週
  if (raw === "今週末" || raw === "週末") {
    return today.getDay() === 6 ? toIso(today) : toIso(nextDay(today, 6));
  }
  if (raw === "来週") return toIso(addDays(today, 7));

  // 6) 曜日（来週/今週 prefix 可、「曜日」「曜」suffix 可）
  const weekday = raw.match(/^(来週|今週|次の|次)?([日月火水木金土])曜日?$/);
  if (weekday) {
    const [, prefix, wd] = weekday;
    const target = WEEKDAYS[wd];
    let dt = today.getDay() === target ? today : nextDay(today, target);
    if (prefix === "来週") dt = addDays(dt, 7);
    return toIso(dt);
  }

  // 基準日の 0:00（today は破壊しない）
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  // 7) M月D日
  const monthDay = raw.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (monthDay) {
    const m = Number(monthDay[1]) - 1;
    const d = Number(monthDay[2]);
    let dt = new Date(today.getFullYear(), m, d);
    // 既に過ぎていれば翌年扱い
    if (dt.getTime() < startOfToday) {
      dt = new Date(today.getFullYear() + 1, m, d);
    }
    return Number.isNaN(dt.getTime()) ? "" : toIso(dt);
  }

  // 8) D日（今月の D 日。過ぎていれば翌月）
  const dayOnly = raw.match(/^(\d{1,2})日$/);
  if (dayOnly) {
    const d = Number(dayOnly[1]);
    let dt = setDate(today, d);
    if (dt.getTime() < startOfToday) dt = setDate(addMonths(today, 1), d);
    return Number.isNaN(dt.getTime()) ? "" : toIso(dt);
  }

  // 解釈不能 → 空（誤った日付を作らない）
  return "";
}
