<script>
    import { onMount } from 'svelte';
    // 🔥 引入 textTrackClips
    import { mainTrackClips, audioTrackClips, textTrackClips, uploadedFiles } from '../stores/timelineStore';
    import { saveProject, loadProject } from '../utils/projectManager';

    onMount(async () => {
        console.log("✅ ProjectSaver: 組件已掛載，準備啟動...");

        try {
            console.log("📂 ProjectSaver: 正在讀取資料庫...");
            const success = await loadProject();
            console.log(success ? "🎉 ProjectSaver: 專案恢復成功！" : "ℹ️ ProjectSaver: 沒有舊存檔，建立新專案。");
        } catch (err) {
            console.error("❌ ProjectSaver: 讀取失敗", err);
        }

        let timer;
        const autoSave = () => {
            // console.log("⏳ ProjectSaver: 偵測到變動...");
            clearTimeout(timer);
            timer = setTimeout(async () => {
                try {
                    await saveProject();
                    console.log("💾 ProjectSaver: 存檔完成！");
                } catch (e) {
                    console.error("❌ ProjectSaver: 存檔失敗", e);
                }
            }, 1000);
        };

        // 訂閱所有 Store
        const unsubscribeMain = mainTrackClips.subscribe(autoSave);
        const unsubscribeAudio = audioTrackClips.subscribe(autoSave);
        const unsubscribeText = textTrackClips.subscribe(autoSave); // 🔥 監聽文字變動
        const unsubscribeFiles = uploadedFiles.subscribe(autoSave);

        return () => {
            unsubscribeMain();
            unsubscribeAudio();
            unsubscribeText(); // 🔥 記得取消訂閱
            unsubscribeFiles();
        };
    });
</script>