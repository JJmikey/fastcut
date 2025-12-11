<script>
    import { onMount } from 'svelte'; // 🔥 確保引入 onMount
    import { currentVideoSource } from '../stores/playerStore';
    // 引入 Stores
    import { draggedFile, uploadedFiles, textTrackClips, createTextClip, resolveOverlaps, projectSettings, mainTrackClips, audioTrackClips } from '../stores/timelineStore';
    // 引入 History Store
    import { addToHistory } from '../stores/historyStore';
    // 🔥 引入 Bridge (為了接收 Landing Page 的檔案)
    import { getPendingFile } from '../utils/fileBridge';
    
    // 引入工具函式
    import { generateThumbnails } from '../utils/thumbnailGenerator';
    import { generateWaveform } from '../utils/waveformGenerator'; 
    import { parseSRT } from '../utils/srtParser'; 
    import { generateId } from '../stores/timelineStore'; 
    import { get } from 'svelte/store';
    
    let fileInput;
    let srtInput; 
    let isProcessing = false;
    let activeFilter = 'all'; 
    let activeTab = 'media';
  
    function handleClick() { 
        if (isProcessing) return; 
        fileInput.click(); 
    }

    // 🔥🔥🔥 補回：接收 Landing Page 傳來的檔案 🔥🔥🔥
    onMount(async () => {
        try {
            const pendingFile = await getPendingFile();
            if (pendingFile) {
                console.log("Found pending file from Landing Page:", pendingFile.name);
                
                // 模擬一個 input change event
                const fakeEvent = {
                    target: {
                        files: [pendingFile]
                    }
                };
                
                // 自動執行上傳流程 (這會觸發自動解析度 + 自動上軌)
                await handleFileChange(fakeEvent);
            }
        } catch (e) {
            console.error("Failed to load pending file:", e);
        }
    });
    // 🔥🔥🔥 結束補回 🔥🔥🔥

    // Helper: 一次取得 時間 + 寬 + 高
    function getMediaInfo(file, url) {
      return new Promise((resolve) => {
        // Image
        if (file.type.startsWith('image')) { 
            const img = new Image();
            img.src = url;
            img.onload = () => resolve({ duration: 3, width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ duration: 3, width: 1920, height: 1080 });
            return; 
        } 
  
        // Video / Audio
        const isVideo = file.type.startsWith('video') || file.name.toLowerCase().endsWith('.mov');
        const element = isVideo ? document.createElement('video') : document.createElement('audio');
        
        element.preload = 'metadata'; 
        element.muted = true;
        element.src = url;
        if (isVideo) element.playsInline = true;
  
        const isMov = file.name.toLowerCase().endsWith('.mov') || file.type === 'video/quicktime';
        let isResolved = false;
  
        // Timeout protection
        const timeout = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;
            if (isMov) {
                alert(`Load Failed: ${file.name}\n\nSystem format issue. Try Chrome.`);
                resolve(null);
            } else {
                console.warn("⚠️ [Debug] Read timeout, returning default");
                resolve({ duration: 30, width: 1280, height: 720 });
            }
        }, 4000);
  
        element.onloadedmetadata = () => {
            if (isResolved) return;
            
            const vWidth = (element.videoWidth) || 0;
            const vHeight = (element.videoHeight) || 0;
            const rawDuration = element.duration;

            if (rawDuration !== Infinity && !isNaN(rawDuration) && rawDuration > 0) {
                isResolved = true;
                clearTimeout(timeout);
                resolve({ duration: rawDuration, width: vWidth, height: vHeight });
                return;
            }
  
            // WebM Fix
            console.log("⚠️ [Debug] Fixing WebM duration...");
            element.currentTime = 1e7; 
            
            element.onseeked = () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timeout);
  
                let realDuration = element.currentTime;
                if (realDuration === 0 || realDuration > 360000) {
                    if (element.buffered.length > 0) {
                        realDuration = element.buffered.end(element.buffered.length - 1);
                    }
                }
                if (realDuration === 0 || realDuration > 360000) {
                     realDuration = 30;
                }
                resolve({ duration: realDuration, width: vWidth, height: vHeight });
            };
        };
  
        element.onerror = () => { 
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            if (isMov) {
                alert(`Cannot Load: ${file.name}`);
                resolve(null);
            } else {
                resolve({ duration: 5, width: 0, height: 0 });
            }
        };
      });
    }

    // 輔助：計算比例字串 (給 UI 顯示用)
    function calculateAspectRatio(w, h) {
        if (!w || !h) return '16:9';
        const ratio = w / h;
        if (Math.abs(ratio - 16/9) < 0.05) return '16:9';
        if (Math.abs(ratio - 9/16) < 0.05) return '9:16';
        if (Math.abs(ratio - 1) < 0.05) return '1:1';
        if (Math.abs(ratio - 4/5) < 0.05) return '4:5';
        return 'custom';
    }
  
    // 處理檔案上傳
    async function handleFileChange(e) {
      // 支援 FileList (input) 或 Array (fakeEvent)
      const newRawFiles = e.target.files ? Array.from(e.target.files) : e.target.files;
      if (!newRawFiles || newRawFiles.length === 0) return;
  
      isProcessing = true;
  
      try {
          const processedPromises = newRawFiles.map(async (file) => {
              if (file.size > 2 * 1024 * 1024 * 1024) {
                  alert(`File "${file.name}" is too large! Please use files under 2GB.`);
                  return null;
              }
  
              const url = URL.createObjectURL(file);
              
              const info = await getMediaInfo(file, url);
              
              if (!info) return null;

              const { duration, width, height } = info;

              // 長影片警告
              const DURATION_LIMIT = 1800; 
              if (duration > DURATION_LIMIT) {
                  const confirmLarge = window.confirm(
                      `⚠️ Large File Warning: "${file.name}"\n\n` +
                      `This video is over 30 minutes long (${Math.floor(duration/60)} mins).\n` +
                      `Browser-based editing may run out of memory and crash with large files.\n\n` +
                      `We recommend trimming it into shorter segments.\n` +
                      `Do you still want to proceed?`
                  );
                  if (!confirmLarge) return null;
              }
              
              const thumbnailBlobs = await generateThumbnails(file, duration);
              const thumbnailUrls = thumbnailBlobs.map(b => URL.createObjectURL(b));
  
              let waveform = null;
              const isVideo = file.type.startsWith('video') || file.name.toLowerCase().endsWith('.mov');
              const isAudio = file.type.startsWith('audio');
              
              if (isVideo || isAudio) {
                  waveform = await generateWaveform(file);
              }
              
              return {
                  name: file.name,
                  type: file.type || (isVideo ? 'video/quicktime' : 'application/octet-stream'),
                  url: url,
                  duration: duration,
                  width: width,
                  height: height,
                  file: file, 
                  thumbnails: thumbnailBlobs, 
                  waveform: waveform, 
                  thumbnailUrls: thumbnailUrls 
              };
          });
  
          const results = await Promise.all(processedPromises);
          const validFiles = results.filter(result => result !== null);
          
          // 自動設定專案解析度 + 自動上軌
          const currentMainClips = get(mainTrackClips);
          const currentAudioClips = get(audioTrackClips);
          
          if (currentMainClips.length === 0 && currentAudioClips.length === 0 && validFiles.length > 0) {
              const firstVideo = validFiles.find(f => (f.type.startsWith('video') || f.name.endsWith('.mov')) && f.width > 0);
              
              if (firstVideo) {
                  addToHistory();
                  console.log(`[Auto-Set] Detected video size: ${firstVideo.width} x ${firstVideo.height}`);
                  projectSettings.update(s => ({
                      ...s,
                      width: firstVideo.width,
                      height: firstVideo.height,
                      aspectRatio: 'original' 
                  }));

                  const newClip = {
                        id: '_' + Math.random().toString(36).substr(2, 9), 
                        fileUrl: firstVideo.url,
                        name: firstVideo.name,
                        type: firstVideo.type,
                        startOffset: 0,
                        duration: firstVideo.duration,
                        sourceDuration: firstVideo.duration,
                        mediaStartOffset: 0,
                        volume: 1.0,
                        file: firstVideo.file,
                        thumbnails: firstVideo.thumbnails,
                        thumbnailUrls: firstVideo.thumbnailUrls,
                        waveform: firstVideo.waveform,
                        scale: 1.0,
                        positionX: 0,
                        positionY: 0
                  };
                  mainTrackClips.update(clips => [newClip]);
                  console.log("Auto-added video to timeline.");
              }
          }

          uploadedFiles.update(currentFiles => [...currentFiles, ...validFiles]);
          
          if (validFiles.length > 0) {
            const firstFile = validFiles[0];
            fetch('/api/discord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'import',
                    filename: firstFile.name,
                    fileCount: validFiles.length,
                    duration: firstFile.duration ? Math.round(firstFile.duration) : 0
                })
            }).catch(e => console.warn("Webhook failed", e));
        }

          // 如果 input 存在才重置 (因為從 Landing Page 進來時，e.target 可能是 fake event)
          if (fileInput) fileInput.value = '';
          activeFilter = 'all'; 
  
      } catch (error) {
          console.error("Import failed:", error);
          alert("Import failed. See console for details.");
      } finally {
          isProcessing = false;
      }
    }
  
    function selectMedia(file) {
      const type = file.type || '';
      if (type.startsWith('video') || type.startsWith('image') || type.startsWith('audio') || file.name.endsWith('.mov')) {
        currentVideoSource.set(file);
      }
    }
  
    function handleDragStart(e, file) {
      draggedFile.set({ 
          file: file.file,
          thumbnails: file.thumbnails,
          waveform: file.waveform 
      });
  
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
  
    function handleDelete(e, fileToDelete) {
        e.stopPropagation(); 
        if (!confirm(`Are you sure to delete "${fileToDelete.name}" ?`)) return;
  
        uploadedFiles.update(currentFiles => currentFiles.filter(f => f !== fileToDelete));
  
        currentVideoSource.update(curr => {
            if (curr && curr.url === fileToDelete.url) return null;
            return curr;
        });
    }
  
    // 處理 SRT 上傳
    async function handleSRTUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        const subtitles = parseSRT(text);
        
        if (subtitles.length === 0) {
            alert("No valid subtitles found in this file.");
            e.target.value = ''; 
            return;
        }

        const newTextClips = subtitles.map(sub => ({
            id: generateId(),
            type: 'text',
            name: 'Subtitle',
            startOffset: sub.start,
            duration: sub.duration,
            sourceDuration: Infinity,
            mediaStartOffset: 0,
            text: sub.text,
            fontSize: 36,
            color: '#ffffff',
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            x: 50,
            y: 90, 
            showBackground: true,
            backgroundColor: '#00000099',
            strokeWidth: 0,
            strokeColor: '#000000',
            volume: 1.0
        }));

        const currentTexts = get(textTrackClips);
        let shouldClearOld = false;

        if (currentTexts.length > 0) {
            shouldClearOld = confirm(
                `Text track is not empty (${currentTexts.length} items).\n\n` +
                `Do you want to CLEAR existing text before importing subtitles?\n` +
                `(Click 'Cancel' to keep existing text and overlap)`
            );
        }

        addToHistory(); 

        if (shouldClearOld) {
            textTrackClips.set(newTextClips);
        } else {
            textTrackClips.update(current => [...current, ...newTextClips]);
        }
        
        if (typeof window !== 'undefined') {
            fetch('/api/discord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'import',
                    filename: `📜 SRT: ${file.name}`, 
                    fileCount: subtitles.length, 
                    duration: 0 
                })
            }).catch(err => console.warn("SRT webhook failed", err));
        }

        alert(`Successfully imported ${newTextClips.length} subtitles!`);
        e.target.value = ''; 
    }

    // 加入預設文字
    function addTextToTimeline() {
        addToHistory();
        const clips = get(textTrackClips);
        const currentMaxTime = clips.length > 0 ? Math.max(...clips.map(c => c.startOffset + c.duration)) : 0;
        const newClip = createTextClip(currentMaxTime);
        textTrackClips.update(currentClips => {
            const newClips = [...currentClips, newClip];
            return resolveOverlaps(newClips, newClip.id);
        });
    }
  
    $: safeFiles = $uploadedFiles || [];
    $: filteredFiles = safeFiles.filter(f => {
        if (activeFilter === 'all') return true;
        const type = f.type || '';
        if (activeFilter === 'video') return type.startsWith('video') || f.name.endsWith('.mov');
        return type.startsWith(activeFilter);
    });
    $: countVideo = safeFiles.filter(f => (f.type || '').startsWith('video') || f.name.endsWith('.mov')).length;
    $: countAudio = safeFiles.filter(f => (f.type || '').startsWith('audio')).length;
    $: countImage = safeFiles.filter(f => (f.type || '').startsWith('image')).length;
  
  </script>
  
  <div class="flex flex-col h-full">
      <div class="flex border-b border-gray-700 mb-4 shrink-0">
          <button class="flex-1 py-3 text-sm font-medium {activeTab === 'media' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-[#252525]' : 'text-gray-400 hover:text-gray-200'}" on:click={() => activeTab = 'media'}>Media</button>
          <button class="flex-1 py-3 text-sm font-medium {activeTab === 'text' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-[#252525]' : 'text-gray-400 hover:text-gray-200'}" on:click={() => activeTab = 'text'}>Text</button>
      </div>
  
      {#if activeTab === 'media'}
          
          <div class="shrink-0 mb-4">
              <button 
                  on:click={handleClick} 
                  disabled={isProcessing}
                  class="w-full border-2 border-dashed border-gray-600 rounded-lg h-24 flex flex-col justify-center items-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-[#2a2a2a] transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {#if isProcessing}
                      <div class="w-6 h-6 border-2 border-gray-400 border-t-cyan-400 rounded-full animate-spin"></div>
                      <span class="text-xs text-cyan-400 font-bold animate-pulse">Processing...</span>
                  {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 group-hover:text-gray-200"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                      <span class="text-xs text-gray-400 group-hover:text-gray-200">Import Media</span>
                  {/if}
              </button>
              <input id="global-file-input" bind:this={fileInput} type="file" class="hidden" multiple accept="image/*,video/*,audio/*,.mov,.mkv" on:change={handleFileChange} />
          </div>
          
          <div class="flex items-center gap-2 mb-2 shrink-0 overflow-x-auto no-scrollbar pb-1">
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'all' ? 'bg-gray-200 text-black border-gray-200' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'all'}>All ({safeFiles.length})</button>
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'video' ? 'bg-cyan-900 text-cyan-400 border-cyan-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'video'}>Video ({countVideo})</button>
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'audio' ? 'bg-green-900 text-green-400 border-green-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'audio'}>Audio ({countAudio})</button>
              <button class="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap {activeFilter === 'image' ? 'bg-purple-900 text-purple-400 border-purple-500' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'}" on:click={() => activeFilter = 'image'}>Image ({countImage})</button>
          </div>
  
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
                      <button on:click={(e) => handleDelete(e, file)} class="absolute top-1 left-1 w-5 h-5 bg-black/60 hover:bg-red-600 rounded flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all z-20" title="Remove file"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
  
                      {#if file.type && file.type.startsWith('image')}
                          <img src={file.url} alt={file.name} class="w-full h-full object-cover pointer-events-none" />
                          <div class="absolute top-1 right-1 bg-purple-600/80 px-1 rounded text-[8px] text-white">IMG</div>
                      {:else if (file.type && file.type.startsWith('video')) || file.name.endsWith('.mov')}
                          <video src={file.url} class="w-full h-full object-cover pointer-events-none"></video>
                          <div class="absolute top-1 right-1 bg-cyan-600/80 px-1 rounded text-[8px] text-white">{Math.floor(file.duration)}s</div>
                      {:else if file.type && file.type.startsWith('audio')}
                          <div class="w-8 h-8 rounded-full bg-green-900 flex items-center justify-center shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-400"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
                          <div class="flex-1 min-w-0 flex flex-col justify-center">
                              <p class="text-[10px] text-white truncate leading-tight">{file.name}</p>
                              <p class="text-[9px] text-gray-400">{Math.floor(file.duration)}s</p>
                          </div>
                      {/if}
  
                      {#if !(file.type && file.type.startsWith('audio'))}
                          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1 pt-4 truncate"><p class="text-[10px] text-white leading-none">{file.name}</p></div>
                      {/if}
                  </div>
                  {/each}
              </div>
          {:else}
              <div class="flex-1 flex flex-col items-center justify-center text-gray-600 gap-2"><p class="text-xs">No {activeFilter !== 'all' ? activeFilter : ''} files</p></div>
          {/if}
  
      {:else if activeTab === 'text'}
          <div class="flex flex-col gap-4 p-2">
              <button on:click={addTextToTimeline} class="w-full py-3 bg-cyan-900/50 hover:bg-cyan-900/80 text-cyan-400 border border-cyan-700 rounded text-sm transition-colors flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>Add Default Text</button>
              
              <!-- SRT Upload Button -->
              <button on:click={() => srtInput.click()} class="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded text-sm transition-colors flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Import Subtitles (.srt)
              </button>
              <input bind:this={srtInput} type="file" accept=".srt" class="hidden" on:change={handleSRTUpload} />

              <div class="text-xs text-gray-500 text-center mt-4">Click button to add text layer.<br>Or upload .srt file to auto-generate captions.</div>
          </div>
      {/if}
  </div>
  
  <style>
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #181818; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  </style>