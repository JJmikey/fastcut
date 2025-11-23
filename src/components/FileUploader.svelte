<script>

  import { draggedFile } from '../stores/timelineStore'; // 引入
  import { currentVideoSource } from '../stores/playerStore';
  
  let fileInput;
  let files = [];

  function handleClick() { fileInput.click(); }

  // 👇 新增：用來讀取影片/圖片真實長度的 Helper 函數
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
        // 🔥 新增：支援音訊長度讀取
        const audio = new Audio();
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => resolve(5);
        audio.src = url;
      } else {
        resolve(5);
      }
    });
  }

  // 👇 修改：變成 async 函數，因為要等待讀取時間
  async function handleFileChange(e) {
    const newRawFiles = Array.from(e.target.files);
    
    // 使用 Promise.all 平行處理所有上傳的檔案
    const processedPromises = newRawFiles.map(async (file) => {
      
      // 🔥 1. 插入點：檢查檔案大小 (2GB = 2 * 1024 * 1024 * 1024 bytes)
      if (file.size > 2 * 1024 * 1024 * 1024) {
          alert(`File "${file.name}" is too large! Please use files under 2GB.`);
          return null; // 回傳 null 代表這個檔案失敗，稍後會過濾掉
      }

      const url = URL.createObjectURL(file);
      const duration = await getMediaDuration(file, url); // 等待讀取真實長度
      
      return {
        name: file.name,
        type: file.type,
        url: url,
        duration: duration, // 這裡現在是真實的秒數了
        
        // 🔥 關鍵新增：必須把原始 file 物件存下來！
        // 這樣 IndexedDB 才能把它存進硬碟
        file: file 
      };
    });

    // 等待所有檔案處理完成 (此時 results 陣列裡可能會包含 null)
    const results = await Promise.all(processedPromises);

    // 🔥 2. 過濾掉剛剛因為太大而回傳 null 的檔案
    const validFiles = results.filter(result => result !== null);

    // 更新列表
    files = [...files, ...validFiles];
    
    e.target.value = '';
  }

  function selectMedia(file) {
    if (file.type.startsWith('video') || file.type.startsWith('image')) {
      currentVideoSource.set(file);
    }
  }

  function handleDragStart(e, file) {
    // 把完整檔案物件存入 store (為了 IndexedDB 能夠存取)
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
</script>

<!-- 下面的 HTML 與樣式完全不用動 -->
<button on:click={handleClick} class="w-full border-2 border-dashed border-gray-600 rounded-lg h-32 flex flex-col justify-center items-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-[#2a2a2a] transition-colors group">
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 group-hover:text-gray-200"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
  <span class="text-xs text-gray-400 group-hover:text-gray-200">Click to Upload</span>
</button>

<input bind:this={fileInput} type="file" class="hidden" multiple accept="image/*,video/*,audio/*" on:change={handleFileChange} />

{#if files.length > 0}
  <div class="mt-4 grid grid-cols-2 gap-2 overflow-y-auto max-h-[calc(100vh-300px)] pr-1 custom-scrollbar">
    {#each files as file}
      <div 
        draggable="true"
        on:dragstart={(e) => handleDragStart(e, file)}
        on:click={() => selectMedia(file)}
        class="relative aspect-square bg-black rounded overflow-hidden group border border-transparent hover:border-cyan-400 cursor-grab active:cursor-grabbing"
        role="button" 
        tabindex="0"
      >
        {#if file.type.startsWith('image')}
          <img src={file.url} alt={file.name} class="w-full h-full object-cover pointer-events-none" />
        {:else if file.type.startsWith('video')}
          <video src={file.url} class="w-full h-full object-cover pointer-events-none"></video>
          <div class="absolute top-1 right-1 bg-black/60 px-1 rounded text-[10px] text-white">
             <!-- 顯示秒數 (無條件捨去小數點) -->
             {Math.floor(file.duration)}s
          </div>
        {/if}
        <div class="absolute bottom-0 left-0 right-0 bg-black/70 p-1 truncate">
          <p class="text-[10px] text-white">{file.name}</p>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
</style>