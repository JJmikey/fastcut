<script>
    import { currentVideoSource, currentTime, isPlaying } from '../stores/playerStore';
    import { mainTrackClips, audioTrackClips, textTrackClips } from '../stores/timelineStore';
    import { isExporting, startExportTrigger } from '../stores/exportStore';
    import { draggedFile } from '../stores/timelineStore'; 
    import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
    
    let videoRef;
    let audioRef; 
    let imageRef;
    let canvasRef;
    let lastTime = 0;
    let exportProgress = 0;
    let exportStatus = "";

    // 計算總長度
    $: maxMain = $mainTrackClips.length > 0 ? Math.max(...$mainTrackClips.map(c => c.startOffset + c.duration)) : 0;
    $: maxAudio = $audioTrackClips.length > 0 ? Math.max(...$audioTrackClips.map(c => c.startOffset + c.duration)) : 0;
    $: maxText = $textTrackClips.length > 0 ? Math.max(...$textTrackClips.map(c => c.startOffset + c.duration)) : 0;
    
    $: contentDuration = Math.max(maxMain, maxAudio, maxText);
    $: hasClips = contentDuration > 0;
  
    // 監聽導出觸發
    $: if ($startExportTrigger > 0 && !$isExporting && hasClips) {
        fastExportProcess();
    }
  
    // ------------------------------------------------
    // 極速導出流程 (WebCodecs + Chunking + Text Fix)
    // ------------------------------------------------
    async function fastExportProcess() {
        try {
            isExporting.set(true);
            isPlaying.set(false);
            if (videoRef) videoRef.pause();
            if (audioRef) audioRef.pause();

            exportProgress = 0;
            exportStatus = "Initializing...";

            const width = 1280;
            const height = 720;
            const fps = 30;
            const durationInSeconds = contentDuration; 
            const totalFrames = Math.ceil(durationInSeconds * fps);
            
            // 1. Audio Config
            let audioConfig = { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 };
            let aSupport = await AudioEncoder.isConfigSupported(audioConfig);
            
            if (!aSupport.supported) {
                console.warn("AAC not supported, fallback to Opus");
                audioConfig = { ...audioConfig, codec: 'opus', sampleRate: 48000 };
                aSupport = await AudioEncoder.isConfigSupported(audioConfig);
            }

            // 2. Muxer
            const muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: { codec: 'avc', width, height },
                audio: aSupport.supported ? { 
                    codec: audioConfig.codec === 'opus' ? 'opus' : 'aac',
                    numberOfChannels: 2, 
                    sampleRate: audioConfig.sampleRate 
                } : undefined,
                fastStart: false 
            });

            // 3. Video Encoder
            const videoEncoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (e) => { throw e; }
            });
            await videoEncoder.configure({ codec: 'avc1.42001f', width, height, bitrate: 5_000_000, framerate: fps });

            // 4. Audio Encoder
            if (aSupport.supported) {
                exportStatus = "Processing Audio...";
                const audioEncoder = new AudioEncoder({
                    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                    error: (e) => console.error("Audio Error:", e)
                });
                audioEncoder.configure(audioConfig);

                const allClips = [...$mainTrackClips, ...$audioTrackClips];
                const mixedBuffer = await mixAllAudio(allClips, durationInSeconds, audioConfig.sampleRate);
                const left = mixedBuffer.getChannelData(0);
                const right = mixedBuffer.getChannelData(1);
                const interleaved = interleave(left, right);

                const chunkSize = audioConfig.sampleRate; 
                const totalSamples = mixedBuffer.length;

                for (let i = 0; i < totalSamples; i += chunkSize) {
                    const len = Math.min(chunkSize, totalSamples - i);
                    const chunkData = interleaved.slice(i * 2, (i + len) * 2);
                    const audioData = new AudioData({
                        format: 'f32',
                        sampleRate: audioConfig.sampleRate,
                        numberOfFrames: len,
                        numberOfChannels: 2,
                        timestamp: (i / audioConfig.sampleRate) * 1_000_000, 
                        data: chunkData
                    });
                    audioEncoder.encode(audioData);
                    audioData.close();
                }
                await audioEncoder.flush();
            }

            // 5. Rendering Video & Text
            exportStatus = "Rendering Video...";
            const ctx = canvasRef.getContext('2d', { willReadFrequently: true });
            canvasRef.width = width;
            canvasRef.height = height;

            for (let i = 0; i < totalFrames; i++) {
                const timeInSeconds = i / fps;
                const timestampMicros = i * (1_000_000 / fps);
                exportProgress = Math.round((i / totalFrames) * 100);
                await new Promise(r => setTimeout(r, 0));

                // 找出 Clip
                const activeClip = $mainTrackClips.find(clip => timeInSeconds >= clip.startOffset && timeInSeconds < (clip.startOffset + clip.duration));
                const activeText = $textTrackClips.find(clip => timeInSeconds >= clip.startOffset && timeInSeconds < (clip.startOffset + clip.duration));

                ctx.fillStyle = '#000'; 
                ctx.fillRect(0, 0, width, height);

                // 繪製影像
                if (activeClip) {
                    let sourceElement = null;
                    let sw, sh;

                    if (activeClip.type.startsWith('video')) {
                        sourceElement = videoRef;
                        if (!videoRef.src.includes(activeClip.fileUrl)) {
                            videoRef.src = activeClip.fileUrl;
                            await new Promise(r => videoRef.onloadedmetadata = r);
                        }
                        const seekTime = (timeInSeconds - activeClip.startOffset) + (activeClip.mediaStartOffset || 0);
                        
                        await new Promise((resolve) => {
                            const onSeeked = () => { videoRef.removeEventListener('seeked', onSeeked); resolve(); };
                            videoRef.addEventListener('seeked', onSeeked); videoRef.currentTime = seekTime;
                        });
                        sw = videoRef.videoWidth; sh = videoRef.videoHeight;
                    } else if (activeClip.type.startsWith('image')) {
                        sourceElement = imageRef;
                        if (!imageRef.src.includes(activeClip.fileUrl)) {
                            imageRef.src = activeClip.fileUrl;
                            await new Promise((resolve) => {
                                if (imageRef.complete) resolve(); else imageRef.onload = resolve;
                            });
                        }
                        sw = imageRef.naturalWidth; sh = imageRef.naturalHeight;
                    }

                    if (sourceElement && sw && sh) {
                        const r = Math.min(width / sw, height / sh);
                        const dw = sw * r; const dh = sh * r;
                        ctx.drawImage(sourceElement, (width - dw)/2, (height - dh)/2, dw, dh);
                    }
                }

                // 繪製文字 (Render Layer - 修正順序)
                if (activeText) {
                    ctx.font = `${activeText.fontWeight || 'bold'} ${activeText.fontSize}px ${activeText.fontFamily || 'Arial, sans-serif'}`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const x = (activeText.x / 100) * width;
                    const y = (activeText.y / 100) * height;
                    const padding = 10;

                    // A. 繪製背景
                    if (activeText.showBackground) {
                        const metrics = ctx.measureText(activeText.text);
                        const textWidth = metrics.width;
                        const textHeight = activeText.fontSize;
                        
                        ctx.fillStyle = activeText.backgroundColor;
                        ctx.fillRect(x - textWidth/2 - padding, y - textHeight/2 - padding, textWidth + padding*2, textHeight + padding*2);
                    }

                    // B. 先畫描邊 (Stroke First)
                    if (activeText.strokeWidth > 0) {
                        ctx.lineJoin = 'round'; 
                        ctx.miterLimit = 2;
                        ctx.lineWidth = activeText.strokeWidth;
                        ctx.strokeStyle = activeText.strokeColor;
                        ctx.strokeText(activeText.text, x, y);
                    }

                    // C. 最後畫文字本體 (Fill Second)
                    ctx.fillStyle = activeText.color;
                    ctx.fillText(activeText.text, x, y);
                }

                const frame = new VideoFrame(canvasRef, { timestamp: timestampMicros });
                const keyFrame = i % (fps * 2) === 0; 
                videoEncoder.encode(frame, { keyFrame });
                frame.close();
            }

            await videoEncoder.flush();
            muxer.finalize();

            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a'); 
            a.href = url; 
            a.download = `fastvideocutter_export_${Date.now()}.mp4`;
            
            document.body.appendChild(a); 
            a.click();
            setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); isExporting.set(false); startExportTrigger.set(0); }, 1000);

        } catch (err) {
            console.error(err);
            alert(`Export Failed: ${err.message}`);
            isExporting.set(false);
            startExportTrigger.set(0);
        }
    }

    // --- Helpers ---
    async function mixAllAudio(clips, totalDuration, targetSampleRate) {
        const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * targetSampleRate), targetSampleRate);
        const promises = clips.map(async (clip) => {
            try {
                if (clip.type.startsWith('image') || clip.type === 'text') return; 

                const response = await fetch(clip.fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                const tempCtx = new AudioContext();
                const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
                tempCtx.close(); 
                const source = offlineCtx.createBufferSource();
                source.buffer = audioBuffer;
                const gainNode = offlineCtx.createGain();
                gainNode.gain.value = clip.volume !== undefined ? clip.volume : 1.0;
                source.connect(gainNode);
                gainNode.connect(offlineCtx.destination);
                
                const offset = clip.mediaStartOffset || 0;
                source.start(clip.startOffset, offset, clip.duration);
            } catch (e) { }
        });
        await Promise.all(promises);
        return await offlineCtx.startRendering();
    }

    function interleave(inputL, inputR) {
        const length = inputL.length + inputR.length;
        const result = new Float32Array(length);
        let index = 0, inputIndex = 0;
        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }

    // ============================================================
    // UI Preview Logic
    // ============================================================
    
    $: isSourceMode = !!$currentVideoSource;
    $: activeClip = $mainTrackClips.find(clip => $currentTime >= clip.startOffset && $currentTime < (clip.startOffset + clip.duration));
    $: activeAudioClip = $audioTrackClips.find(clip => $currentTime >= clip.startOffset && $currentTime < (clip.startOffset + clip.duration));
    $: activeTextClip = $textTrackClips.find(clip => $currentTime >= clip.startOffset && $currentTime < (clip.startOffset + clip.duration));

    // 1. Sync Video / Image Source (解耦播放控制)
    $: if (!$isExporting && !isSourceMode) {
        if (activeClip) {
            if (activeClip.type.startsWith('video')) {
                if (videoRef) {
                    if (!videoRef.src.includes(activeClip.fileUrl)) videoRef.src = activeClip.fileUrl;
                    videoRef.volume = activeClip.volume !== undefined ? activeClip.volume : 1.0;
                    const seekTime = ($currentTime - activeClip.startOffset) + (activeClip.mediaStartOffset || 0);
                    
                    // 只有在暫停時，或者誤差極大時才 Seek，避免與 Loop 衝突
                    if (!$isPlaying || Math.abs(videoRef.currentTime - seekTime) > 0.25) {
                        videoRef.currentTime = seekTime;
                    }
                }
            } else if (activeClip.type.startsWith('image')) {
                if (imageRef && !imageRef.src.includes(activeClip.fileUrl)) imageRef.src = activeClip.fileUrl;
            }
        } else {
            if (videoRef && videoRef.src) videoRef.removeAttribute('src');
            if (imageRef && imageRef.src) imageRef.removeAttribute('src');
        }
    }

    // 2. Sync Audio Source (解耦播放控制)
    $: if (!$isExporting && !isSourceMode) {
        if (activeAudioClip && audioRef) {
            if (!audioRef.src.includes(activeAudioClip.fileUrl)) audioRef.src = activeAudioClip.fileUrl;
            audioRef.volume = activeAudioClip.volume !== undefined ? activeAudioClip.volume : 1.0;
            const audioSeekTime = ($currentTime - activeAudioClip.startOffset) + (activeAudioClip.mediaStartOffset || 0);
            
            if (!$isPlaying || Math.abs(audioRef.currentTime - audioSeekTime) > 0.25) {
                audioRef.currentTime = audioSeekTime;
            }
        } else if (audioRef) {
            if (audioRef.src) audioRef.removeAttribute('src');
        }
    }

    // 3. Source Preview Mode Logic
    $: if (isSourceMode && !$isExporting) {
        const src = $currentVideoSource;
        if (src.type.startsWith('video')) {
            if (videoRef && videoRef.src !== src.url) {
                videoRef.src = src.url; videoRef.volume = 1.0; videoRef.play().catch(() => {});
            }
            if (audioRef) audioRef.pause();
        } else if (src.type.startsWith('audio')) {
            if (audioRef && audioRef.src !== src.url) {
                audioRef.src = src.url; audioRef.volume = 1.0; audioRef.play().catch(() => {});
            }
            if (videoRef) { videoRef.pause(); videoRef.removeAttribute('src'); }
        } else if (src.type.startsWith('image')) {
            if (imageRef && imageRef.src !== src.url) imageRef.src = src.url;
            if (videoRef) videoRef.pause(); if (audioRef) audioRef.pause();
        }
    }

    // 4. 🔥 Play/Pause Control (獨立的控制邏輯)
    $: if (!$isExporting) {
        if ($isPlaying && !isSourceMode) {
            // Timeline 模式播放
            if (videoRef && activeClip && activeClip.type.startsWith('video')) videoRef.play().catch(() => {});
            if (audioRef && activeAudioClip) audioRef.play().catch(() => {});
        } else if (isSourceMode) {
            // Source 模式由上面邏輯處理自動播放，這裡不強制干涉
        } else {
            // 暫停
            if (videoRef) videoRef.pause();
            if (audioRef) audioRef.pause();
        }
    }

    // 5. 🔥 Loop Logic (只依賴 isPlaying，不依賴 activeClip)
    $: if ($isPlaying && !$isExporting && !isSourceMode) {
        lastTime = performance.now();
        requestAnimationFrame(loop);
    }

    function togglePlay() {
        if (isSourceMode) {
            if ($currentVideoSource.type.startsWith('video')) videoRef.paused ? videoRef.play() : videoRef.pause();
            else if ($currentVideoSource.type.startsWith('audio')) audioRef.paused ? audioRef.play() : audioRef.pause();
            return;
        }
        if (!hasClips || $isExporting) return;
        if (!$isPlaying && $currentTime >= contentDuration) currentTime.set(0);
        isPlaying.update(v => !v);
    }
    
    function loop(timestamp) {
        if (!$isPlaying || $isExporting || isSourceMode) return;
        if (contentDuration === 0) { isPlaying.set(false); currentTime.set(0); return; }
        
        const deltaTime = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        currentTime.update(t => t + deltaTime);
        
        if ($currentTime >= contentDuration) {
            isPlaying.set(false);
            currentTime.set(contentDuration);
            return;
        }
        requestAnimationFrame(loop);
    }

    function handleDragStart(e) {
        const source = isSourceMode ? $currentVideoSource : activeClip;
        if (!source) { e.preventDefault(); return; }
        if (source.file) draggedFile.set({ file: source.file, thumbnails: source.thumbnails });
        const dragData = JSON.stringify({
            url: source.url || source.fileUrl, name: source.name, type: source.type,
            duration: source.sourceDuration || source.duration || 5,
            thumbnailUrls: source.thumbnailUrls || []
        });
        e.dataTransfer.setData('application/json', dragData);
        e.dataTransfer.effectAllowed = 'copy';
    }
</script>

<div class="flex-1 bg-[#101010] relative flex flex-col justify-center items-center overflow-hidden w-full h-full select-none">
    <canvas bind:this={canvasRef} class="hidden"></canvas>
    <audio bind:this={audioRef} class="hidden"></audio>

    <div 
        class="relative w-full h-full flex justify-center items-center group cursor-grab active:cursor-grabbing" 
        draggable="true"
        on:dragstart={handleDragStart}
        on:click={togglePlay}
    >
        <!-- Video Element -->
        <video 
            bind:this={videoRef} 
            class="max-w-full max-h-full object-contain pointer-events-none 
                   {(isSourceMode && $currentVideoSource.type.startsWith('video')) || (!isSourceMode && activeClip && activeClip.type.startsWith('video')) ? 'block' : 'hidden'}" 
            muted={false} 
            crossorigin="anonymous"
        ></video>

        <!-- Image Element -->
        <img 
            bind:this={imageRef}
            class="max-w-full max-h-full object-contain pointer-events-none 
                   {(isSourceMode && $currentVideoSource.type.startsWith('image')) || (!isSourceMode && activeClip && activeClip.type.startsWith('image')) ? 'block' : 'hidden'}"
            alt="preview"
        />

        <!-- Audio Placeholder -->
        {#if isSourceMode && $currentVideoSource.type.startsWith('audio')}
            <div class="flex flex-col items-center gap-4 text-green-400 animate-pulse"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span class="text-sm font-mono">Previewing Audio...</span></div>
        {/if}
        
        <!-- 🔥 文字預覽層 (Preview Layer) -->
        {#if !isSourceMode && activeTextClip}
            <div 
                class="absolute pointer-events-none text-center select-none"
                style="
                    top: {activeTextClip.y}%; 
                    left: {activeTextClip.x}%; 
                    transform: translate(-50%, -50%);
                    font-size: {activeTextClip.fontSize}px;
                    color: {activeTextClip.color};
                    font-family: {activeTextClip.fontFamily || 'Arial, sans-serif'};
                    font-weight: {activeTextClip.fontWeight || 'bold'};
                    white-space: pre-wrap;
                    
                    /* 🔥 使用 paint-order 確保描邊在後面 */
                    paint-order: stroke fill;
                    -webkit-text-stroke: {activeTextClip.strokeWidth}px {activeTextClip.strokeColor};
                    
                    background-color: {activeTextClip.showBackground ? activeTextClip.backgroundColor : 'transparent'};
                    padding: {activeTextClip.showBackground ? '10px 20px' : '0'};
                    border-radius: 8px;
                "
            >
                {activeTextClip.text}
            </div>
        {/if}

        <!-- Overlays -->
        {#if isSourceMode}
             <div class="absolute top-4 left-4 flex items-center gap-2 z-20">
                <div class="bg-blue-900/90 px-3 py-1.5 rounded text-xs text-white pointer-events-none shadow-lg border border-blue-700/50">Source Preview: {$currentVideoSource.name}</div>
                <button class="bg-black/60 hover:bg-red-600/80 text-white w-7 h-7 rounded flex items-center justify-center transition-colors backdrop-blur-sm shadow-lg cursor-pointer pointer-events-auto" on:click|stopPropagation={() => currentVideoSource.set(null)}><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
             </div>
        {:else if activeClip && !$isExporting}
            <div class="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white z-20 pointer-events-none">Timeline: {activeClip.name}</div>
        {/if}

        {#if !activeClip && !isSourceMode && !activeTextClip}
            <div class="flex flex-col items-center gap-4 opacity-20 text-white absolute pointer-events-none"><span class="text-sm">{!hasClips ? 'Drag media to start' : 'Black Screen'}</span></div>
        {/if}
      
        {#if $isExporting}
            <div class="absolute z-50 bg-black/90 px-8 py-6 rounded-xl flex flex-col items-center gap-4 shadow-2xl border border-gray-800">
                <div class="relative w-12 h-12"><div class="absolute inset-0 border-4 border-gray-700 rounded-full"></div><div class="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
                <div class="text-center"><div class="text-white font-bold text-lg">{exportStatus}</div><div class="text-cyan-400 font-mono text-xl mt-1">{exportProgress}%</div></div>
            </div>
        {/if}
    </div>

    <div class={`absolute bottom-8 bg-[#1e1e1e] border border-gray-700 rounded-full px-6 py-2 flex items-center gap-6 text-white z-30 transition-opacity ${(!hasClips && !isSourceMode) || $isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <button on:click|stopPropagation={togglePlay} class="hover:text-cyan-400 disabled:cursor-not-allowed" disabled={(!hasClips && !isSourceMode) || $isExporting}>
            {#if $isPlaying || (isSourceMode && videoRef && !videoRef.paused) || (isSourceMode && audioRef && !audioRef.paused)} ⏸ {:else} ▶ {/if}
        </button>
        <div class="w-[1px] h-4 bg-gray-600"></div>
        <span class="font-mono text-sm w-16 text-center">{isSourceMode ? 'Preview' : $currentTime.toFixed(1) + 's'}</span>
    </div>
</div>