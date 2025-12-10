// src/utils/srtParser.js

/**
 * 將時間字串 (00:00:01,500) 轉換為秒數 (1.5)
 */
function parseTime(timeString) {
    if (!timeString) return 0;
    const parts = timeString.split(':');
    const secondsParts = parts[2].split(',');
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10);

    return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
}

/**
 * 解析 SRT 內容並回傳 Clip 陣列數據
 */
export function parseSRT(srtContent) {
    // 統一換行符號
    const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split('\n\n'); // SRT 通常用空行分隔區塊
    
    const results = [];

    blocks.forEach(block => {
        const lines = block.split('\n');
        // 簡單過濾無效區塊 (至少要有 ID, 時間, 文字)
        if (lines.length >= 3) {
            // 格式範例：
            // 1
            // 00:00:01,000 --> 00:00:04,000
            // Hello World
            // (可能還有第二行文字)

            const timeLine = lines[1];
            if (timeLine.includes('-->')) {
                const [startStr, endStr] = timeLine.split(' --> ');
                const start = parseTime(startStr.trim());
                const end = parseTime(endStr.trim());
                
                // 剩下的行數都是文字內容 (把它們接起來)
                const textLines = lines.slice(2).join('\n');
                
                if (textLines.trim()) {
                    results.push({
                        start,
                        end,
                        duration: end - start,
                        text: textLines
                    });
                }
            }
        }
    });

    return results;
}