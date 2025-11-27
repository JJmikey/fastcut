<script>
    import { currentVideoSource } from '../stores/playerStore';
    // 引入 Stores
    import { draggedFile, uploadedFiles, textTrackClips, createTextClip, resolveOverlaps } from '../stores/timelineStore';
    
    // 引入工具函式
    import { generateThumbnails } from '../utils/thumbnailGenerator';
    import { generateWaveform } from '../utils/waveformGenerator'; 
    import { get } from 'svelte/store';
    
    let fileInput;
    
    // UI 狀態
    let isProcessing = false;
    let activeFilter = 'all'; // 'all', 'video', 'audio', 'image'
    let activeTab = 'media';  // 'media' or 'text'
  
    function handleClick() { 
        if (isProcessing) return; 
        fileInput.click(); 
    }
  
    // 🔥 Helper: 取得檔案真實長度 (嚴格競速版：修復 MOV 卡死與 WebM 錯誤)
    function getMediaDuration(file, url) {
      return new Promise((resolve) => {
        
        // 判斷是否為 MOV (有些系統 file.type 是空的)
        const isMov = file.name.toLowerCase().endsWith('.mov') || file.type === 'video/quicktime';
  
        // 圖片處理
        if (file.type.startsWith('image') && !isMov) {
          resolve(3); 
          return;
        } 
  
        // 建立元素
        const isAudio = file.type.startsWith('audio');
        const element = isAudio ? document.createElement('audio') : document.createElement('video');
        
        element.preload = 'auto'; // 強制預載
        element.muted = true;
        element.src = url;
        if (!isAudio) element.playsInline = true;
  
        // 🏳️ 狀態旗標：確保 resolve 只被呼叫一次 (Race Condition Lock)
        let isResolved = false;
  
        // ⏰ 1. 設定超時殺手 (3秒)
        // 如果瀏覽器因為不支援 HEVC 而卡住 (Hang)，這個計時器會強制中斷它
        const timeout = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;
  
            if (isMov) {
                alert(`讀取超時：${file.name}\n\nChrome/Edge (Linux/Windows) 可能不支援此 MOV 編碼 (HEVC)。\n建議：\n1. 使用 Firefox 或 Safari。\n2. 或轉檔為 MP4 (H.264)。`);
                resolve(null); // 拒絕上傳
            } else {
                // 其他格式超時，給個預設值 (WebM 常見情況)
                console.warn("⚠️ [Debug] 讀取超時，回傳預設值 30s");
                resolve(30);
            }
        }, 3000);
  
        // ✅ 2. 成功讀取 Metadata
        element.onloadedmetadata = () => {
            if (isResolved) return; // 如果已經超時，就忽略這裡
            
            // 檢查寬高 (有些不支援的格式讀得到 header 但解不出畫面，寬高會是 0)
            if (!isAudio && (element.videoWidth === 0 || element.videoHeight === 0)) {
                isResolved = true;
                clearTimeout(timeout);
                alert(`無法解碼：${file.name}\n影片寬度為 0，瀏覽器無法處理此格式。`);
                resolve(null);
                return;
            }
  
            const rawDuration = element.duration;
            const isWebM = file.type === 'video/webm' || file.name.toLowerCase().endsWith('.webm');
  
            // 正常情況
            if (!isWebM && rawDuration !== Infinity && !isNaN(rawDuration)) {
                isResolved = true;
                clearTimeout(timeout);
                resolve(rawDuration);
                return;
            }
  
            // WebM / Infinity 修復邏輯
            console.log("⚠️ [Debug] 啟動 WebM 強制校正...");
            element.currentTime = 1e7; 
            
            element.onseeked = () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
  
                let realDuration = element.currentTime;
                
                // 緩衝區檢查
                if (Math.abs(realDuration - rawDuration) < 1 || realDuration > 36000) {
                    if (element.buffered.length > 0) {
                        const bufferedEnd = element.buffered.end(element.buffered.length - 1);
                        if (bufferedEnd > 0) realDuration = bufferedEnd;
                    }
                }
  
                if (realDuration === 0 && rawDuration > 0 && rawDuration !== Infinity) {
                     resolve(rawDuration);
                } else {
                     resolve(realDuration);
                }
            };
        };
  
        // ❌ 3. 瀏覽器報錯
        element.onerror = () => { 
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            
            if (isMov) {
                alert(`格式錯誤：${file.name}\n瀏覽器無法識別此 MOV 檔案。`);
                resolve(null);
            } else {
                resolve(5); 
            }
        };
      });
    }
  
    // 處理檔案上傳
    async function handleFileChange(e) {
      const newRawFiles = Array.from(e.target.files);
      if (newRawFiles.length === 0) return;
  
      isProcessing = true;
  
      try {
          const processedPromises = newRawFiles.map(async (file) => {
              // 1. 檔案大小檢查 (2GB)
              if (file.size > 2 * 1024 * 1024 * 1024) {
                  alert(`File "${file.name}" too large! Please use files under 2GB.`);
                  return null;
              }
  
              const url = URL.createObjectURL(file);
              
              // 2. 取得長度 (如果回傳 null 代表失敗，被過濾掉)
              const duration = await getMediaDuration(file, url);
              
              if (duration === null) return null;
              
              // 3. 生成縮圖 (Video/Image)
              const thumbnailBlobs = await generateThumbnails(file, duration);
              const thumbnailUrls = thumbnailBlobs.map(b => URL.createObjectURL(b));
  
              // 4. 生成波形 (Audio/Video)
              let waveform = null;
              const isVideo = file.type.startsWith('video') || file.name.toLowerCase().endsWith('.mov');
              const isAudio = file.type.startsWith('audio');
  
              if (isVideo || isAudio) {
                  waveform = await generateWaveform(file);
              }
              
              return {
                  name: file.name,
                  // 補全 type (MOV 有時 type 為空)
                  type: file.type || (isVideo ? 'video/quicktime' : 'application/octet-stream'),
                  url: url,
                  duration: duration,
                  
                  // 原始資料 (用於 IndexedDB 存檔)
                  file: file, 
                  thumbnails: thumbnailBlobs, 
                  waveform: waveform, 
  
                  // 顯示用資料
                  thumbnailUrls: thumbnailUrls 
              };
          });
  
          const results = await Promise.all(processedPromises);
          const validFiles = results.filter(result => result !== null);
          
          uploadedFiles.update(currentFiles => [...currentFiles, ...validFiles]);
          
          e.target.value = '';
          activeFilter = 'all'; 
  
      } catch (error) {
          console.error("Import failed:", error);
          alert("Import failed. See console for details.");
      } finally {
          isProcessing = false;
      }
    }
  
    // 點擊預覽素材
    function selectMedia(file) {
      const type = file.type || '';
      if (type.startsWith('video') || type.startsWith('image') || type.startsWith('audio') || file.name.endsWith('.mov')) {
        currentVideoSource.set(file);
      }
    }
  
    // 拖曳開始
    function handleDragStart(e, file) {
      // 1. 設定 Store (傳遞所有原始資料給 Timeline 用於存檔)
      draggedFile.set({ 
          file: file.file,
          thumbnails: file.thumbnails,
          waveform: file.waveform 
      });
  
      // 2. 設定 JSON (傳遞給 Timeline 用於立即顯示)
      const dragData = JSON.stringify({
          url: file.url,
          name: file.name,
          type: file.type,
          duration: file.duration,
          thumbnailUrls: file.thumbnailUrls || [],
          waveform: file.waveform 
      });
      
      e.dataTransfer.setData('application/json', dragData);
      e.dataTransfer.effectAllowed = 'copy';
    }
  
    // 刪除素材
    function handleDelete(e, fileToDelete) {
        e.stopPropagation(); 
        if (!confirm(`確定要從素材庫移除 "${fileToDelete.name}" 嗎？`)) return;
  
        uploadedFiles.update(currentFiles => currentFiles.filter(f => f !== fileToDelete));
  
        currentVideoSource.update(curr => {
            if (curr && curr.url === fileToDelete.url) return null;
            return curr;
        });
    }
  
    // 新增文字到 Timeline
    function addTextToTimeline() {
        const clips = get(textTrackClips);
        const currentMaxTime = clips.length > 0 ? Math.max(...clips.map(c => c.startOffset + c.duration)) : 0;
        
        const newClip = createTextClip(currentMaxTime);
        
        textTrackClips.update(currentClips => {
            const newClips = [...currentClips, newClip];
            return resolveOverlaps(newClips, newClip.id);
        });
    }
  
    // Reactive: 防呆過濾列表
    $: safeFiles = $uploadedFiles || [];
  
    $: filteredFiles = safeFiles.filter(f => {
        if (activeFilter === 'all') return true;
        const type = f.type || '';
        // 寬容判斷
        if (activeFilter === 'video') return type.startsWith('video') || f.name.endsWith('.mov');
        return type.startsWith(activeFilter);
    });
  
    $: countVideo = safeFiles.filter(f => (f.type || '').startsWith('video') || f.name.endsWith('.mov')).length;
    $: countAudio = safeFiles.filter(f => (f.type || '').startsWith('audio')).length;
    $: countImage = safeFiles.filter(f => (f.type || '').startsWith('image')).length;
  
  </script>
  
  <div class="flex flex-col h-full">
      
      <!-- 頂部模式切換 Tabs -->
      <div class="flex border-b border-gray-700 mb-4 shrink-0">
          <button 
              class="flex-1 py-3 text-sm font-medium {activeTab === 'media' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-[#252525]' : 'text-gray-400 hover:text-gray-200'}"
              on:click={() => activeTab = 'media'}
          >
              Media
          </button>
          <button 
              class="flex-1 py-3 text-sm font-medium {activeTab === 'text' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-[#252525]' : 'text-gray-400 hover:text-gray-200'}"
              on:click={() => activeTab = 'text'}
          >
              Text
          </button>
      </div>
  
      {#if activeTab === 'media'}
          <!-- Media 模式內容 -->
          
          <!-- Import Button -->
          <div class="shrink-0 mb-4">
              <button 
                  on:click={handleClick} 
                  disabled={isProcessing}
                  class="w-full border-2 border-dashed border-gray-600 rounded-lg h-24 flex flex-col justify-center items-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-[#2a2a2a] transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {#if isProcessing}
                      <!-- Loading Spinner -->
                      <div class="w-6 h-6 border-2 border-gray-400 border-t-cyan-400 rounded-full animate-spin"></div>
                      <span class="text-xs text-cyan-400 font-bold animate-pulse">Processing...</span>
                  {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 group-hover:text-gray-200"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                      <span class="text-xs text-gray-400 group-hover:text-gray-200">Import Media</span>
                  {/if}
              </button>
              <input bind:this={fileInput} type="file" class="hidden" multiple accept="image/*,video/*,audio/*,.mov,.mkv" on:change={handleFileChange} />
          </div>
  
          <!-- Filter Tabs -->
          <div class="flex items-center gap-2 mb-2 shrink-0 overflow-x-auto no-scrollbar pb-1">
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'all' ? 'bg-gray-200 text-black border-gray-200' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'all'}>All ({safeFiles.length})</button>
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'video' ? 'bg-cyan-900 text-cyan-400 border-cyan-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'video'}>Video ({countVideo})</button>
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'audio' ? 'bg-green-900 text-green-400 border-green-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'audio'}>Audio ({countAudio})</button>
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'image' ? 'bg-purple-900 text-purple-400 border-purple-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'image'}>Image ({countImage})</button>
          </div>
  
          <!-- File List -->
          {#if filteredFiles.length > 0}
              <div class="grid grid-cols-2 gap-2 overflow-y-auto flex-1 pr-1 custom-scrollbar content-start">
                  {#each filteredFiles as file}
                  <div 
                      draggable="true"
                      on:dragstart={(e) => handleDragStart(e, file)}
                      on:click={() => selectMedia(file)}
                      class="relative bg-black rounded overflow-hidden group border border-transparent hover:border-cyan-400 cursor-grab active:cursor-grabbing
                             {file.type && file.type.startsWith('audio') ? 'h-12 col-span-2 flex items-center px-2 gap-2' : 'aspect-square'}" 
                      role="button" 
                      tabindex="0"
                  >
                      <!-- 刪除按鈕 -->
                      <button 
                          on:click={(e) => handleDelete(e, file)}
                          class="absolute top-1 left-1 w-5 h-5 bg-black/60 hover:bg-red-600 rounded flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all z-20"
                          title="Remove file"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
  
                      {#if file.type && file.type.startsWith('image')}
                          <img src={file.url} alt={file.name} class="w-full h-full object-cover pointer-events-none" />
                          <div class="absolute top-1 right-1 bg-purple-600/80 px-1 rounded text-[8px] text-white">IMG</div>
                      
                      {:else if (file.type && file.type.startsWith('video')) || file.name.endsWith('.mov')}
                          <video src={file.url} class="w-full h-full object-cover pointer-events-none"></video>
                          <div class="absolute top-1 right-1 bg-cyan-600/80 px-1 rounded text-[8px] text-white">{Math.floor(file.duration)}s</div>
                      
                      {:else if file.type && file.type.startsWith('audio')}
                          <div class="w-8 h-8 rounded-full bg-green-900 flex items-center justify-center shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-400"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                          <div class="flex-1 min-w-0 flex flex-col justify-center">
                              <p class="text-[10px] text-white truncate leading-tight">{file.name}</p>
                              <p class="text-[9px] text-gray-400">{Math.floor(file.duration)}s</p>
                          </div>
                      {/if}
  
                      {#if !(file.type && file.type.startsWith('audio'))}
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
  
      {:else if activeTab === 'text'}
          <div class="flex flex-col gap-4 p-2">
              <button 
                  on:click={addTextToTimeline}
                  class="w-full py-3 bg-cyan-900/50 hover:bg-cyan-900/80 text-cyan-400 border border-cyan-700 rounded text-sm transition-colors flex items-center justify-center gap-2"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  Add Default Text
              </button>
              <div class="text-xs text-gray-500 text-center mt-4">
                  Click button to add a text layer to timeline.<br>
                  Then edit properties in the right panel.
              </div>
          </div>
      {/if}
  </div>
  
  <style>
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #181818; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  </style>