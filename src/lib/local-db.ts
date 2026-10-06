// seed のように「中身を全部消す」処理を、自分のPCのDB以外で動かさないための確認

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** 接続先が自分のPCのDBなら null、違えば止める理由を返す */
export function refuseUnlessLocal(url: string | undefined): string | null {
  if (!url) return "DATABASE_URL が設定されていません";
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "DATABASE_URL の形が読めません";
  }
  return LOCAL_HOSTS.has(host) ? null : `接続先が ${host} です。seed は localhost のDBにだけ流せます`;
}
