<script>
  import { currentVideoSource } from '../stores/playerStore';
  import { draggedFile } from '../stores/timelineStore';
  
  let fileInput;
  let files = [];
  
  // 🔥 1. 新增：過濾狀態
  let activeFilter = 'all'; // 'all', 'video', 'audio', 'image'

  function handleClick() { fileInput.click(); }

  // Helper: 取得檔案真實長度
  function getMediaDuration(file, url) {
    return new Promise((resolve) => {
      if (file.type.startsWith('image')) {
        resolve(3); 
      } else if (file.type.startsWith('video')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => resolve(5);
        video.src = url;
      } else if (file.type.startsWith('audio')) {
        const audio = new Audio();
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => resolve(5);
        audio.src = url;
      } else {
        resolve(5);
      }
    });
  }

  async function handleFileChange(e) {
    const newRawFiles = Array.from(e.target.files);
    const processedPromises = newRawFiles.map(async (file) => {
      // 檔案大小限制 2GB
      if (file.size > 2 * 1024 * 1024 * 1024) {
          alert(`檔案 "${file.name}" 太大！請使用 2GB 以下檔案。`);
          return null;
      }
      const url = URL.createObjectURL(file);
      const duration = await getMediaDuration(file, url);
      
      return {
        name: file.name,
        type: file.type,
        url: url,
        duration: duration,
        file: file 
      };
    });

    const results = await Promise.all(processedPromises);
    const validFiles = results.filter(result => result !== null);
    files = [...files, ...validFiles];
    e.target.value = '';
    
    // 上傳後自動切換到「全部」，讓使用者看到剛傳的東西
    activeFilter = 'all';
  }

  function selectMedia(file) {
    // Audio 也可以被預覽 (VideoPlayer 支援)
    if (file.type.startsWith('video') || file.type.startsWith('image') || file.type.startsWith('audio')) {
      currentVideoSource.set(file);
    }
  }

  function handleDragStart(e, file) {
    draggedFile.set(file);
    const dragData = JSON.stringify({
        url: file.url,
        name: file.name,
        type: file.type,
        duration: file.duration
    });
    e.dataTransfer.setData('application/json', dragData);
    e.dataTransfer.effectAllowed = 'copy';
  }

  // 🔥 2. 計算屬性：篩選後的檔案列表
  $: filteredFiles = files.filter(f => {
      if (activeFilter === 'all') return true;
      return f.type.startsWith(activeFilter);
  });

  // 🔥 計算各分類數量 (用於顯示在 Tab 上)
  $: countVideo = files.filter(f => f.type.startsWith('video')).length;
  $: countAudio = files.filter(f => f.type.startsWith('audio')).length;
  $: countImage = files.filter(f => f.type.startsWith('image')).length;

</script>

<div class="flex flex-col h-full">
    
    <!-- 上傳區塊 (固定在頂部) -->
    <div class="shrink-0 mb-4">
        <button on:click={handleClick} class="w-full border-2 border-dashed border-gray-600 rounded-lg h-24 flex flex-col justify-center items-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-[#2a2a2a] transition-colors group">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 group-hover:text-gray-200"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            <span class="text-xs text-gray-400 group-hover:text-gray-200">Import Media</span>
        </button>
        <input bind:this={fileInput} type="file" class="hidden" multiple accept="image/*,video/*,audio/*" on:change={handleFileChange} />
    </div>

    <!-- 🔥 3. 分類標籤列 (Filter Tabs) -->
    <div class="flex items-center gap-2 mb-2 shrink-0 overflow-x-auto no-scrollbar pb-1">
        <!-- Helper component for Tab Button -->
        <button 
            class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap
            {activeFilter === 'all' ? 'bg-gray-200 text-black border-gray-200' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}"
            on:click={() => activeFilter = 'all'}
        >
            All ({files.length})
        </button>
        
        <button 
            class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap
            {activeFilter === 'video' ? 'bg-cyan-900 text-cyan-400 border-cyan-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}"
            on:click={() => activeFilter = 'video'}
        >
            Video ({countVideo})
        </button>

        <button 
            class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap
            {activeFilter === 'audio' ? 'bg-green-900 text-green-400 border-green-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}"
            on:click={() => activeFilter = 'audio'}
        >
            Audio ({countAudio})
        </button>

        <button 
            class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap
            {activeFilter === 'image' ? 'bg-purple-900 text-purple-400 border-purple-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}"
            on:click={() => activeFilter = 'image'}
        >
            Image ({countImage})
        </button>
    </div>

    <!-- 列表區域 -->
    {#if filteredFiles.length > 0}
        <div class="grid grid-cols-2 gap-2 overflow-y-auto flex-1 pr-1 custom-scrollbar content-start">
            {#each filteredFiles as file}
            <div 
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, file)}
                on:click={() => selectMedia(file)}
                class="relative bg-black rounded overflow-hidden group border border-transparent hover:border-cyan-400 cursor-grab active:cursor-grabbing
                       {file.type.startsWith('audio') ? 'h-12 col-span-2 flex items-center px-2 gap-2' : 'aspect-square'}" 
                role="button" 
                tabindex="0"
            >
                {#if file.type.startsWith('image')}
                    <img src={file.url} alt={file.name} class="w-full h-full object-cover pointer-events-none" />
                    <div class="absolute top-1 right-1 bg-purple-600/80 px-1 rounded text-[8px] text-white">IMG</div>
                
                {:else if file.type.startsWith('video')}
                    <video src={file.url} class="w-full h-full object-cover pointer-events-none"></video>
                    <div class="absolute top-1 right-1 bg-cyan-600/80 px-1 rounded text-[8px] text-white">{Math.floor(file.duration)}s</div>
                
                {:else if file.type.startsWith('audio')}
                    <!-- 🔥 優化：音訊檔案改為長條狀顯示 (更省空間) -->
                    <div class="w-8 h-8 rounded-full bg-green-900 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-400"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                    <div class="flex-1 min-w-0 flex flex-col justify-center">
                        <p class="text-[10px] text-white truncate leading-tight">{file.name}</p>
                        <p class="text-[9px] text-gray-400">{Math.floor(file.duration)}s</p>
                    </div>
                {/if}

                <!-- Video/Image 的文字遮罩 -->
                {#if !file.type.startsWith('audio')}
                    <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1 pt-4 truncate">
                        <p class="text-[10px] text-white leading-none">{file.name}</p>
                    </div>
                {/if}
            </div>
            {/each}
        </div>
    {:else}
        <div class="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2">
            <p class="text-xs">No {activeFilter !== 'all' ? activeFilter : ''} files</p>
        </div>
    {/if}
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
  /* 隱藏水平捲軸 */
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>