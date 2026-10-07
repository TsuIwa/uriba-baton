import { describe, expect, it } from "vitest";
import { staffOptionLabel } from "../staff-label";

describe("staffOptionLabel", () => {
  const all = [
    { id: 3, name: "高橋 恵" },
    { id: 104, name: "佐藤 光" },
    { id: 117, name: "佐藤 光" },
  ];
  it("名前が1人だけなら名前のまま", () => {
    expect(staffOptionLabel(all[0], all)).toBe("高橋 恵");
  });
  it("同じ名前がいれば ID の末尾で見分ける", () => {
    expect(staffOptionLabel(all[1], all)).toBe("佐藤 光(ID末尾04)");
    expect(staffOptionLabel(all[2], all)).toBe("佐藤 光(ID末尾17)");
  });
});
