const $ = (s) => document.querySelector(s);
const chatEl = $('#chat');
const inputEl = $('#input');
const formEl = $('#form');
const providerEl = $('#provider');
const modelEl = $('#model');
const maxEl = $('#maxTokens');
const fetchBtn = document.querySelector('#fetchModels');
const modelsList = document.querySelector('#models');

let history = [];

function addMsg(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

async function fetchModels() {
  try {
    const provider = providerEl.value;
    const res = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
    const data = await res.json();
    if (!modelsList) return;
    modelsList.innerHTML = '';
    if (!data.ok) return; // quietly ignore
    for (const id of data.models || []) {
      const opt = document.createElement('option');
      opt.value = id;
      modelsList.appendChild(opt);
    }
  } catch (_) {
    // ignore
  }
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = inputEl.value.trim();
  if (!content) return;
  inputEl.value = '';

  addMsg('user', content);
  history.push({ role: 'user', content: content });

  const thinking = addMsg('assistant', '…thinking');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        provider: providerEl.value,
        model: modelEl.value,
        max_output_tokens: maxEl.value || 'max'
      })
    });
    const data = await res.json();
    if (!data.ok) {
      thinking.textContent = `Error: ${data.error}`;
      return;
    }
    thinking.textContent = data.text || '(no content)';
    history.push({ role: 'assistant', content: data.text });
  } catch (err) {
    thinking.textContent = `Network error: ${err.message}`;
  }
});

// Persist choices in localStorage (tiny UX sugar)
for (const [el, key] of [[providerEl, 'provider'], [modelEl, 'model'], [maxEl, 'max']]) {
  const saved = localStorage.getItem('puppy:' + key);
  if (saved) el.value = saved;
  el.addEventListener('change', () => localStorage.setItem('puppy:' + key, el.value));
}

// Hook up button and auto-fetch on load
fetchBtn && fetchBtn.addEventListener('click', fetchModels);
fetchModels();
