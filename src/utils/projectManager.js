import { openDB } from 'idb';
// 引入所有需要存檔的 Store
import { mainTrackClips, audioTrackClips, textTrackClips, uploadedFiles, projectSettings } from '../stores/timelineStore';
import { get } from 'svelte/store';

const DB_NAME = 'CapCutCloneDB';
const STORE_NAME = 'projects';
const PROJECT_KEY = 'auto_save_v1';

// 初始化資料庫
async function initDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
}

// 🔥 儲存專案 (Auto Save)
export async function saveProject() {
    const db = await initDB();
    
    // 取得所有 Store 的當前狀態
    const mainClips = get(mainTrackClips);
    const audioClips = get(audioTrackClips);
    const textClips = get(textTrackClips);
    const libraryFiles = get(uploadedFiles);
    const settings = get(projectSettings);

    const projectData = {
        main: mainClips,
        audio: audioClips,
        text: textClips,
        files: libraryFiles,
        settings: settings,
        lastModified: Date.now()
    };

    await db.put(STORE_NAME, projectData, PROJECT_KEY);
    console.log('Project Auto-saved @', new Date().toLocaleTimeString());
}

// 🔥 載入專案 (Auto Restore)
export async function loadProject() {
    const db = await initDB();
    const data = await db.get(STORE_NAME, PROJECT_KEY);

    if (!data) return false;

    // Helper: 重建 Blob URL
    const restoreAssets = (items) => {
        if (!items) return [];

        return items.map(item => {
            // 對於 Video/Audio/Image，如果有原始檔案 Blob，需要重建 URL
            if (item.file instanceof Blob || item.file instanceof File) {
                
                let restoredThumbnails = [];
                
                // 恢復縮圖陣列 (Video Clip 才有)
                if (item.thumbnails && Array.isArray(item.thumbnails)) {
                    restoredThumbnails = item.thumbnails.map(blob => URL.createObjectURL(blob));
                }

                return {
                    ...item,
                    // 恢復主檔案 URL
                    fileUrl: item.fileUrl ? URL.createObjectURL(item.file) : undefined,
                    url: item.url ? URL.createObjectURL(item.file) : undefined, // 素材庫用
                    
                    // 恢復縮圖 URL
                    thumbnailUrls: restoredThumbnails.length > 0 ? restoredThumbnails : (item.thumbnailUrls || []),
                    
                    // 確保 Blob 資料存在
                    thumbnails: item.thumbnails,
                    file: item.file
                };
            }
            // 對於 Text Clip 或沒有檔案的項目，直接回傳
            return item;
        });
    };

    // 依序恢復各個 Store
    const restoredMain = restoreAssets(data.main || []);
    const restoredAudio = restoreAssets(data.audio || []);
    const restoredText = restoreAssets(data.text || []); // 文字軌道
    const restoredLibrary = restoreAssets(data.files || []); // 素材庫

    // 寫回 Store
    mainTrackClips.set(restoredMain);
    audioTrackClips.set(restoredAudio);
    textTrackClips.set(restoredText);
    uploadedFiles.set(restoredLibrary);
    
    // 恢復專案設定 (16:9, 9:16 等)
    if (data.settings) {
        projectSettings.set(data.settings);
    }
    
    return true;
}

// 🔥 清除專案 (New Project)
export async function clearProject() {
    const db = await initDB();
    // 1. 刪除資料庫紀錄
    await db.delete(STORE_NAME, PROJECT_KEY);
    
    // 2. 清空所有 Store
    mainTrackClips.set([]);
    audioTrackClips.set([]);
    textTrackClips.set([]);
    uploadedFiles.set([]); 
    
    // 重置為預設設定 (16:9)
    projectSettings.set({ width: 1280, height: 720, aspectRatio: '16:9' });
}