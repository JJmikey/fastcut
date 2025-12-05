export const POST = async (context) => {
  try {
    const { request, locals } = context;
    
    // 讀取環境變數
    let WEBHOOK_URL = locals?.runtime?.env?.DISCORD_WEBHOOK_URL || import.meta.env.DISCORD_WEBHOOK_URL;

    if (!WEBHOOK_URL) {
        return new Response(JSON.stringify({ error: "Missing Webhook URL" }), { status: 500 });
    }

    const data = await request.json();
    const type = data.type; // 'export', 'import', 'sample', 'visit', 'feedback', 'error'

    // 🔥 定義不同事件的樣式
    let title = "New Activity";
    let color = 10070709; // 預設灰色
    let description = "";

    switch (type) {
        case 'export':
            title = "🚀 New Video Exported!";
            color = 5814783; // 綠色 (Green)
            break;
        case 'export_start':
            title = "⏳ Export Started..."; 
            color = 16776960; // 黃色
            break;
        case 'import':
            title = "📂 User Imported Media";
            color = 3901635; // 藍色 (Blue)
            break;
        case 'sample':
            title = "🧪 User Loaded Sample Project";
            color = 11665663; // 紫色 (Purple)
            break;
        case 'visit':
            title = "👀 New Visitor";
            color = 9807270; // 灰色
            break;
        case 'feedback': // 用戶反饋
            title = "📩 New User Feedback";
            color = 3891958; // 深天藍色
            break;
        case 'error':
            title = "🚨 Export Error";
            color = 15548997; // 紅色
            // 🔥🔥🔥 關鍵修正：把錯誤訊息放進描述，不然只會看到標題 🔥🔥🔥
            description = data.errorMessage ? `**Error:** ${data.errorMessage}` : "Unknown error occurred";
            break;
    }

    // 構建 Fields
    const fields = [];
    
    // 原有的邏輯 (針對媒體操作)
    if (data.filename) fields.push({ name: "File", value: data.filename, inline: false });
    if (data.fileCount) fields.push({ name: "Count", value: `${data.fileCount} files`, inline: true });
    if (data.duration) fields.push({ name: "Duration", value: `${data.duration}s`, inline: true });
    
    // 針對 Feedback 的邏輯
    if (type === 'feedback') {
        fields.push({ 
            name: "User Contact", 
            value: data.contact ? data.contact : "Anonymous", 
            inline: false 
        });
        fields.push({ 
            name: "Message", 
            value: data.message || "No content", 
            inline: false 
        });
    }

    // 🔥 Error 專用 Field (如果前端有傳 stack trace)
    if (type === 'error' && data.stack) {
         fields.push({ name: "Stack", value: data.stack.substring(0, 1000), inline: false });
    }

    // 加上時間戳記
    fields.push({ name: "Time", value: new Date().toLocaleString(), inline: false });

    const payload = {
      embeds: [{
        title: title,
        color: color,
        description: description,
        fields: fields
      }]
    };

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    console.error("API Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};