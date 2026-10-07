// 旧版のDB(見本入り)から、今のマイグレーションで上げたときの確かめ。
// 同じサーバーに使い捨てのDBを作り、マイグレーションのSQLを順番に流す。最後にDBごと消す。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_NAME = "uriba_migration_check";
const MIGRATIONS = join(process.cwd(), "prisma", "migrations");
/** ここまでが「旧版」(記録の出どころ・送信ID・記録時点の役割がまだ無い) */
const OLD_VERSION_LAST = "20261006120037_kana_prefix_index";
/** この版から、同じ名前のスタッフが入れられる(呼び名はまだ無い) */
const SAME_NAME_ALLOWED = "20261007002000_version_fingerprint_nullable_seconds";

function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function urlFor(db: string): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = `/${db}`;
  return u.toString();
}

let admin: Client;
let db: Client;

async function run(dir: string) {
  await db.query(readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8"));
}

beforeAll(async () => {
  admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  db = new Client({ connectionString: urlFor(DB_NAME) });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await admin.end();
});

describe("旧版の見本入りDBから上げる", () => {
  it("既存の記録は出どころ不明(UNKNOWN)になり、実測(MANUAL)に混ざらない", async () => {
    const dirs = migrationDirs();
    const cut = dirs.indexOf(OLD_VERSION_LAST);
    expect(cut).toBeGreaterThanOrEqual(0);

    // 1) 旧版まで流す
    for (const dir of dirs.slice(0, cut + 1)) await run(dir);

    // 2) 旧版の形で、見本のような行を入れる
    await db.query(`INSERT INTO stores (id, name) VALUES (1, '旧版の店')`);
    await db.query(`INSERT INTO staff (id, store_id, name, role) VALUES (1, 1, '旧 常勤', 'REGULAR'), (2, 1, '旧 イベント', 'EVENT')`);
    await db.query(`INSERT INTO topics (id, code, label, sort_order) VALUES (1, 'MNP', 'のりかえ', 1)`);
    await db.query(`INSERT INTO checklist_items (id, topic_id, label, sort_order) VALUES (1, 1, 'キャンペーン', 1)`);
    await db.query(`INSERT INTO customers (id, store_id, name_kana, phone_last4)
      VALUES ('11111111-1111-4111-8111-111111111111', 1, 'キュウ ハン', '0001')`);
    await db.query(`INSERT INTO visits (id, customer_id, staff_id, temperature, input_seconds, visited_at)
      VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 2, 'CONSIDERING', 25, '2026-09-30T12:00:00+09:00')`);
    await db.query(`INSERT INTO visit_topics (visit_id, topic_id) VALUES ('22222222-2222-4222-8222-222222222222', 1)`);
    await db.query(`INSERT INTO visit_checks (visit_id, topic_id, checklist_item_id)
      VALUES ('22222222-2222-4222-8222-222222222222', 1, 1)`);

    // 3) 同じ名前のスタッフが入れられる版まで流し、同じ名前の人を入れる
    const mid = dirs.indexOf(SAME_NAME_ALLOWED);
    expect(mid).toBeGreaterThan(cut);
    for (const dir of dirs.slice(cut + 1, mid + 1)) await run(dir);
    await db.query(`INSERT INTO staff (id, store_id, name, role) VALUES (3, 1, '旧 常勤', 'EVENT')`);

    // 4) 残りを全部流す
    for (const dir of dirs.slice(mid + 1)) await run(dir);

    // 既存の記録:出どころ不明・役割は今のスタッフの役割・送信IDあり・指紋は空・秒数はそのまま
    const v = (await db.query(`SELECT source, staff_role_at_visit, request_id, request_fingerprint, input_seconds FROM visits`)).rows[0];
    expect(v.source).toBe("UNKNOWN");
    expect(v.staff_role_at_visit).toBe("EVENT");
    expect(v.request_id).toBeTruthy();
    expect(v.request_fingerprint).toBeNull();
    expect(v.input_seconds).toBe(25);

    // 既存の案内:版1を説明したことになる
    const c = (await db.query(`SELECT explained_version FROM visit_checks`)).rows[0];
    expect(c.explained_version).toBe(1);

    // これから入る記録の既定は MANUAL
    await db.query(`INSERT INTO visits (id, customer_id, staff_id, staff_role_at_visit, temperature, input_seconds)
      VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 1, 'REGULAR', 'POSITIVE', 20)`);
    const counts = (await db.query(`SELECT source, count(*)::int AS n FROM visits GROUP BY source ORDER BY source`)).rows;
    expect(counts).toEqual([
      { source: "MANUAL", n: 1 },
      { source: "UNKNOWN", n: 1 },
    ]);

    // 既存のスタッフの呼び名は名前で埋まる
    const names = (await db.query(`SELECT name, display_name FROM staff ORDER BY id`)).rows;
    // 同じ名前が2人いたら、2人目からは「名前-ID」で重ならない
    expect(names.map((r) => r.display_name)).toEqual(["旧 常勤", "旧 イベント", "旧 常勤-3"]);

    // これから先も、呼び名は店内で重ならない
    await expect(
      db.query(`INSERT INTO staff (id, store_id, name, display_name, role) VALUES (4, 1, '別の人', '旧 常勤', 'EVENT')`),
    ).rejects.toThrow();
  });
});
