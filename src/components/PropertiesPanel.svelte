<script>
    import { selectedClipIds, mainTrackClips, audioTrackClips, textTrackClips, projectSettings } from '../stores/timelineStore';
    
    let selectedClip = null;
    let isMultiSelection = false;
    let trackType = null; // 'main', 'audio', 'text', 'multi'

    // 監聽選取變動
    $: {
        if ($selectedClipIds.length === 0) {
            selectedClip = null;
            isMultiSelection = false;
            trackType = null;
        } 
        else if ($selectedClipIds.length === 1) {
            isMultiSelection = false;
            const id = $selectedClipIds[0];
            
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
            trackType = 'multi'; 
            selectedClip = { 
                name: `${$selectedClipIds.length} items selected`, 
                type: 'Multi-Selection', 
                duration: 0, 
                volume: 1 
            };
        }
    }

    // --- 通用屬性更新 ---
    function updateProperty(key, value) {
        const updateLogic = (clips) => clips.map(c => $selectedClipIds.includes(c.id) ? { ...c, [key]: value } : c);
        
        if (trackType === 'main') mainTrackClips.update(updateLogic);
        else if (trackType === 'audio') audioTrackClips.update(updateLogic);
        else if (trackType === 'text') textTrackClips.update(updateLogic);
        else if (trackType === 'multi') {
            mainTrackClips.update(updateLogic);
            audioTrackClips.update(updateLogic);
            textTrackClips.update(updateLogic);
        }
    }

    // --- Text 更新 ---
    function updateText(e) { updateProperty('text', e.target.value); }
    function updateColor(e) { updateProperty('color', e.target.value); }
    function updateFontSize(e) { updateProperty('fontSize', parseInt(e.target.value)); }
    function updateFontFamily(e) { updateProperty('fontFamily', e.target.value); }
    
    // 文字的位置 (百分比)
    function updateTextX(e) { updateProperty('x', parseInt(e.target.value)); }
    function updateTextY(e) { updateProperty('y', parseInt(e.target.value)); }
    
    // 文字樣式
    function updateShowBg(e) { updateProperty('showBackground', e.target.checked); }
    function updateBgColor(e) { updateProperty('backgroundColor', e.target.value); }
    function updateStrokeWidth(e) { updateProperty('strokeWidth', parseInt(e.target.value)); }
    function updateStrokeColor(e) { updateProperty('strokeColor', e.target.value); }

    // --- 🔥 Transform 更新 (Video/Image) ---
    function updateScale(e) { updateProperty('scale', parseFloat(e.target.value)); }
    function updatePosX(e) { updateProperty('positionX', parseInt(e.target.value)); }
    function updatePosY(e) { updateProperty('positionY', parseInt(e.target.value)); }

    // --- Audio/Video 更新 ---
    function updateVolume(e) { updateProperty('volume', parseFloat(e.target.value)); }

    // --- Global Project Settings ---
    function setAspectRatio(ratio) {
        if (ratio === '16:9') projectSettings.set({ width: 1280, height: 720, aspectRatio: '16:9' });
        else if (ratio === '9:16') projectSettings.set({ width: 720, height: 1280, aspectRatio: '9:16' });
        else if (ratio === '1:1') projectSettings.set({ width: 1080, height: 1080, aspectRatio: '1:1' });
        else if (ratio === '4:5') projectSettings.set({ width: 1080, height: 1350, aspectRatio: '4:5' });
    }

    // --- Delete ---
    function handleDelete() {
        if ($selectedClipIds.length === 0) return;
        if (confirm(`Delete ${$selectedClipIds.length} items?`)) {
            mainTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            audioTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            textTrackClips.update(clips => clips.filter(c => !$selectedClipIds.includes(c.id)));
            selectedClipIds.set([]); 
        }
    }

    const fonts = [
        { name: 'Sans Serif (Default)', value: 'Arial, sans-serif' },
        { name: 'Serif (Elegant)', value: '"Times New Roman", serif' },
        { name: 'Monospace (Code)', value: '"Courier New", monospace' },
        { name: 'Impact (Meme)', value: 'Impact, sans-serif' },
        { name: 'Comic Sans', value: '"Comic Sans MS", "Chalkboard SE", sans-serif' },
        { name: 'Verdana', value: 'Verdana, sans-serif' },
        { name: 'Georgia', value: 'Georgia, serif' },
        { name: 'Microsoft JhengHei', value: '"Microsoft JhengHei", sans-serif' }
    ];
</script>

<aside class="w-[300px] border-l border-gray-700 bg-[#181818] flex-shrink-0 flex flex-col">
    
    <div class="h-12 border-b border-gray-700 flex items-center px-4 font-medium text-sm bg-[#252525]">
        Properties
    </div>

    <div class="p-4 flex-1 overflow-y-auto custom-scrollbar">
        
        <!-- 🔥 1. 全域設定 (沒選東西時顯示) -->
        {#if !selectedClip}
            <div class="space-y-4">
                <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Canvas Settings</span>
                
                <div class="bg-[#202020] p-4 rounded border border-gray-700 space-y-3">
                    <label class="text-xs text-gray-400">Aspect Ratio</label>
                    <div class="grid grid-cols-2 gap-2">
                        <button on:click={() => setAspectRatio('16:9')} class="px-2 py-2 rounded text-xs border transition-colors {$projectSettings.aspectRatio === '16:9' ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'border-gray-600 text-gray-400 hover:bg-gray-700'}">16:9 (YouTube)</button>
                        <button on:click={() => setAspectRatio('9:16')} class="px-2 py-2 rounded text-xs border transition-colors {$projectSettings.aspectRatio === '9:16' ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'border-gray-600 text-gray-400 hover:bg-gray-700'}">9:16 (TikTok)</button>
                        <button on:click={() => setAspectRatio('1:1')} class="px-2 py-2 rounded text-xs border transition-colors {$projectSettings.aspectRatio === '1:1' ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'border-gray-600 text-gray-400 hover:bg-gray-700'}">1:1 (Square)</button>
                        <button on:click={() => setAspectRatio('4:5')} class="px-2 py-2 rounded text-xs border transition-colors {$projectSettings.aspectRatio === '4:5' ? 'bg-cyan-900/50 border-cyan-500 text-white' : 'border-gray-600 text-gray-400 hover:bg-gray-700'}">4:5 (Portrait)</button>
                    </div>
                    <div class="text-[10px] text-gray-500 text-center mt-2">
                        Resolution: {$projectSettings.width} x {$projectSettings.height}
                    </div>
                </div>
            </div>

        {:else}
            <!-- 有選取 Clip 時顯示 -->
            <div class="flex flex-col gap-6">
                
                <!-- Info -->
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

                <!-- 🔥 2. Transform & Crop (Video/Image 專用) -->
                {#if (selectedClip.type.startsWith('video') || selectedClip.type.startsWith('image')) && !isMultiSelection}
                    <div class="space-y-4 border-t border-gray-700 pt-4">
                        <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Transform / Crop</span>
                        
                        <!-- Scale -->
                        <div class="space-y-1">
                            <div class="flex justify-between">
                                <label class="text-xs text-gray-400">Scale (Zoom)</label>
                                <span class="text-xs text-cyan-400">{(selectedClip.scale || 1).toFixed(2)}x</span>
                            </div>
                            <input type="range" min="0.1" max="5" step="0.1" value={selectedClip.scale || 1} on:input={updateScale} class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                        </div>

                        <!-- Position -->
                        <!-- Position -->
                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Position (X / Y)</label>
                            
                            <!-- 數值輸入框 -->
                            <div class="flex gap-2 mb-1">
                                <!-- 🔥 修改：加入 min-w-0 防止撐開 -->
                                <input 
                                    type="number" 
                                    value={selectedClip.positionX || 0} 
                                    on:input={updatePosX} 
                                    class="flex-1 min-w-0 bg-[#2a2a2a] border border-gray-600 rounded p-1 text-xs text-white text-center focus:border-cyan-500 outline-none"
                                >
                                <input 
                                    type="number" 
                                    value={selectedClip.positionY || 0} 
                                    on:input={updatePosY} 
                                    class="flex-1 min-w-0 bg-[#2a2a2a] border border-gray-600 rounded p-1 text-xs text-white text-center focus:border-cyan-500 outline-none"
                                >
                            </div>

                            <!-- 滑桿控制 (保持原本的 Grid 佈局，但也加上 w-full 確保安全) -->
                            <div class="grid grid-cols-2 gap-2">
                                <input type="range" min="-600" max="600" value={selectedClip.positionX || 0} on:input={updatePosX} class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                                <input type="range" min="-600" max="600" value={selectedClip.positionY || 0} on:input={updatePosY} class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- 3. Text Editor -->
                {#if selectedClip.type === 'text' && !isMultiSelection}
                    <div class="space-y-4 border-t border-gray-700 pt-4">
                        <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Text Style</span>
                        
                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Content</label>
                            <textarea value={selectedClip.text} on:input={updateText} class="w-full bg-[#2a2a2a] border border-gray-600 rounded p-2 text-sm text-white focus:border-cyan-500 outline-none" rows="2"></textarea>
                        </div>

                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Font</label>
                            <select value={selectedClip.fontFamily} on:change={updateFontFamily} class="w-full bg-[#2a2a2a] border border-gray-600 rounded p-1 text-sm text-white focus:border-cyan-500 outline-none">
                                {#each fonts as font}
                                    <option value={font.value}>{font.name}</option>
                                {/each}
                            </select>
                        </div>

                        <div class="flex gap-2">
                            <div class="flex-1 space-y-1">
                                <label class="text-xs text-gray-400">Color</label>
                                <div class="flex items-center gap-2">
                                    <input type="color" value={selectedClip.color} on:input={updateColor} class="w-8 h-8 bg-transparent border-0 p-0 cursor-pointer">
                                </div>
                            </div>
                            <div class="flex-1 space-y-1">
                                <label class="text-xs text-gray-400">Size ({selectedClip.fontSize}px)</label>
                                <input type="range" min="10" max="200" value={selectedClip.fontSize} on:input={updateFontSize} class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>

                        <div class="space-y-1">
                            <label class="text-xs text-gray-400">Position (X / Y %)</label>
                            <div class="flex gap-2">
                                <input type="range" min="0" max="100" value={selectedClip.x} on:input={updateTextX} class="flex-1 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                                <input type="range" min="0" max="100" value={selectedClip.y} on:input={updateTextY} class="flex-1 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
                            </div>
                        </div>

                        <div class="border-t border-gray-700 pt-2 mt-2 space-y-3">
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

                <!-- 4. Volume (Video/Audio Only) -->
                {#if selectedClip.type !== 'text' && !selectedClip.type.startsWith('image')}
                    <div class="space-y-2 border-t border-gray-700 pt-4">
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-gray-500 uppercase font-bold tracking-wider">Volume</span>
                            <span class="text-xs text-cyan-400">{Math.round((selectedClip.volume || 1) * 100)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.01" 
                            value={selectedClip.volume ?? 1} 
                            on:input={updateVolume}
                            class="w-full accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer"
                        >
                    </div>
                {/if}

                <!-- 5. Delete -->
                <div class="pt-4 border-t border-gray-700">
                    <button 
                        on:click={handleDelete}
                        class="w-full py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 rounded text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        Delete {isMultiSelection ? 'Selected' : 'Clip'}
                    </button>
                </div>

            </div>
        {/if}
    </div>
</aside>