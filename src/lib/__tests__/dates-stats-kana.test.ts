import { describe, expect, it } from "vitest";
import { addDays, formatYmdShort, jstDateString, jstWeekRange, ymdToDbDate } from "../dates";
import { isValidKana, normalizeKana, parseCustomerQuery } from "../kana";
import { elapsedSeconds, inputSeconds, summarizeInputSeconds } from "../stats";

describe("日付(日本時間)", () => {
  it("UTCでは前日でも、日本時間で日付を決める", () => {
    // 2026-10-05 15:30 UTC = 2026-10-06 00:30 JST
    expect(jstDateString(new Date("2026-10-05T15:30:00Z"))).toBe("2026-10-06");
  });

  it("大みそかの夜中0時を過ぎたら新しい年の日付になる", () => {
    // 2026-12-31 15:00 UTC = 2027-01-01 00:00 JST
    expect(jstDateString(new Date("2026-12-31T14:59:59Z"))).toBe("2026-12-31");
    expect(jstDateString(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });

  it("日数の足し算は月・年をまたいでも正しい", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // うるう年
  });

  it("今週(月〜日)が年をまたぐ", () => {
    // 2026-12-31 は木曜
    expect(jstWeekRange(new Date("2026-12-31T03:00:00Z"))).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
    // 2027-01-03 は日曜 → 同じ週
    expect(jstWeekRange(new Date("2027-01-03T03:00:00Z"))).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });

  it("存在しない日付は弾く", () => {
    expect(() => ymdToDbDate("2026-02-30")).toThrow();
  });

  it("短い表示", () => {
    expect(formatYmdShort("2027-01-01")).toBe("1/1(金)");
  });
});

describe("summarizeInputSeconds", () => {
  it("0件なら全部 null", () => {
    expect(summarizeInputSeconds([])).toEqual({
      count: 0,
      average: null,
      median: null,
      withinTargetPercent: null,
    });
  });

  it("平均・中央値・30秒以内の割合", () => {
    expect(summarizeInputSeconds([20, 25, 30, 41])).toEqual({
      count: 4,
      average: 29,
      median: 27.5,
      withinTargetPercent: 75,
    });
  });

  it("平均は小数1桁に丸める", () => {
    expect(summarizeInputSeconds([10, 10, 11]).average).toBe(10.3);
  });

  it("負の値やおかしな値は数えない", () => {
    expect(summarizeInputSeconds([-5, Number.NaN, 12]).count).toBe(1);
  });
});

describe("elapsedSeconds", () => {
  it("ミリ秒の差を秒に丸める", () => {
    expect(elapsedSeconds(1_000, 19_600)).toBe(19);
  });
  it("マイナスは0、1時間超は3600にそろえる", () => {
    expect(elapsedSeconds(10_000, 5_000)).toBe(0);
    expect(elapsedSeconds(0, 5_000_000)).toBe(3600);
  });
});

describe("inputSeconds(入力にかかった秒数)", () => {
  it("画面を開いてから放置した時間は数えず、最初の入力から保存までを数える", () => {
    const openedAt = 0;
    const firstTapAt = 276_000; // 開いたまま4分半接客してから、最初のタップ
    const savedAt = 300_000;
    expect(inputSeconds(firstTapAt, savedAt)).toBe(24);
    expect(inputSeconds(firstTapAt, savedAt)).not.toBe(elapsedSeconds(openedAt, savedAt));
  });
  it("一度も入力していなければ0秒", () => {
    expect(inputSeconds(null, 300_000)).toBe(0);
  });
});

describe("カナ", () => {
  it("ひらがな・半角カナ・全角スペースを揃える", () => {
    expect(normalizeKana("やまだ　はなこ")).toBe("ヤマダ ハナコ");
    expect(normalizeKana("ﾔﾏﾀﾞ  ﾊﾅｺ ")).toBe("ヤマダ ハナコ");
  });

  it("漢字や英字はカナとして通さない", () => {
    expect(isValidKana(normalizeKana("山田"))).toBe(false);
    expect(isValidKana(normalizeKana("yamada"))).toBe(false);
    expect(isValidKana(normalizeKana("おおの ゆうこ"))).toBe(true);
  });

  it("検索語をカナと下4桁に分ける", () => {
    expect(parseCustomerQuery("やまだ 1234")).toEqual({ kana: "ヤマダ", last4: "1234" });
    expect(parseCustomerQuery("１２３４")).toEqual({ kana: null, last4: "1234" });
    expect(parseCustomerQuery("ヤマ")).toEqual({ kana: "ヤマ", last4: null });
    // 4桁でない数字は下4桁として使わない
    expect(parseCustomerQuery("090")).toEqual({ kana: null, last4: null });
  });
});
