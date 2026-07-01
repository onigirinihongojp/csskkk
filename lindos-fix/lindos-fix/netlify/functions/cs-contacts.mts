import type { Context, Config } from "@netlify/functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req: Request, context: Context) => {
  // 1) パスワードチェック（サーバー側のみで判定。ブラウザにはこの値は一切渡らない）
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const expected = Netlify.env.get("CS_CONTACTS_PASSWORD");

  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2) Supabase接続情報（service_role。RLSを無視して正規のアクセスをする）
  const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const method = req.method;

  let path = "/rest/v1/cs_contacts";
  let body: string | undefined;

  if (method === "GET") {
    path += "?select=*&order=created_at.desc";
  } else if (method === "POST") {
    body = await req.text();
  } else if (method === "PATCH" || method === "DELETE") {
    if (!id || !UUID_RE.test(id)) {
      return new Response(JSON.stringify({ error: "Invalid or missing id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    path += `?id=eq.${id}`;
    if (method === "PATCH") body = await req.text();
  } else {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body,
  });

  const text = await res.text();
  return new Response(text || "null", {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/cs-contacts",
};
