// src/utils/thumbnailGenerator.js

export async function generateThumbnails(file, fixedDuration) {
    if (file.type.startsWith('image')) return [file]; 
    if (!file.type.startsWith('video')) return [];

    return new Promise(async (resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;

        try {
            await new Promise((resolveLoad, rejectLoad) => {
                video.onloadeddata = resolveLoad;
                video.onerror = () => rejectLoad(new Error(`Failed to load video for thumbnails: ${file.name}`));
            });

            if (!video.videoWidth || !video.videoHeight) {
                throw new Error(`Unsupported video dimensions for ${file.name}`);
            }

            let duration = fixedDuration;
            if (!duration || duration === Infinity || isNaN(duration)) duration = 30;

            const count = 5;
            const blobs = [];

            const canvas = document.createElement('canvas');
            const scale = 150 / (video.videoWidth || 1280);
            canvas.width = (video.videoWidth || 1280) * scale;
            canvas.height = (video.videoHeight || 720) * scale;
            const ctx = canvas.getContext('2d');

            // 備用幀 (嘗試抓第 0.5 秒，避免 0.0 秒是全黑)
            let backupBlob = null;
            try {
                video.currentTime = 0.5;
                await new Promise(r => { video.onseeked = r; setTimeout(r, 1000); });
                if (video.videoWidth) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    backupBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.6));
                }
            } catch (e) {}

            for (let i = 0; i < count; i++) {
                // 如果影片後面是空的，縮圖自然會抓到黑畫面，這是正常的
                const time = (duration / count) * i;

                try {
                    if (!Number.isFinite(time)) throw new Error("Invalid time");
                    video.currentTime = time;

                    // 🔥 修改：放寬超時限制到 800ms (WebM seek 比較慢)
                    await new Promise((seekResolve, seekReject) => {
                        const timer = setTimeout(() => seekReject('timeout'), 800);
                        video.onseeked = () => { clearTimeout(timer); seekResolve(); };
                    });

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.6));
                    blobs.push(blob);

                } catch (e) {
                    // 如果失敗，用備用幀
                    if (backupBlob) blobs.push(backupBlob);
                }
            }

            // 確保不回傳空陣列
            if (blobs.length === 0 && backupBlob) blobs.push(backupBlob);
            resolve(blobs);
        } catch (err) {
            reject(err);
        } finally {
            URL.revokeObjectURL(video.src);
        }
    });
}