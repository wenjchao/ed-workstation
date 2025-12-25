import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // 你的前端 invoke body: patientContext，所以這裡直接讀整包
    const patientContext = await req.json();

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `你是一位專業的急診科醫師助理 AI。請只回傳 JSON，不要多餘文字。
格式：
{
  "diagnoses":[{"name":"診斷","prob":0,"reason":"原因"}],
  "recommendations":[{"code":"代碼","name":"醫令","reason":"理由"}]
}

病人資料：${JSON.stringify(patientContext)}`,
                },
              ],
            },
          ],
          // ✅ 注意：是 responseMimeType (camelCase)
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    const data = await resp.json();

    // Gemini 429/401/403 會在這裡被回傳給前端
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data?.error ?? data }), {
        status: resp.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return new Response(JSON.stringify({ error: "Unexpected Gemini response", raw: data }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 解析 AI JSON
    const result = JSON.parse(raw);

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
