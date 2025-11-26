export async function decodeGifFrames(url) {
    // 1. 檢查 API
    if (!('ImageDecoder' in window)) {
        console.error("❌ 瀏覽器不支援 ImageDecoder API");
        throw new Error("Browser does not support ImageDecoder");
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    
    const decoder = new ImageDecoder({ 
        data: new DataView(buffer), 
        type: 'image/gif' 
    });

    // 🔥🔥🔥 關鍵修正：等待軌道準備就緒 🔥🔥🔥
    await decoder.tracks.ready;

    // 防呆檢查
    if (!decoder.tracks.selectedTrack) {
        throw new Error("GIF 解碼失敗：找不到影像軌道 (selectedTrack is null)");
    }

    const frames = [];
    let accumulatedDuration = 0;

    // 現在可以安全讀取 frameCount 了
    const frameCount = decoder.tracks.selectedTrack.frameCount;
    console.log(`🎞️ [GIF Helper] GIF 解析成功，總幀數: ${frameCount}`);

    for (let i = 0; i < frameCount; i++) {
        // decode 也是非同步的
        const result = await decoder.decode({ frameIndex: i });
        
        // duration 單位是微秒 (us)，轉成秒 (s)
        // 如果 GIF 沒有定義 duration (極少見)，給個預設值 0.1s
        const duration = result.image.duration ? result.image.duration / 1_000_000 : 0.1; 
        
        frames.push({
            image: result.image, // VideoFrame
            duration: duration,
            startTime: accumulatedDuration
        });

        accumulatedDuration += duration;
    }

    console.log(`✅ [GIF Helper] 解碼完成。總時長: ${accumulatedDuration.toFixed(2)}s`);

    return {
        frames,
        totalDuration: accumulatedDuration
    };
}