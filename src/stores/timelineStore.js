import { writable, get } from 'svelte/store';

// 軌道資料
export const mainTrackClips = writable([]);
export const audioTrackClips = writable([]);
export const textTrackClips = writable([]);

// 狀態資料
export const selectedClipIds = writable([]);
export const draggedFile = writable(null);

// 🔥🔥🔥 修正：補上 uploadedFiles (素材庫) 🔥🔥🔥
export const uploadedFiles = writable([]); 

export const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

// Helper: 建立一般 Clip (Video/Image/Audio)
export const createClip = (fileData, startOffset, rawFile = null) => ({
    id: generateId(),
    fileUrl: fileData.url,
    name: fileData.name,
    type: fileData.type,
    startOffset: startOffset,
    duration: fileData.duration || 5,
    // 圖片無限長，影片固定長
    sourceDuration: fileData.type.startsWith('image') ? Infinity : (fileData.duration || 5),
    mediaStartOffset: 0,
    volume: 1.0,
    file: rawFile, // 原始檔案 (IndexedDB 用)
    thumbnailUrls: fileData.thumbnailUrls // 縮圖 URL
});

// Helper: 建立文字 Clip
export const createTextClip = (startOffset) => ({
    id: generateId(),
    type: 'text',
    name: 'Text',
    startOffset: startOffset,
    duration: 3,
    sourceDuration: Infinity,
    mediaStartOffset: 0,
    text: 'New Text',
    fontSize: 40,
    color: '#ffffff',
    fontWeight: 'normal', // 新增屬性，預設不加粗
     // 🔥 新增：字體屬性 (預設用 Arial)
     fontFamily: '"Microsoft JhengHei", "PingFang TC", Arial, sans-serif',
    x: 50, 
    y: 50,
    volume: 1.0 ,
    // 🔥 新增：背景與邊框屬性
    showBackground: false,      // 是否顯示背景
    backgroundColor: '#38bdf8', // 背景顏色
    strokeWidth: 2,             // 描邊寬度 (0 代表無)
    strokeColor: '#FFFF00'      // 描邊顏色
});

// Helper: 解決重疊 (Ripple Edit)
export function resolveOverlaps(clips, activeId = null) {
    if (clips.length === 0) return [];

    // 1. 排序
    const sortedClips = [...clips].sort((a, b) => {
        if (a.id === b.id) return 0;
        const diff = a.startOffset - b.startOffset;
        // 優先權判斷
        if (Math.abs(diff) < 0.1) {
            if (a.id === activeId) return -1; 
            if (b.id === activeId) return 1; 
        }
        return diff;
    });

    // 2. 推擠
    for (let i = 1; i < sortedClips.length; i++) {
        const prevClip = sortedClips[i - 1];
        const currentClip = sortedClips[i];
        const prevEnd = prevClip.startOffset + prevClip.duration;
        
        if (currentClip.startOffset < prevEnd) {
            currentClip.startOffset = prevEnd; 
        }
    }
    return sortedClips;
}

// Helper: 分割片段 (Split)
export function splitClip(clipId, splitTime) {
    // 1. 嘗試在 Main Track 找
    let track = 'main';
    let store = mainTrackClips;
    let clips = get(mainTrackClips);
    let clipIndex = clips.findIndex(c => c.id === clipId);

    // 2. 沒找到就去 Audio Track 找
    if (clipIndex === -1) {
        track = 'audio';
        store = audioTrackClips;
        clips = get(audioTrackClips);
        clipIndex = clips.findIndex(c => c.id === clipId);
    }
    
    // 3. 沒找到就去 Text Track 找
    if (clipIndex === -1) {
        track = 'text';
        store = textTrackClips;
        clips = get(textTrackClips);
        clipIndex = clips.findIndex(c => c.id === clipId);
    }

    if (clipIndex === -1) return;

    const clip = clips[clipIndex];
    const clipEnd = clip.startOffset + clip.duration;

    // 檢查分割點有效性
    if (splitTime <= clip.startOffset + 0.1 || splitTime >= clipEnd - 0.1) {
        console.warn("分割點無效");
        return;
    }

    // 計算新參數
    const newDurationA = splitTime - clip.startOffset;
    const newDurationB = clipEnd - splitTime;
    const newMediaStartB = (clip.mediaStartOffset || 0) + newDurationA;

    const updatedClipA = { 
        ...clip, 
        duration: newDurationA 
    };

    const newClipB = {
        ...clip,
        id: generateId(),
        startOffset: splitTime,
        duration: newDurationB,
        mediaStartOffset: newMediaStartB,
        // 複製其他屬性
        volume: clip.volume, 
        file: clip.file,
        text: clip.text, // 文字軌專用
        thumbnailUrls: clip.thumbnailUrls 
    };

    // 寫回 Store
    const newClipsList = [...clips];
    newClipsList[clipIndex] = updatedClipA;
    newClipsList.splice(clipIndex + 1, 0, newClipB);

    store.set(newClipsList);
}