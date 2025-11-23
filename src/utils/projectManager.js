import { openDB } from 'idb';
import { mainTrackClips, audioTrackClips } from '../stores/timelineStore';
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
    
    // 取得目前的狀態
    const mainClips = get(mainTrackClips);
    const audioClips = get(audioTrackClips);

    // 準備要存的資料
    // 注意：我們不需要存 'fileUrl' (因為它是暫時的)，但我們必須確保 'file' 物件本身有被存起來
    // 在 FileUploader 裡，我們要把原始 file 物件掛載到 clip 上
    
    // 為了節省空間，我們可以只存必要的資料
    // 但 IndexedDB 可以直接存 JavaScript 物件，包含 File/Blob，所以直接存整個 Array 最簡單
    const projectData = {
        main: mainClips,
        audio: audioClips,
        lastModified: Date.now()
    };

    await db.put(STORE_NAME, projectData, PROJECT_KEY);
    console.log('Project Auto-saved @', new Date().toLocaleTimeString());
}

// 🔥 載入專案 (Auto Restore)
export async function loadProject() {
    const db = await initDB();
    const data = await db.get(STORE_NAME, PROJECT_KEY);

    if (!data) return false; // 沒有存檔

    // 恢復資料的重要步驟：重新生成 Blob URL
    // 因為上次存的 blob:url 現在已經無效了
    
    const restoreClips = (clips) => {
        return clips.map(clip => {
            // 如果 clip 裡面有原始 file 物件 (我們等下要在 Uploader 裡確保這點)
            // 我們就用它來生成新的 url
            if (clip.file instanceof Blob || clip.file instanceof File) {
                return {
                    ...clip,
                    fileUrl: URL.createObjectURL(clip.file)
                };
            }
            return clip;
        });
    };

    const restoredMain = restoreClips(data.main || []);
    const restoredAudio = restoreClips(data.audio || []);

    // 更新 Store
    mainTrackClips.set(restoredMain);
    audioTrackClips.set(restoredAudio);
    
    return true;
}

// 清除專案 (例如使用者按了 "New Project")
export async function clearProject() {
    const db = await initDB();
    await db.delete(STORE_NAME, PROJECT_KEY);
    mainTrackClips.set([]);
    audioTrackClips.set([]);
}