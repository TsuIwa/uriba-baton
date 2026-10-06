import { describe, expect, it } from "vitest";
import { refuseUnlessLocal } from "../local-db";

describe("refuseUnlessLocal(seed の接続先の確認)", () => {
  it("自分のPCのDBなら通す", () => {
    expect(refuseUnlessLocal("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBeNull();
    expect(refuseUnlessLocal("postgresql://postgres:postgres@localhost:5432/postgres")).toBeNull();
  });
  it("外のDB・空・読めない値は止める", () => {
    expect(refuseUnlessLocal("postgresql://u:p@db.example.com:5432/postgres")).toContain("db.example.com");
    expect(refuseUnlessLocal(undefined)).not.toBeNull();
    expect(refuseUnlessLocal("not a url")).not.toBeNull();
  });
});
