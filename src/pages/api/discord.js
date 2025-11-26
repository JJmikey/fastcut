export const POST = async ({ request }) => {
    try {
      // 1. 讀取環境變數
      // 在 Astro 中，本地開發讀取 .env，線上讀取 Cloudflare Settings
      // 注意：這裡為了簡單，我們先嘗試讀取 import.meta.env
      // 如果是 Cloudflare SSR，通常變數會在 request 的 context 裡，但我們先用通用寫法
      const WEBHOOK_URL = import.meta.env.DISCORD_WEBHOOK_URL;
  
      if (!WEBHOOK_URL) {
          return new Response(JSON.stringify({ error: "Webhook URL not configured" }), { status: 500 });
      }
  
      // 2. 讀取前端資料
      const data = await request.json();
      
      // 3. 構建訊息
      const payload = {
        content: "🎉 **FastVideoCutter: New Export!**",
        embeds: [{
          title: "Export Successful",
          color: 5814783,
          fields: [
            { name: "Filename", value: data.filename || "Unknown", inline: true },
            { name: "Duration", value: `${data.duration}s`, inline: true },
            { name: "Time", value: new Date().toLocaleString(), inline: false }
          ]
        }]
      };
  
      // 4. 發送給 Discord
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
  
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
  
    } catch (err) {
      console.error("API Error:", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  };