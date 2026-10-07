// 入力にかかった秒数の集計。「30秒以内で残せているか」を数字で確かめるため。

export const TARGET_SECONDS = 30;

export type InputSecondsSummary = {
  count: number;
  /** 平均(小数1桁)。0件なら null */
  average: number | null;
  /** 中央値。0件なら null */
  median: number | null;
  /** 30秒以内の割合(0〜100の整数)。0件なら null */
  withinTargetPercent: number | null;
};

export function summarizeInputSeconds(seconds: (number | null)[]): InputSecondsSummary {
  // 測れなかった記録(null)は数えない
  const values = seconds.filter((s): s is number => s !== null && Number.isFinite(s) && s >= 0);
  if (values.length === 0) {
    return { count: 0, average: null, median: null, withinTargetPercent: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, s) => acc + s, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const within = sorted.filter((s) => s <= TARGET_SECONDS).length;
  return {
    count: sorted.length,
    average: Math.round((sum / sorted.length) * 10) / 10,
    median,
    withinTargetPercent: Math.round((within / sorted.length) * 100),
  };
}

/**
 * 入力にかかった秒数 = 最初の入力(タップ・文字入力)から保存まで。
 * 画面を開いた時からだと、画面を開いたまま接客している時間が混ざるため。
 * 一度も入力していない(=最初の入力の時刻がない)ときは null(測れなかった。0秒として集計に混ぜない)。
 */
export function inputSeconds(firstInputAtMs: number | null, savedAtMs: number): number | null {
  return firstInputAtMs === null ? null : elapsedSeconds(firstInputAtMs, savedAtMs);
}

/**
 * 始めた時刻と保存した時刻(ミリ秒)から、保存する秒数を決める。
 * 端末の時計が戻った等でマイナスになったら0、DBの上限(3600秒)を超えたら上限にそろえる。
 */
export function elapsedSeconds(startedAtMs: number, savedAtMs: number): number {
  const raw = Math.round((savedAtMs - startedAtMs) / 1000);
  return Math.min(Math.max(raw, 0), 3600);
}
