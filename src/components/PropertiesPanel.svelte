<script>
    import { selectedClipIds, mainTrackClips, audioTrackClips, textTrackClips } from '../stores/timelineStore';
    
    let selectedClip = null;
    let isMultiSelection = false;
    let trackType = null; // 'main', 'audio', 'text'

    // 監聽選取變動，決定顯示什麼
    $: {
        if ($selectedClipIds.length === 0) {
            selectedClip = null;
            isMultiSelection = false;
            trackType = null;
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
            // 為了避免修改 store 時導致 selectedClip 參照丟失或畫面跳動，這裡通常直接引用 store 物件
            selectedClip = clip || null;
        } 
        else {
            isMultiSelection = true;
            trackType = 'multi'; 
            // 多選模式下，造一個假物件來顯示 UI (預設值)
            selectedClip = { 
                name: `${$selectedClipIds.length} items selected`, 
                type: 'Multi-Selection', 
                duration: 0, 
                volume: 1 
            };
        }
    }

    // --- 通用屬性更新 helper ---
    function updateProperty(key, value) {
        const updateLogic = (clips) => clips.map(c => $selectedClipIds.includes(c.id) ? { ...c, [key]: value } : c);
        
        // 如果是單選，根據 trackType 更新
        if (trackType === 'main') mainTrackClips.update(updateLogic);
        else if (trackType === 'audio') audioTrackClips.update(updateLogic);
        else if (trackType === 'text') textTrackClips.update(updateLogic);
        
        // 如果是多選，嘗試更新所有軌道 (比較暴力的做法，但有效)
        else if (trackType === 'multi') {
            mainTrackClips.update(updateLogic);
            audioTrackClips.update(updateLogic);
            textTrackClips.update(updateLogic);
        }
    }

    // --- Text 專用更新 ---
    function updateText(e) { updateProperty('text', e.target.value); }
    function updateColor(e) { updateProperty('color', e.target.value); }
    function updateFontSize(e) { updateProperty('fontSize', parseInt(e.target.value)); }
    function updateX(e) { updateProperty('x', parseInt(e.target.value)); }
    function updateY(e) { updateProperty('y', parseInt(e.target.value)); }
    
    // 🔥 新增：背景與描邊更新
    function updateShowBg(e) { updateProperty('showBackground', e.target.checked); }
    function updateBgColor(e) { updateProperty('backgroundColor', e.target.value); }
    function updateStrokeWidth(e) { updateProperty('strokeWidth', parseInt(e.target.value)); }
    function updateStrokeColor(e) { updateProperty('strokeColor', e.target.value); }
    // 🔥 新增：更新字體
    function updateFontFamily(e) { updateProperty('fontFamily', e.target.value); }

    // --- Audio/Video 專用更新 ---
    function updateVolume(e) {
        updateProperty('volume', parseFloat(e.target.value));
    }

    // --- 刪除 ---
    function handleDelete() {
        if ($selectedClipIds.length === 0) return;

        if (confirm(`Delete ${$selectedClipIds.length} items?`)) {
            mainTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            audioTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            textTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            selectedClipIds.set([]); // 清空選取
        }
    }


    const fonts = [
        { name: 'Sans Serif (Default)', value: 'Arial, sans-serif' },
        { name: 'Serif (Elegant)', value: '"Times New Roman", serif' },
        { name: 'Monospace (Code)', value: '"Courier New", monospace' },
        { name: 'Impact (Meme)', value: 'Impact, sans-serif' },
        { name: 'Comic Sans', value: '"Comic Sans MS", "Chalkboard SE", sans-serif' },
        { name: 'Verdana', value: 'Verdana, sans-serif' },
        { name: 'Georgia', value: 'Georgia, serif' }
    ];


</script>

<aside class="w-[300px] border-l border-gray-700 bg-[#181818] flex-shrink-0 flex flex-col">
    
    <!-- 標題 -->
    <div class="h-12 border-b border-gray-700 flex items-center px-4 font-medium text-sm bg-[#252525]">
        Properties
    </div>

    <div class="p-4 flex-1 overflow-y-auto custom-scrollbar">
        {#if selectedClip}
            <div class="flex flex-col gap-6">
                
                <!-- 1. 基本資訊 -->
                <div class="space-y-2">
                    <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Info</span>
                    <div class="bg-[#202020] p-3 rounded border border-gray-700">
                        <p class="text-sm text-white truncate mb-1" title={selectedClip.name}>{selectedClip.name}</p>
                        <div class="flex justify-between text-xs text-gray-400">
                            {#if !isMultiSelection}
                                <span>Duration: {selectedClip.duration.toFixed(1)}s</span>
                                <span class="uppercase px-1.5 py-0.5 rounded bg-gray-700 text-[10px]">
                                    {selectedClip.type.split('/')[0]}
                                </span>
                            {:else}
                                <span>Batch Edit Mode</span>
                            {/if}
                        </div>
                    </div>
                </div>

                <!-- 2. 文字編輯區 (僅當選中文字軌且非多選時顯示，或多選時全部都是文字也可顯示，這裡簡化為單選) -->
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

                        <!-- 🔥 新增：字體選擇 -->
                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Font</label>
                            <select 
                                value={selectedClip.fontFamily} 
                                on:change={updateFontFamily}
                                class="w-full bg-[#2a2a2a] border border-gray-600 rounded p-1 text-sm text-white focus:border-cyan-500 outline-none"
                            >
                                {#each fonts as font}
                                    <option value={font.value}>{font.name}</option>
                                {/each}
                            </select>
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

                        <!-- 位置 -->
                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Position (X / Y %)</label>
                            <div class="flex gap-2">
                                <input type="range" min="0" max="100" value={selectedClip.x} on:input={updateX} class="flex-1 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                                <input type="range" min="0" max="100" value={selectedClip.y} on:input={updateY} class="flex-1 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>

                        <!-- 🔥 新增：背景與邊框 -->
                        <div class="border-t border-gray-700 pt-2 mt-2 space-y-3">
                            
                            <!-- Background Control -->
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <input type="checkbox" checked={selectedClip.showBackground} on:change={updateShowBg} class="accent-cyan-500 h-4 w-4">
                                    <label class="text-xs text-gray-400">Background</label>
                                </div>
                                {#if selectedClip.showBackground}
                                    <div class="flex items-center gap-2">
                                        <input type="color" value={selectedClip.backgroundColor} on:input={updateBgColor} class="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer">
                                    </div>
                                {/if}
                            </div>

                            <!-- Stroke Control -->
                            <div class="space-y-1">
                                <div class="flex justify-between items-center">
                                    <label class="text-xs text-gray-400">Stroke ({selectedClip.strokeWidth}px)</label>
                                    <input type="color" value={selectedClip.strokeColor} on:input={updateStrokeColor} class="w-4 h-4 bg-transparent border-0 p-0 cursor-pointer">
                                </div>
                                <input type="range" min="0" max="10" value={selectedClip.strokeWidth} on:input={updateStrokeWidth} class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- 3. 音量控制 (非 Text 才顯示) -->
                {#if selectedClip.type !== 'text'}
                    <div class="space-y-2 border-t border-gray-700 pt-4">
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
                {/if}

                <!-- 4. 刪除按鈕 -->
                <div class="pt-4 border-t border-gray-700">
                    <button 
                        on:click={handleDelete}
                        class="w-full py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        Delete {isMultiSelection ? 'Selected' : 'Clip'}
                    </button>
                </div>

            </div>
        {:else}
            <!-- 空狀態 -->
            <div class="h-full flex flex-col justify-center items-center text-center opacity-40">
                <div class="w-16 h-16 bg-[#252525] rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="10" x2="14" y1="21" y2="14"/><line x1="16" x2="16" y1="8" y2="3"/><line x1="8" x2="8" y1="8" y2="3"/><line x1="12" x2="12" y1="5" y2="3"/><line x1="12" x2="12" y1="11" y2="8"/></svg>
                </div>
                <p class="text-sm text-gray-500">Select clips to edit properties</p>
            </div>
        {/if}
    </div>
</aside>