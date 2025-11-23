<script>
    import { selectedClipId, mainTrackClips, audioTrackClips } from '../stores/timelineStore';
    
    let selectedClip = null;
    let trackType = null; // 'main' or 'audio'

    // 監聽選取變動，找出對應的 Clip 物件
    $: {
        if ($selectedClipId) {
            // 先在 Main Track 找
            let clip = $mainTrackClips.find(c => c.id === $selectedClipId);
            if (clip) {
                selectedClip = clip;
                trackType = 'main';
            } else {
                // 沒找到，去 Audio Track 找
                clip = $audioTrackClips.find(c => c.id === $selectedClipId);
                if (clip) {
                    selectedClip = clip;
                    trackType = 'audio';
                }
            }
        } else {
            selectedClip = null;
            trackType = null;
        }
    }

    // 更新音量
    function updateVolume(e) {
        const newVol = parseFloat(e.target.value);
        if (trackType === 'main') {
            mainTrackClips.update(clips => clips.map(c => c.id === selectedClip.id ? { ...c, volume: newVol } : c));
        } else if (trackType === 'audio') {
            audioTrackClips.update(clips => clips.map(c => c.id === selectedClip.id ? { ...c, volume: newVol } : c));
        }
    }

    // 刪除片段
    function handleDelete() {
        if (!selectedClip) return;
        if (trackType === 'main') {
            mainTrackClips.update(clips => clips.filter(c => c.id !== selectedClip.id));
        } else {
            audioTrackClips.update(clips => clips.filter(c => c.id !== selectedClip.id));
        }
        selectedClipId.set(null);
    }
</script>

<aside class="w-[300px] border-l border-gray-700 bg-[#181818] flex-shrink-0 flex flex-col">
    
    <!-- 標題 -->
    <div class="h-12 border-b border-gray-700 flex items-center px-4 font-medium text-sm bg-[#252525]">
        Properties
    </div>

    <div class="p-4 flex-1 overflow-y-auto">
        {#if selectedClip}
            <div class="flex flex-col gap-6">
                
                <!-- 1. 基本資訊 -->
                <div class="space-y-2">
                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Info</span>
                    <div class="bg-[#202020] p-3 rounded border border-gray-700">
                        <p class="text-sm text-white truncate mb-1" title={selectedClip.name}>{selectedClip.name}</p>
                        <div class="flex justify-between text-xs text-gray-400">
                            <span>Duration: {selectedClip.duration.toFixed(1)}s</span>
                            <span class="uppercase px-1.5 py-0.5 rounded bg-gray-700 text-[10px]">{selectedClip.type.split('/')[0]}</span>
                        </div>
                    </div>
                </div>

                <!-- 2. 音量控制 -->
                <div class="space-y-2">
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Volume</span>
                        <span class="text-xs text-cyan-400">{Math.round((selectedClip.volume || 1) * 100)}%</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" max="1" step="0.01" 
                        value={selectedClip.volume ?? 1} 
                        on:input={updateVolume}
                        class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer"
                    >
                </div>

                <!-- 3. 操作按鈕 -->
                <div class="pt-4 border-t border-gray-700">
                    <button 
                        on:click={handleDelete}
                        class="w-full py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        Delete Clip
                    </button>
                </div>

            </div>
        {:else}
            <!-- 空狀態 -->
            <div class="h-full flex flex-col justify-center items-center text-center opacity-40">
                <div class="w-16 h-16 bg-[#252525] rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="10" x2="14" y1="21" y2="14"/><line x1="16" x2="16" y1="8" y2="3"/><line x1="8" x2="8" y1="8" y2="3"/><line x1="12" x2="12" y1="5" y2="3"/><line x1="12" x2="12" y1="11" y2="8"/></svg>
                </div>
                <p class="text-sm text-gray-500">Select a clip to edit properties</p>
            </div>
        {/if}
    </div>
</aside>