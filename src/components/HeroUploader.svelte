<script>
    import { setPendingFile } from '../utils/fileBridge';

    let fileInput;
    let isHovering = false;
    let isProcessing = false;

    function onDragOver(e) {
        e.preventDefault();
        isHovering = true;
    }

    function onDragLeave() {
        isHovering = false;
    }

    async function handleFiles(files) {
        if (files.length === 0) return;
        isProcessing = true;

        try {
            // 只取第一個檔案
            const file = files[0];
            
            // 1. 存入 IndexedDB
            await setPendingFile(file);
            
            // 2. 跳轉到編輯器
            window.location.href = '/editor';
        } catch (err) {
            console.error(err);
            alert("Error uploading file");
            isProcessing = false;
        }
    }

    function onDrop(e) {
        e.preventDefault();
        isHovering = false;
        handleFiles(e.dataTransfer.files);
    }

    function onChange(e) {
        handleFiles(e.target.files);
    }
</script>

<div 
    class="w-full max-w-2xl mx-auto mt-8"
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:drop={onDrop}
    role="button"
    tabindex="0"
>
    <label 
        class="relative flex flex-col items-center justify-center w-full h-64 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden group
        {isHovering ? 'border-cyan-400 bg-cyan-900/20 scale-[1.02]' : 'border-slate-600 bg-slate-900/50 hover:border-slate-400 hover:bg-slate-800/80'}"
    >
        {#if isProcessing}
            <div class="flex flex-col items-center animate-pulse">
                <div class="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-xl font-bold text-white">Loading Editor...</p>
            </div>
        {:else}
            <div class="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <!-- Icon -->
                <div class="mb-4 p-4 bg-slate-800 rounded-full group-hover:bg-slate-700 transition-colors shadow-lg">
                    <svg class="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                </div>
                
                <p class="mb-2 text-xl font-bold text-white">
                    Drag & Drop Video Here
                </p>
                <p class="text-sm text-slate-400">
                    or click to browse (MP4, MOV, WebM, MKV)
                </p>
                
                <div class="mt-6 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-cyan-500/20">
                    Select File
                </div>
            </div>
        {/if}
        <input 
            bind:this={fileInput}
            type="file" 
            class="hidden" 
            accept="video/*,audio/*,image/*,.mkv,.mov"
            on:change={onChange} 
        />
    </label>
</div>