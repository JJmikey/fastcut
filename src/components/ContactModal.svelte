<script>
    import { fade, scale } from 'svelte/transition';
  
    // 🔥 新增：讓外部可以傳入自定義的 class，預設是 Privacy Page 用的藍色底線樣式
    export let triggerClass = "text-blue-400 hover:text-blue-300 underline underline-offset-4 cursor-pointer font-medium transition-colors bg-transparent border-0 p-0 inline";
    
    let isOpen = false;
    let isSending = false;
    let isSent = false;
    let contact = "";
    let message = "";
  
    function openModal(e) {
      e.preventDefault();
      isOpen = true;
    }
  
    function closeModal() {
      if (!isSending) isOpen = false;
    }
  
    async function handleSubmit() {
      if (!message.trim()) return;
      isSending = true;
  
      try {
        const res = await fetch('/api/discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'feedback', contact, message })
        });
  
        if (res.ok) {
          isSent = true;
          setTimeout(() => {
            isOpen = false;
            setTimeout(() => { isSent = false; message = ""; contact = ""; }, 500);
          }, 2000);
        } else {
          alert("Failed to send message.");
        }
      } catch (err) {
        console.error(err);
      } finally {
        isSending = false;
      }
    }
  </script>
  
  <!-- 🔥 修改：使用傳入的 class，並使用 slot 讓外部決定顯示什麼文字 -->
  <button on:click={openModal} class={triggerClass}>
    <slot>here</slot> 
  </button>
  
  <!-- 下面的 Modal 部分完全不用動，保持原樣即可 -->
  {#if isOpen}
    <div class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" transition:fade={{ duration: 200 }} on:click|self={closeModal}>
      <div class="bg-[#0f172a] border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative" transition:scale={{ duration: 200, start: 0.95 }}>
        <button on:click={closeModal} class="absolute top-4 right-4 text-slate-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
        <div class="p-6 sm:p-8">
          {#if !isSent}
            <h3 class="text-2xl font-bold text-white mb-2">Contact Us</h3>
            <p class="text-slate-400 text-sm mb-6">Found a bug or have a privacy concern? Send it directly to our dev team.</p>
            <form on:submit|preventDefault={handleSubmit} class="space-y-4">
              <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Your Email (Optional)</label><input bind:value={contact} type="text" placeholder="name@example.com" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"/></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">Message</label><textarea bind:value={message} required rows="4" placeholder="How can we help you?" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all resize-none"></textarea></div>
              <button type="submit" disabled={isSending} class="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                {#if isSending}<span>Sending...</span>{:else}Send Message 🚀{/if}
              </button>
            </form>
          {:else}
            <div class="py-8 text-center"><div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg></div><h3 class="text-xl font-bold text-white mb-2">Message Sent!</h3><p class="text-slate-400">Thanks for your feedback.</p></div>
          {/if}
        </div>
      </div>
    </div>
  {/if}