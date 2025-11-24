<script>
    import { selectedClipIds, mainTrackClips, audioTrackClips, textTrackClips } from '../stores/timelineStore';
    
    let selectedClip = null;
    let isMultiSelection = false;
    let trackType = null; // 'main', 'audio', 'text'

    // 監聽選取變動
    $: {
        if ($selectedClipIds.length === 0) {
            selectedClip = null;
            isMultiSelection = false;
        } 
        else if ($selectedClipIds.length === 1) {
            isMultiSelection = false;
            const id = $selectedClipIds[0];
            
            // 依序搜尋各軌道
            let clip = $mainTrackClips.find(c => c.id === id);
            if (clip) {
                trackType = 'main';
            } else {
                clip = $audioTrackClips.find(c => c.id === id);
                if (clip) {
                    trackType = 'audio';
                } else {
                    clip = $textTrackClips.find(c => c.id === id);
                    if (clip) trackType = 'text';
                }
            }
            selectedClip = clip || null;
        } 
        else {
            isMultiSelection = true;
            selectedClip = { name: `${$selectedClipIds.length} items`, type: 'Multi', duration: 0, volume: 1 };
        }
    }

    // 通用屬性更新 (Volume)
    function updateProperty(key, value) {
        const updateLogic = (clips) => clips.map(c => c.id === selectedClip.id ? { ...c, [key]: value } : c);
        
        if (trackType === 'main') mainTrackClips.update(updateLogic);
        else if (trackType === 'audio') audioTrackClips.update(updateLogic);
        else if (trackType === 'text') textTrackClips.update(updateLogic);
    }

    // 🔥 文字專用更新
    function updateText(e) { updateProperty('text', e.target.value); }
    function updateColor(e) { updateProperty('color', e.target.value); }
    function updateFontSize(e) { updateProperty('fontSize', parseInt(e.target.value)); }
    function updateX(e) { updateProperty('x', parseInt(e.target.value)); }
    function updateY(e) { updateProperty('y', parseInt(e.target.value)); }

    // 刪除
    function handleDelete() {
        if ($selectedClipIds.length === 0) return;
        if (confirm(`Delete selected item(s)?`)) {
            mainTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            audioTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            textTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            selectedClipIds.set([]);
        }
    }
</script>

<aside class="w-[300px] border-l border-gray-700 bg-[#181818] flex-shrink-0 flex flex-col">
    <div class="h-12 border-b border-gray-700 flex items-center px-4 font-medium text-sm bg-[#252525]">
        Properties
    </div>

    <div class="p-4 flex-1 overflow-y-auto custom-scrollbar">
        {#if selectedClip}
            <div class="flex flex-col gap-6">
                
                <!-- Info -->
                <div class="space-y-2">
                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Info</span>
                    <div class="bg-[#202020] p-3 rounded border border-gray-700">
                        <p class="text-sm text-white truncate mb-1">{selectedClip.name}</p>
                        <div class="flex justify-between text-xs text-gray-400">
                            <span>{selectedClip.type.toUpperCase()}</span>
                            <span>{selectedClip.duration.toFixed(1)}s</span>
                        </div>
                    </div>
                </div>

                <!-- 🔥 文字編輯區 (只有選中 Text 時顯示) -->
                {#if selectedClip.type === 'text' && !isMultiSelection}
                    <div class="space-y-4 border-t border-gray-700 pt-4">
                        <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Text Style</span>
                        
                        <!-- 內容 -->
                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Content</label>
                            <textarea 
                                value={selectedClip.text} 
                                on:input={updateText}
                                class="w-full bg-[#2a2a2a] border border-gray-600 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none"
                                rows="2"
                            ></textarea>
                        </div>

                        <!-- 顏色 & 大小 -->
                        <div class="flex gap-2">
                            <div class="flex-1 space-y-1">
                                <label class="text-xs text-gray-400">Color</label>
                                <div class="flex items-center gap-2">
                                    <input type="color" value={selectedClip.color} on:input={updateColor} class="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer">
                                    <span class="text-xs text-gray-500">{selectedClip.color}</span>
                                </div>
                            </div>
                            <div class="flex-1 space-y-1">
                                <label class="text-xs text-gray-400">Size ({selectedClip.fontSize}px)</label>
                                <input type="range" min="10" max="200" value={selectedClip.fontSize} on:input={updateFontSize} class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>

                        <!-- 位置 (X, Y) -->
                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Position (X / Y %)</label>
                            <div class="flex gap-2">
                                <input type="range" min="0" max="100" value={selectedClip.x} on:input={updateX} class="flex-1 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                                <input type="range" min="0" max="100" value={selectedClip.y} on:input={updateY} class="flex-1 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- 音量控制 (文字不需要音量) -->
                {#if selectedClip.type !== 'text'}
                    <div class="space-y-2 border-t border-gray-700 pt-4">
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Volume</span>
                            <span class="text-xs text-cyan-400">{Math.round((selectedClip.volume || 1) * 100)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.01" 
                            value={selectedClip.volume ?? 1} 
                            on:input={(e) => updateProperty('volume', parseFloat(e.target.value))}
                            class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer"
                        >
                    </div>
                {/if}

                <!-- Delete -->
                <div class="pt-4 border-t border-gray-700">
                    <button on:click={handleDelete} class="w-full py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded text-sm transition-colors flex items-center justify-center gap-2">
                        Delete
                    </button>
                </div>

            </div>
        {:else}
            <div class="h-full flex flex-col justify-center items-center text-center opacity-40">
                <p class="text-sm text-gray-500">Select a clip to edit</p>
            </div>
        {/if}
    </div>
</aside>