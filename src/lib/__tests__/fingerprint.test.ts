import { describe, expect, it } from "vitest";
import { visitFingerprint } from "../fingerprint";
import type { VisitInput } from "../visit-input";

const input: VisitInput = {
  requestId: "7d1c2b9e-3f4a-4b6c-8d2e-1a0b9c8d7e6f",
  staffId: 1,
  customer: { kind: "existing", id: "0b6f6a3e-6f1e-4c55-9a43-2a4f3c1d9e10" },
  topicIds: [2, 1],
  checks: [
    { topicId: 1, checklistItemId: 11, unclear: false },
    { topicId: 1, checklistItemId: 10, unclear: true },
  ],
  temperature: "CONSIDERING",
  actions: [{ kind: "QUOTE", note: null }],
  nextVisitDate: "2027-01-02",
  memo: null,
  inputSeconds: 24,
};

describe("visitFingerprint(送った内容の指紋)", () => {
  it("並び順と入力秒数が違うだけなら、同じ指紋(押し直しは同じ内容)", () => {
    const again = {
      ...input,
      topicIds: [1, 2],
      checks: [...input.checks].reverse(),
      inputSeconds: 31,
    };
    expect(visitFingerprint(again)).toBe(visitFingerprint(input));
  });

  it("中身が1つでも違えば、違う指紋", () => {
    expect(visitFingerprint({ ...input, temperature: "POSITIVE" })).not.toBe(visitFingerprint(input));
    expect(visitFingerprint({ ...input, memo: "追記" })).not.toBe(visitFingerprint(input));
    expect(visitFingerprint({ ...input, staffId: 2 })).not.toBe(visitFingerprint(input));
    expect(
      visitFingerprint({ ...input, checks: input.checks.map((c) => ({ ...c, unclear: false })) }),
    ).not.toBe(visitFingerprint(input));
  });
});
