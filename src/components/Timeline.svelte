<script>
    import { mainTrackClips, audioTrackClips, generateId } from '../stores/timelineStore';
    import { currentTime, isPlaying } from '../stores/playerStore';
    import { onMount } from 'svelte';

    let pixelsPerSecond = 20; 
    
    // --- 狀態變數 ---
    let totalDuration = 60;     
    
    // Resize 變數
    let resizingClipId = null;  
    let resizingTrack = null; 
    // 🔥 新增：記錄正在拉哪一邊 ('start' 或 'end')
    let resizingEdge = null;  

    let initialX = 0;           
    let initialDuration = 0;    
    let initialStartOffset = 0; // 記錄初始開始時間
    let maxDurationLimit = 0;   
    
    // Move 變數
    let movingClipId = null;
    let movingTrack = null;
    let moveInitialX = 0;
    let moveInitialStart = 0;
    let moveMinLimit = 0;
    let moveMaxLimit = Infinity;

    // UI 輔助
    let showGuide = false;    
    let guideX = 0;           
    let guideTimeText = "";   

    // --- Reactive: 計算總長度 ---
    $: {
        const maxMain = $mainTrackClips.length > 0 
            ? Math.max(...$mainTrackClips.map(c => c.startOffset + c.duration)) : 0;
        const maxAudio = $audioTrackClips.length > 0
            ? Math.max(...$audioTrackClips.map(c => c.startOffset + c.duration)) : 0;
        const maxClipEnd = Math.max(maxMain, maxAudio);
        totalDuration = Math.max(60, maxClipEnd + 30);
    }

    function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }

    // Drop Logic (保持不變)
    function handleDrop(e) {
        e.preventDefault();
        const data = e.dataTransfer.getData('application/json');
        if (data) {
            const file = JSON.parse(data);
            if (file.type.startsWith('audio')) { alert("Audio -> Audio Track"); return; }
            const currentMaxTime = $mainTrackClips.length > 0 ? Math.max(...$mainTrackClips.map(c => c.startOffset + c.duration)) : 0;
            const originalDuration = file.duration || 5;
            const newClip = { id: generateId(), fileUrl: file.url, name: file.name, type: file.type, startOffset: currentMaxTime, duration: originalDuration, sourceDuration: originalDuration };
            mainTrackClips.update(clips => [...clips, newClip]);
        }
    }
    function handleAudioDrop(e) {
        e.preventDefault();
        const data = e.dataTransfer.getData('application/json');
        if (data) {
            const file = JSON.parse(data);
            if (!file.type.startsWith('audio')) { alert("Video -> Main Track"); return; }
            const currentMaxTime = $audioTrackClips.length > 0 ? Math.max(...$audioTrackClips.map(c => c.startOffset + c.duration)) : 0;
            const originalDuration = file.duration || 5;
            const newClip = { id: generateId(), fileUrl: file.url, name: file.name, type: file.type, startOffset: currentMaxTime, duration: originalDuration, sourceDuration: originalDuration };
            audioTrackClips.update(clips => [...clips, newClip]);
        }
    }

    // --- 🔥 改良版：縮放邏輯 (區分 Start/End) ---
    // edge: 'start' (左邊) 或 'end' (右邊)
    function startResize(e, clip, trackType, edge) {
        e.stopPropagation();
        resizingClipId = clip.id;
        resizingTrack = trackType;
        resizingEdge = edge; // 記錄方向

        initialX = e.clientX;
        initialDuration = clip.duration;
        initialStartOffset = clip.startOffset;
        
        // 注意：如果是拉左邊，長度上限需要特別計算 (暫時簡化邏輯)
        maxDurationLimit = clip.sourceDuration || clip.duration;

        showGuide = true;
        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', stopResize);
    }

    function handleResizeMove(e) {
        if (!resizingClipId) return;
        
        const deltaX = e.clientX - initialX;
        const deltaSeconds = deltaX / pixelsPerSecond; 
        
        let newDuration = initialDuration;
        let newStartOffset = initialStartOffset;
        
        // 🔥 新增：磁吸功能 (Magnet/Snapping)
        // 設定吸附距離為 15px
        const snapThreshold = 15 / pixelsPerSecond;
        const targetTime = $currentTime; // 吸附目標：目前的播放指針位置

        if (resizingEdge === 'end') {
            // --- 拉右邊 (End Trim) ---
            let tempEnd = initialStartOffset + initialDuration + deltaSeconds;
            
            // 🧲 磁吸檢查：如果結尾接近指針，直接吸過去
            if (Math.abs(tempEnd - targetTime) < snapThreshold) {
                tempEnd = targetTime;
                // 重新計算 deltaSeconds 以符合吸附後的位置 (為了讓 UI 顯示正確)
                // newDuration 會在下面重新計算，所以這裡只要確保位置對就好
            }

            newDuration = tempEnd - initialStartOffset;
            newDuration = Math.max(0.5, newDuration); 
            newDuration = Math.min(maxDurationLimit, newDuration); 
            
            // ❌ 移除這行：不要讓指針跟著跑
            // previewTime = newStartOffset + newDuration;

        } else if (resizingEdge === 'start') {
            // --- 拉左邊 (Start Trim) ---
            let tempStart = initialStartOffset + deltaSeconds;

            // 🧲 磁吸檢查：如果開頭接近指針，直接吸過去
            if (Math.abs(tempStart - targetTime) < snapThreshold) {
                tempStart = targetTime;
            }

            // 計算變化量
            const change = tempStart - initialStartOffset;
            
            if (initialDuration - change < 0.5) {
                newStartOffset = initialStartOffset + (initialDuration - 0.5);
                newDuration = 0.5;
            } else {
                newStartOffset = tempStart;
                newDuration = initialDuration - change;
            }
            
            if (newStartOffset < 0) {
                newStartOffset = 0;
                newDuration = initialDuration + initialStartOffset;
            }

            // ❌ 移除這行：不要讓指針跟著跑
            // previewTime = newStartOffset;
        }

        // 更新 Store
        if (resizingTrack === 'main') {
            mainTrackClips.update(clips => clips.map(c => c.id === resizingClipId ? { ...c, startOffset: newStartOffset, duration: newDuration } : c));
        } else if (resizingTrack === 'audio') {
            audioTrackClips.update(clips => clips.map(c => c.id === resizingClipId ? { ...c, startOffset: newStartOffset, duration: newDuration } : c));
        }

        // ❌ 移除這行：這就是導致指針亂跳的原因
        // currentTime.set(previewTime); 

        // 更新 UI 輔助線 (顯示目前拉到的秒數)
        guideX = e.clientX;
        const currentEdgeTime = resizingEdge === 'end' ? (newStartOffset + newDuration) : newStartOffset;
        
        // 顯示是否吸附的提示
        const isSnapped = Math.abs(currentEdgeTime - $currentTime) < 0.001;
        guideTimeText = (isSnapped ? "🧲 " : "") + `${currentEdgeTime.toFixed(2)}s`;
    }

    function stopResize() {
        resizingClipId = null;
        resizingTrack = null;
        resizingEdge = null;
        showGuide = false;
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', stopResize);
    }

    // --- 移動邏輯 (保持不變) ---
    function startMoveClip(e, clip, trackType) {
        e.stopPropagation();
        movingClipId = clip.id;
        movingTrack = trackType;
        moveInitialX = e.clientX;
        moveInitialStart = clip.startOffset;

        const clips = trackType === 'main' ? $mainTrackClips : $audioTrackClips;
        const otherClips = clips.filter(c => c.id !== clip.id);
        const leftNeighbor = otherClips.filter(c => (c.startOffset + c.duration) <= clip.startOffset).sort((a, b) => (b.startOffset + b.duration) - (a.startOffset + a.duration))[0];
        const rightNeighbor = otherClips.filter(c => c.startOffset >= (clip.startOffset + clip.duration)).sort((a, b) => a.startOffset - b.startOffset)[0];

        moveMinLimit = leftNeighbor ? (leftNeighbor.startOffset + leftNeighbor.duration) : 0;
        moveMaxLimit = rightNeighbor ? (rightNeighbor.startOffset - clip.duration) : Infinity;
        
        showGuide = true;
        window.addEventListener('mousemove', handleMoveClip);
        window.addEventListener('mouseup', stopMoveClip);
    }

    function handleMoveClip(e) {
        if (!movingClipId) return;
        const deltaX = e.clientX - moveInitialX;
        const deltaSeconds = deltaX / pixelsPerSecond;
        let newStartOffset = Math.min(moveMaxLimit, Math.max(moveMinLimit, moveInitialStart + deltaSeconds));

        if (movingTrack === 'main') {
            mainTrackClips.update(clips => clips.map(c => c.id === movingClipId ? { ...c, startOffset: newStartOffset } : c));
        } else if (movingTrack === 'audio') {
            audioTrackClips.update(clips => clips.map(c => c.id === movingClipId ? { ...c, startOffset: newStartOffset } : c));
        }

        currentTime.set(newStartOffset);
        guideX = e.clientX;
        guideTimeText = `Start: ${newStartOffset.toFixed(2)}s`;
    }

    function stopMoveClip() {
        movingClipId = null;
        movingTrack = null;
        showGuide = false;
        window.removeEventListener('mousemove', handleMoveClip);
        window.removeEventListener('mouseup', stopMoveClip);
    }

    function handleTimelineClick(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const timelineX = x - 96; 
        const newTime = Math.max(0, timelineX / pixelsPerSecond);
        currentTime.set(newTime);
    }
</script>

<div class="h-[35%] bg-[#181818] border-t border-gray-700 flex flex-col relative select-none overflow-hidden">
    
    <!-- Zoom Toolbar -->
    <div class="h-8 bg-[#252525] border-b border-gray-700 flex items-center px-4 justify-end gap-3 z-50 relative">
        <span class="text-xs text-gray-400">Zoom</span>
        <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
        <input type="range" min="10" max="100" step="5" bind:value={pixelsPerSecond} class="w-32 accent-cyan-500 h-1 bg-gray-600 rounded appearance-none cursor-pointer">
        <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        <span class="text-xs text-gray-500 w-8 text-right">{pixelsPerSecond}px</span>
    </div>

    <!-- Timeline 捲動區 -->
    <div class="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative">
        <div class="relative h-full flex flex-col min-w-full" style="width: {totalDuration * pixelsPerSecond + 100}px;" on:click={handleTimelineClick}>

            <!-- Ruler -->
            <div class="h-6 border-b border-gray-700 flex text-[10px] text-gray-500 bg-[#181818] sticky left-0 z-20">
                <div class="w-24 border-r border-gray-700 shrink-0 bg-[#181818] sticky left-0 z-30"></div> 
                <div class="flex-1 relative">
                    {#each Array(Math.ceil(totalDuration / 5)) as _, i}
                        <div class="absolute border-l border-gray-700 pl-1 h-full" style="left: {i * 5 * pixelsPerSecond}px">
                            {i * 5}s
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Playhead -->
            <div class="absolute top-0 bottom-0 w-[1px] bg-cyan-400 z-40 pointer-events-none transition-all duration-75 ease-linear" style="left: {96 + ($currentTime * pixelsPerSecond)}px;">
                <div class="w-3 h-3 -ml-[5px] -mt-1.5 rotate-45 bg-cyan-400 rounded-sm"></div>
            </div>

            {#if showGuide}
                <div class="fixed top-[calc(60%-1px)] bottom-0 w-[1px] bg-white/50 z-[60] pointer-events-none border-l border-dashed border-white" style="left: {guideX}px;">
                    <div class="absolute -top-8 -left-8 bg-black/90 text-white text-[10px] px-2 py-1 rounded border border-gray-600 whitespace-nowrap">
                        {guideTimeText}
                    </div>
                </div>
            {/if}

            <!-- Tracks -->
            <div class="flex-1 relative">
                <!-- Main Track -->
                <div class="flex h-24 border-b border-gray-800 group relative" on:dragover={handleDragOver} on:drop={handleDrop}>
                    <div class="w-24 shrink-0 border-r border-gray-700 flex flex-col justify-center pl-3 text-xs text-gray-400 bg-[#181818] z-30 sticky left-0 h-full">
                        <div class="flex items-center gap-2"><span>Main Track</span></div>
                    </div>
                    <div class="flex-1 relative h-full bg-[#151515]">
                        {#each $mainTrackClips as clip (clip.id)}
                            <div class="absolute top-2 bottom-2 rounded overflow-hidden border border-cyan-600 bg-cyan-900/50 group/clip cursor-move" style="left: {clip.startOffset * pixelsPerSecond}px; width: {clip.duration * pixelsPerSecond}px;" title={clip.name} on:mousedown={(e) => startMoveClip(e, clip, 'main')}>
                                <div class="w-full h-full flex items-center justify-center pointer-events-none">
                                    <span class="text-[10px] text-white truncate px-1">{clip.name} ({clip.duration.toFixed(1)}s)</span>
                                </div>
                                
                                <!-- 🔥 新增：左側把手 (Start Trim) -->
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div 
                                    class="absolute top-0 bottom-0 left-0 w-4 cursor-ew-resize z-50 hover:bg-cyan-400/50 transition-colors flex items-center justify-center"
                                    on:mousedown={(e) => startResize(e, clip, 'main', 'start')}
                                    on:click|stopPropagation
                                >
                                    <div class="w-[2px] h-4 bg-white/50 rounded-full"></div>
                                </div>

                                <!-- 右側把手 (End Trim) -->
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div 
                                    class="absolute top-0 bottom-0 right-0 w-4 cursor-ew-resize z-50 hover:bg-cyan-400/50 transition-colors flex items-center justify-center"
                                    on:mousedown={(e) => startResize(e, clip, 'main', 'end')}
                                    on:click|stopPropagation
                                >
                                    <div class="w-[2px] h-4 bg-white/50 rounded-full"></div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
                
                <!-- Audio Track -->
                <div class="flex h-16 border-b border-gray-800 relative" on:dragover={handleDragOver} on:drop={handleAudioDrop}>
                     <div class="w-24 shrink-0 border-r border-gray-700 flex items-center pl-3 text-xs text-gray-400 bg-[#181818] z-30 sticky left-0 h-full">Audio</div>
                    <div class="flex-1 bg-[#151515] relative h-full">
                        {#each $audioTrackClips as clip (clip.id)}
                            <div class="absolute top-2 bottom-2 rounded overflow-hidden border border-green-600 bg-green-900/50 group/clip cursor-move" style="left: {clip.startOffset * pixelsPerSecond}px; width: {clip.duration * pixelsPerSecond}px;" title={clip.name} on:mousedown={(e) => startMoveClip(e, clip, 'audio')}>
                                <div class="w-full h-full flex items-center justify-center pointer-events-none">
                                    <span class="text-[10px] text-white truncate px-1">🎵 {clip.name} ({clip.duration.toFixed(1)}s)</span>
                                </div>
                                
                                <!-- 🔥 新增：左側把手 -->
                                <div class="absolute top-0 bottom-0 left-0 w-4 cursor-ew-resize z-50 hover:bg-green-400/50 transition-colors flex items-center justify-center" on:mousedown={(e) => startResize(e, clip, 'audio', 'start')} on:click|stopPropagation>
                                    <div class="w-[2px] h-4 bg-white/50 rounded-full"></div>
                                </div>
                                
                                <!-- 右側把手 -->
                                <div class="absolute top-0 bottom-0 right-0 w-4 cursor-ew-resize z-50 hover:bg-green-400/50 transition-colors flex items-center justify-center" on:mousedown={(e) => startResize(e, clip, 'audio', 'end')} on:click|stopPropagation>
                                    <div class="w-[2px] h-4 bg-white/50 rounded-full"></div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { height: 8px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: #181818; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
  .cursor-ew-resize { cursor: ew-resize; }
  .cursor-move { cursor: grab; }
  .cursor-move:active { cursor: grabbing; }
</style>