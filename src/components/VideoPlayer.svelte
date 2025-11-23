<script>
    import { currentVideoSource, currentTime, isPlaying } from '../stores/playerStore';
    import { mainTrackClips, audioTrackClips } from '../stores/timelineStore';
    import { isExporting, startExportTrigger } from '../stores/exportStore';
    import { draggedFile } from '../stores/timelineStore'; // 🔥 引入 store
    import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
    
    let videoRef;
    let audioRef; 
    let canvasRef;
    let lastTime = 0;
    let exportProgress = 0;
    let exportStatus = "";

    // 計算總長度
    $: maxMain = $mainTrackClips.length > 0 
        ? Math.max(...$mainTrackClips.map(c => c.startOffset + c.duration)) : 0;
    $: maxAudio = $audioTrackClips.length > 0
        ? Math.max(...$audioTrackClips.map(c => c.startOffset + c.duration)) : 0;
    
    $: contentDuration = Math.max(maxMain, maxAudio);
    $: hasClips = contentDuration > 0;
  
    // 監聽導出觸發
    $: if ($startExportTrigger > 0 && !$isExporting && hasClips) {
        fastExportProcess();
    }
  
    // ------------------------------------------------
    // 極速導出流程 (WebCodecs + Chunking)
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
            
            // 1. 偵測最佳音訊編碼
            let audioConfig = { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 };
            let aSupport = await AudioEncoder.isConfigSupported(audioConfig);
            
            if (!aSupport.supported) {
                console.warn("AAC not supported, fallback to Opus");
                audioConfig = { ...audioConfig, codec: 'opus', sampleRate: 48000 };
                aSupport = await AudioEncoder.isConfigSupported(audioConfig);
            }

            // 2. MP4 Muxer
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

            // 4. Audio Encoder & Processing
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

            // 5. Video Processing
            exportStatus = "Rendering Video...";
            const ctx = canvasRef.getContext('2d', { willReadFrequently: true });
            canvasRef.width = width;
            canvasRef.height = height;

            for (let i = 0; i < totalFrames; i++) {
                const timeInSeconds = i / fps;
                const timestampMicros = i * (1_000_000 / fps);
                exportProgress = Math.round((i / totalFrames) * 100);
                await new Promise(r => setTimeout(r, 0));

                const activeClip = $mainTrackClips.find(clip => 
                    timeInSeconds >= clip.startOffset && 
                    timeInSeconds < (clip.startOffset + clip.duration)
                );

                ctx.fillStyle = '#000'; 
                ctx.fillRect(0, 0, width, height);

                if (activeClip) {
                    if (!videoRef.src.includes(activeClip.fileUrl)) {
                        videoRef.src = activeClip.fileUrl;
                        await new Promise(r => videoRef.onloadedmetadata = r);
                    }
                    const seekTime = (timeInSeconds - activeClip.startOffset) + (activeClip.mediaStartOffset || 0);
                    
                    await new Promise((resolve) => {
                        const onSeeked = () => {
                            videoRef.removeEventListener('seeked', onSeeked);
                            resolve();
                        };
                        videoRef.addEventListener('seeked', onSeeked);
                        videoRef.currentTime = seekTime;
                    });

                    const vw = videoRef.videoWidth;
                    const vh = videoRef.videoHeight;
                    const r = Math.min(width / vw, height / vh);
                    const dw = vw * r;
                    const dh = vh * r;
                    ctx.drawImage(videoRef, (width - dw)/2, (height - dh)/2, dw, dh);
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
            a.download = `capcut_edit_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                isExporting.set(false);
                startExportTrigger.set(0);
            }, 1000);

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
                const response = await fetch(clip.fileUrl);
                const arrayBuffer = await response.arrayBuffer();
                const tempCtx = new AudioContext();
                const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
                tempCtx.close(); 
                const source = offlineCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineCtx.destination);
                
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
    
    $: activeClip = $mainTrackClips.find(clip => $currentTime >= clip.startOffset && $currentTime < (clip.startOffset + clip.duration));
    $: activeAudioClip = $audioTrackClips.find(clip => $currentTime >= clip.startOffset && $currentTime < (clip.startOffset + clip.duration));

    // Sync Video
    $: if (videoRef && activeClip && !$isExporting) {
        if (!videoRef.src.includes(activeClip.fileUrl)) videoRef.src = activeClip.fileUrl;
        const seekTime = ($currentTime - activeClip.startOffset) + (activeClip.mediaStartOffset || 0);
        if (Math.abs(videoRef.currentTime - seekTime) > 0.2) videoRef.currentTime = seekTime;
    }

    // Sync Audio
    $: if (audioRef && !$isExporting) {
        if (activeAudioClip) {
            if (!audioRef.src.includes(activeAudioClip.fileUrl)) audioRef.src = activeAudioClip.fileUrl;
            const audioSeekTime = ($currentTime - activeAudioClip.startOffset) + (activeAudioClip.mediaStartOffset || 0);
            if (Math.abs(audioRef.currentTime - audioSeekTime) > 0.2) audioRef.currentTime = audioSeekTime;
            
            if ($isPlaying && audioRef.paused) audioRef.play().catch(() => {});
            if (!$isPlaying && !audioRef.paused) audioRef.pause();
        } else {
            if (!audioRef.paused) audioRef.pause();
        }
    }

    function togglePlay() {
        if (!hasClips || $isExporting) return;
        if (!$isPlaying && $currentTime >= contentDuration) currentTime.set(0);
        isPlaying.update(v => !v);
    }
    
    $: if ($isPlaying && !$isExporting) {
        lastTime = performance.now();
        requestAnimationFrame(loop);
        if (videoRef) videoRef.play().catch(() => {}); 
    } else {
        if (videoRef && !$isExporting) videoRef.pause();
        if (audioRef && !$isExporting) audioRef.pause();
    }
    
    $: if ($isPlaying && hasClips && $currentTime >= contentDuration && !$isExporting) {
        isPlaying.set(false);
        currentTime.set(contentDuration);
    }
    
    function loop(timestamp) {
        if (!$isPlaying || $isExporting) return;
        const deltaTime = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        currentTime.update(t => t + deltaTime);
        requestAnimationFrame(loop);
    }

    // 🔥🔥🔥 新增：拖曳處理 (Drag from Preview) 🔥🔥🔥
    function handleDragStart(e) {
        // 只有當目前有顯示 Clip 時才允許拖曳
        if (!activeClip) { 
            e.preventDefault(); 
            return; 
        }
        
        // 1. 設定 draggedFile store，這樣 Timeline 才能拿到原始檔案 (為了 Auto-save)
        // 注意：我們假設 activeClip.file 存在 (如果它是從左側拖進來或之前 restore 的，應該要有)
        if (activeClip.file) {
            draggedFile.set({ file: activeClip.file });
        }

        // 2. 設定 DataTransfer 資料
        const dragData = JSON.stringify({
            url: activeClip.fileUrl,
            name: activeClip.name,
            type: activeClip.type,
            duration: activeClip.sourceDuration || 5 // 這裡用原始長度
        });
        
        e.dataTransfer.setData('application/json', dragData);
        e.dataTransfer.effectAllowed = 'copy';
    }
</script>

<div class="flex-1 bg-[#101010] relative flex flex-col justify-center items-center overflow-hidden w-full h-full select-none">
    <canvas bind:this={canvasRef} class="hidden"></canvas>
    <audio bind:this={audioRef} class="hidden"></audio>

    <!-- 
        🔥 修改：
        1. 加上 draggable="true"
        2. 加上 on:dragstart={handleDragStart}
        3. 加上 cursor-grab 樣式
    -->
    <div 
        class="relative w-full h-full flex justify-center items-center group cursor-grab active:cursor-grabbing" 
        draggable="true"
        on:dragstart={handleDragStart}
        on:click={togglePlay}
    >
        
        <video 
            bind:this={videoRef} 
            class="max-w-full max-h-full object-contain pointer-events-none {activeClip ? 'block' : 'hidden'}" 
            muted={false} 
            crossorigin="anonymous"
        ></video>
        
        {#if activeClip && !$isExporting}
            <div class="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white z-20 pointer-events-none">Playing: {activeClip.name}</div>
        {/if}
        {#if !activeClip}
            <div class="flex flex-col items-center gap-4 opacity-20 text-white absolute pointer-events-none"><span class="text-sm">{!hasClips ? 'Drag media to start' : 'Black Screen'}</span></div>
        {/if}
        {#if !$isPlaying && hasClips && !$isExporting}
            <div class="absolute z-50 bg-black/50 p-4 rounded-full backdrop-blur-sm pointer-events-none"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
        {/if}
      
        {#if $isExporting}
            <div class="absolute z-50 bg-black/90 px-8 py-6 rounded-xl flex flex-col items-center gap-4 shadow-2xl border border-gray-800">
                <div class="relative w-12 h-12">
                    <div class="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div class="text-center">
                    <div class="text-white font-bold text-lg">{exportStatus}</div>
                    <div class="text-cyan-400 font-mono text-xl mt-1">{exportProgress}%</div>
                </div>
            </div>
        {/if}
    </div>
    <div class={`absolute bottom-8 bg-[#1e1e1e] border border-gray-700 rounded-full px-6 py-2 flex items-center gap-6 text-white z-30 transition-opacity ${!hasClips || $isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <button on:click|stopPropagation={togglePlay} class="hover:text-cyan-400 disabled:cursor-not-allowed" disabled={!hasClips || $isExporting}>
            {#if $isPlaying} ⏸ {:else} ▶ {/if}
        </button>
        <div class="w-[1px] h-4 bg-gray-600"></div>
        <span class="font-mono text-sm w-16 text-center">{$currentTime.toFixed(1)}s</span>
    </div>
</div>