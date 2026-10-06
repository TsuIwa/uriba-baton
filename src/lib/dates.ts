// 日付の扱い。売り場は日本なので「今日」「今週」は日本時間で決める。
// サーバーがどのタイムゾーンで動いても同じ結果になるよう、Intl で JST に直してから計算する。

const JST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** その時点の日本の日付を "YYYY-MM-DD" で返す */
export function jstDateString(at: Date): string {
  return JST_FORMAT.format(at);
}

/** "YYYY-MM-DD" に日数を足す(年・月またぎもそのまま正しく進む) */
export function addDays(ymd: string, days: number): string {
  const d = ymdToDbDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * DBの DATE 型に渡す値。Prisma は DATE を UTC の0時として扱うので、
 * "2026-10-06" → 2026-10-06T00:00:00Z にする。
 */
export function ymdToDbDate(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`日付の形が違います: ${ymd}`);
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd) {
    throw new Error(`存在しない日付です: ${ymd}`);
  }
  return d;
}

/** DBから来た DATE を "YYYY-MM-DD" に戻す */
export function dbDateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 「今週」= 今日を含む月曜〜日曜(日本時間)。
 * 例: 2026-12-31(木) → 2026-12-28 〜 2027-01-03
 */
export function jstWeekRange(at: Date): { start: string; end: string } {
  const today = jstDateString(at);
  const weekday = ymdToDbDate(today).getUTCDay(); // 0=日 … 6=土
  const fromMonday = (weekday + 6) % 7;
  const start = addDays(today, -fromMonday);
  return { start, end: addDays(start, 6) };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-06" → "10/6(火)" */
export function formatYmdShort(ymd: string): string {
  const d = ymdToDbDate(ymd);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

/** 来店日時 → 日本時間の "10/6(火)" */
export function formatJstShort(at: Date): string {
  return formatYmdShort(jstDateString(at));
}
