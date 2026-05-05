import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Runs every 2 days at 06:00 UTC to prevent Supabase free-tier auto-pause
const handler = schedule("0 6 */2 * *", async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[keep-alive] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
    return { statusCode: 500 };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { error } = await supabase.rpc("now");

    if (error && error.code === "PGRST202") {
      // 'now' RPC not found — fall back to a lightweight table query
      const { error: fallbackError } = await supabase
        .from("agent_sessions")
        .select("id")
        .limit(1);

      if (fallbackError) throw fallbackError;
    } else if (error) {
      throw error;
    }

    console.log("[keep-alive] Supabase ping successful at", new Date().toISOString());
    return { statusCode: 200 };
  } catch (err) {
    console.error("[keep-alive] Supabase ping failed:", err);
    return { statusCode: 500 };
  }
});

export { handler };
