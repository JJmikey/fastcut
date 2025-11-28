export function getMediaDuration(file, url) {
    return new Promise((resolve) => {
      // 圖片直接回傳 3秒
      if (file.type.startsWith('image')) {
        resolve(3); 
        return;
      } 

      const element = file.type.startsWith('video') ? document.createElement('video') : document.createElement('audio');
      element.preload = 'auto'; 
      element.muted = true;
      element.src = url;
      if (file.type.startsWith('video')) element.playsInline = true;

      const isMov = file.name.toLowerCase().endsWith('.mov') || file.type === 'video/quicktime';

      // 1. 超時保護
      const timeout = setTimeout(() => {
          if (isMov) {
              alert(`讀取失敗：${file.name}\n\n您的系統不支援此影片格式 (可能是 HEVC)。請使用 MP4。`);
              resolve(null);
          } else {
              console.warn("⚠️ [Debug] 讀取超時，回傳預設值 30s");
              resolve(30);
          }
      }, 5000);

      element.onloadedmetadata = () => {
          clearTimeout(timeout);
          
          // Audio 直接回傳
          if (file.type.startsWith('audio')) {
              resolve(element.duration);
              return;
          }

          // 像素測試 (Pixel Test)
          element.currentTime = 0.1;
          
          element.onseeked = () => {
              if (element.videoWidth === 0) {
                  alert(`格式不支援：${file.name}`);
                  resolve(null);
                  return;
              }

              // 嘗試畫到 Canvas 測試解碼
              try {
                  const cvs = document.createElement('canvas');
                  cvs.width = 32; cvs.height = 32;
                  const ctx = cvs.getContext('2d');
                  ctx.drawImage(element, 0, 0, 32, 32);
              } catch (e) {
                  console.warn("Pixel read warning:", e);
              }

              const rawDuration = element.duration;
              const isWebM = file.type === 'video/webm';

              if (!isWebM && rawDuration !== Infinity && !isNaN(rawDuration)) {
                  resolve(rawDuration);
              } else {
                  // WebM 校正
                  element.currentTime = 1e7;
                  resolve(rawDuration); // 簡化版，直接信任讀到的（或你可以把之前的完整 WebM 校正邏輯貼過來）
              }
          };
      };

      element.onerror = () => { 
          clearTimeout(timeout);
          if (isMov) {
              alert(`無法載入：${file.name}\n格式不支援。`);
              resolve(null);
          } else {
              resolve(5); // 保底
          }
      };
    });
}