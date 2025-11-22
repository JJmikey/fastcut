<script>
    import { currentVideoSource, currentTime, isPlaying } from '../stores/playerStore';
    import { mainTrackClips } from '../stores/timelineStore';
    import { isExporting, startExportTrigger } from '../stores/exportStore';
    import { onMount } from 'svelte';
    
    // 👇 引入 MP4 打包器
    import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
  
    let videoRef;
    let canvasRef;
    let lastTime = 0;
    
    // 導出進度 (0 ~ 100)
    let exportProgress = 0;
  
    $: hasClips = $mainTrackClips.length > 0;
    $: contentDuration = hasClips 
        ? Math.max(...$mainTrackClips.map(c => c.startOffset + c.duration)) 
        : 0;
  
    // ------------------------------------------------
    // 1. 導出監聽
    // ------------------------------------------------
    $: if ($startExportTrigger > 0 && !$isExporting && hasClips) {
        renderVideoProcess();
    }
  
    // ------------------------------------------------
    // 2. 核心：逐幀渲染 (含音訊處理)
    // ------------------------------------------------
    async function renderVideoProcess() {
        try {
            console.log("開始導出 (含音訊)...");
            isExporting.set(true);
            isPlaying.set(false); // 停止 UI 播放
            exportProgress = 0;
  
            const width = 1280;
            const height = 720;
            const fps = 30;
            const durationInSeconds = contentDuration; 
            const totalFrames = Math.ceil(durationInSeconds * fps);
            
            // 預設取樣率 (稍後可能因為 Opus 而改變)
            let targetSampleRate = 44100;

            // ==========================================
            // A. 設定 MP4 Muxer
            // ==========================================
            // 注意：這裡先不設定 audio，等確定編碼格式後再加
            const muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: { codec: 'avc', width, height },
                audio: { codec: 'aac', numberOfChannels: 2, sampleRate: targetSampleRate }, // 預設 AAC
                fastStart: false 
            });
  
            // ==========================================
            // B. 設定 Video Encoder
            // ==========================================
            const videoEncoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (e) => { throw e; }
            });
            const videoConfig = {
                codec: 'avc1.42001f', 
                width, height, bitrate: 5_000_000, framerate: fps
            };
            const vSupport = await VideoEncoder.isConfigSupported(videoConfig);
            if (!vSupport.supported) throw new Error(`不支援視訊編碼: ${videoConfig.codec}`);
            videoEncoder.configure(videoConfig);
  
            // ==========================================
            // C. 設定 Audio Encoder (AAC 優先，Opus 備援)
            // ==========================================
            const audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: (e) => console.error("Audio Encoding Error:", e)
            });
            
            // 1. 優先嘗試 AAC (相容性最好)
            let audioConfig = {
                codec: 'mp4a.40.2', // AAC LC
                sampleRate: 44100,
                numberOfChannels: 2,
                bitrate: 128_000
            };
            
            let aSupport = await AudioEncoder.isConfigSupported(audioConfig);
            
            // 2. 如果不支援 AAC (例如 Linux)，嘗試 Opus
            if (!aSupport.supported) {
                console.warn("不支援 AAC，嘗試切換至 Opus (Linux mode)...");
                audioConfig = {
                    codec: 'opus', 
                    sampleRate: 48000, // Opus 必須是 48kHz
                    numberOfChannels: 2,
                    bitrate: 128_000
                };
                targetSampleRate = 48000; // 更新全域取樣率
                
                // Muxer 需要重新設定 Audio Header 嗎？mp4-muxer 比較寬容，通常不需要重建物件
                // 但我們要確保傳給 Muxer 的 sampleRate 也是對的 (雖然上面已經 new 了)
                
                aSupport = await AudioEncoder.isConfigSupported(audioConfig);
            }

            if (!aSupport.supported) {
                console.error("瀏覽器既不支援 AAC 也不支援 Opus，導出將無聲。");
            } else {
                console.log(`使用音訊編碼: ${audioConfig.codec}, SampleRate: ${targetSampleRate}`);
                audioEncoder.configure(audioConfig);
            }

            // ==========================================
            // D. 處理音訊 (混音 -> 編碼)
            // ==========================================
            // ==========================================
            // D. 處理音訊 (混音 -> 切片 -> 編碼)
            // ==========================================
            if (aSupport.supported) {
                console.log("正在處理音訊混音...");
                
                const mixedAudioBuffer = await mixAllAudio($mainTrackClips, durationInSeconds, targetSampleRate);
                
                const left = mixedAudioBuffer.getChannelData(0);
                const right = mixedAudioBuffer.getChannelData(1);
                const interleavedData = interleave(left, right);
                const totalSamples = mixedAudioBuffer.length;

                // 🔥 重大修正：將音訊切成小塊 (Chunking)
                // 建議每塊約 1 秒 (即 sampleRate 個樣本)，避免編碼器消化不良
                const chunkSize = targetSampleRate; 
                
                for (let i = 0; i < totalSamples; i += chunkSize) {
                    // 1. 計算當前塊的長度 (最後一塊可能不足 1 秒)
                    const length = Math.min(chunkSize, totalSamples - i);
                    
                    // 2. 切割數據 (注意：Interleaved 數據是 L,R,L,R... 所以長度要 * 2)
                    const chunkData = interleavedData.slice(i * 2, (i + length) * 2);

                    // 3. 計算時間戳 (微秒)
                    const timestamp = (i / targetSampleRate) * 1_000_000;

                    // 4. 建立 AudioData
                    const audioData = new AudioData({
                        format: 'f32', 
                        sampleRate: targetSampleRate,
                        numberOfFrames: length, // 這一塊有多少幀
                        numberOfChannels: 2,
                        timestamp: timestamp,   // 這一塊的時間點
                        data: chunkData
                    });

                    // 5. 編碼這一塊
                    audioEncoder.encode(audioData);
                    audioData.close(); // 釋放記憶體
                }
                
                // 等待所有小塊編碼完成
                await audioEncoder.flush();
                console.log("音訊處理完成！");
            }

            // ==========================================
            // E. 處理影像 (逐幀繪製)
            // ==========================================
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
                        await new Promise((resolve, reject) => {
                            videoRef.onloadedmetadata = resolve;
                            videoRef.onerror = reject;
                        });
                    }

                    const seekTime = timeInSeconds - activeClip.startOffset;

                    await new Promise((resolve, reject) => {
                        const onSeeked = () => {
                            videoRef.removeEventListener('seeked', onSeeked);
                            videoRef.removeEventListener('error', onError);
                            resolve();
                        };
                        const onError = (e) => {
                            videoRef.removeEventListener('seeked', onSeeked);
                            videoRef.removeEventListener('error', onError);
                            reject(new Error("Video Seek Failed"));
                        };
                        videoRef.addEventListener('seeked', onSeeked);
                        videoRef.addEventListener('error', onError);
                        videoRef.currentTime = seekTime;
                    });

                    // 畫面比例修正 (Object Fit: Contain)
                    const vw = videoRef.videoWidth;
                    const vh = videoRef.videoHeight;
                    const videoRatio = vw / vh;
                    const canvasRatio = width / height;
                    let drawW, drawH;
                    if (videoRatio > canvasRatio) {
                        drawW = width;
                        drawH = width / videoRatio;
                    } else {
                        drawH = height;
                        drawW = height * videoRatio;
                    }
                    const offsetX = (width - drawW) / 2;
                    const offsetY = (height - drawH) / 2;
                    ctx.drawImage(videoRef, offsetX, offsetY, drawW, drawH);
                }

                const frame = new VideoFrame(canvasRef, { timestamp: timestampMicros });
                const keyFrame = i % (fps * 2) === 0; 
                videoEncoder.encode(frame, { keyFrame });
                frame.close();
            }

            // ==========================================
            // F. 結束與下載
            // ==========================================
            await videoEncoder.flush();
            muxer.finalize();

            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `capcut_export_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                isExporting.set(false);
                startExportTrigger.set(0);
            }, 1000);

        } catch (err) {
            console.error("Export Error:", err);
            alert(`Export Failed: ${err.message}`);
            isExporting.set(false);
            startExportTrigger.set(0);
        }
    }
  
  
    // ------------------------------------------------
    // 3. UI 播放邏輯 (Preview Mode)
    // ------------------------------------------------
    
    $: activeClip = $mainTrackClips.find(clip => 
        $currentTime >= clip.startOffset && 
        $currentTime < (clip.startOffset + clip.duration)
    );
  
    $: if (videoRef && activeClip && !$isExporting) {
        if (!videoRef.src.includes(activeClip.fileUrl)) {
            videoRef.src = activeClip.fileUrl;
        }
        const seekTime = $currentTime - activeClip.startOffset;
        if (Math.abs(videoRef.currentTime - seekTime) > 0.2) {
            videoRef.currentTime = seekTime;
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
  
    function handleDragStart(e) { if (!activeClip) e.preventDefault(); }

    // ------------------------------------------------
    // 4. 音訊處理工具函數 (Audio Helpers)
    // ------------------------------------------------

    async function mixAllAudio(clips, totalDuration, targetSampleRate = 44100) {
        const sampleRate = targetSampleRate; 
        
        // OfflineAudioContext 用於快速渲染聲音
        const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

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
                source.start(clip.startOffset);
                
                if (clip.duration < audioBuffer.duration) {
                    source.stop(clip.startOffset + clip.duration);
                }
            } catch (e) {
                console.warn(`無法處理音訊: ${clip.name}`, e);
            }
        });

        await Promise.all(promises);
        const renderedBuffer = await offlineCtx.startRendering();
        return renderedBuffer;
    }

    function interleave(inputL, inputR) {
        const length = inputL.length + inputR.length;
        const result = new Float32Array(length);

        let index = 0;
        let inputIndex = 0;

        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }
</script>

<div class="flex-1 bg-[#101010] relative flex flex-col justify-center items-center overflow-hidden w-full h-full select-none">
  
    <canvas bind:this={canvasRef} class="hidden"></canvas>

    <div class="relative w-full h-full flex justify-center items-center group" on:click={togglePlay}>
      
        <video 
            bind:this={videoRef}
            class="max-w-full max-h-full object-contain pointer-events-none {activeClip ? 'block' : 'hidden'}" 
            muted={false}
            crossorigin="anonymous"
        ></video>
        
        {#if activeClip && !$isExporting}
            <div class="absolute top-4 left-4 bg-black/50 px-2 py-1 rounded text-xs text-white z-20">Playing: {activeClip.name}</div>
        {/if}

        {#if !activeClip}
            <div class="flex flex-col items-center gap-4 opacity-20 text-white absolute">
                <span class="text-sm">{!hasClips ? 'Drag media to start' : 'Black Screen'}</span>
            </div>
        {/if}

        {#if !$isPlaying && hasClips && !$isExporting}
            <div class="absolute z-50 bg-black/50 p-4 rounded-full backdrop-blur-sm pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
        {/if}
      
        {#if $isExporting}
            <div class="absolute z-50 bg-black/90 px-8 py-6 rounded-xl flex flex-col items-center gap-4 shadow-2xl border border-gray-800">
                <div class="relative w-12 h-12">
                    <div class="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div class="text-center">
                    <div class="text-white font-bold text-lg">Exporting MP4...</div>
                    <div class="text-cyan-400 font-mono text-xl mt-1">{exportProgress}%</div>
                </div>
                <div class="text-xs text-gray-500">Do not close this tab</div>
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