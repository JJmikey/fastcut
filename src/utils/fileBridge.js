// src/utils/fileBridge.js
import { openDB } from 'idb';

const DB_NAME = 'FastVideoCutter_Bridge';
const STORE_NAME = 'pending_uploads';

async function initDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
}

// 1. 存入檔案 (在 Landing Page 呼叫)
export async function setPendingFile(file) {
    const db = await initDB();
    await db.put(STORE_NAME, file, 'file');
}

// 2. 取出檔案 (在 Editor 呼叫)
// 取出後會自動刪除，避免下次進來又讀取一次
export async function getPendingFile() {
    const db = await initDB();
    const file = await db.get(STORE_NAME, 'file');
    if (file) {
        await db.delete(STORE_NAME, 'file'); // 讀後即焚
    }
    return file;
}