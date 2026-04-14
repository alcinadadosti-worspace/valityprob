(function(){
  const form = document.getElementById('productForm');
  const resp = document.getElementById('resp');
  const resetBtn = document.getElementById('resetBtn');
  const submitBtn = document.getElementById('submitBtn');
  const skuInput = document.getElementById('sku');
  const nomeInput = document.getElementById('nome');

  if (!form) return;

  // Inicializa o container de toasts
  initToastContainer();

  // Adiciona wrapper de loading ao campo SKU
  wrapInputWithSpinner(skuInput);

  // Busca automática do nome ao sair do campo SKU
  let searchTimeout = null;
  skuInput.addEventListener('blur', async () => {
    const sku = skuInput.value.trim();
    if (!sku) return;

    const wrapper = skuInput.closest('.input-wrapper');

    try {
      // Mostra loading
      if (wrapper) wrapper.classList.add('loading');

      const res = await fetch(`/api/catalog/${encodeURIComponent(sku)}`);
      const data = await res.json();

      // Pequeno delay para UX (mínimo 300ms de loading visível)
      await new Promise(r => setTimeout(r, 300));

      if (data.found) {
        nomeInput.value = data.nome;
        nomeInput.classList.add('auto-filled');
        nomeInput.classList.remove('new-product');
        showToast('Produto encontrado no catálogo!', 'success');
      } else {
        nomeInput.value = '';
        nomeInput.classList.remove('auto-filled');
        nomeInput.classList.add('new-product');
        nomeInput.placeholder = 'Produto novo - digite o nome';
        nomeInput.focus();
        showToast('Produto novo! Digite o nome para cadastrar.', 'warning');
      }
    } catch (err) {
      console.error('Erro ao buscar catálogo:', err);
      showToast('Erro ao buscar produto no catálogo.', 'error');
    } finally {
      // Remove loading
      if (wrapper) wrapper.classList.remove('loading');
    }
  });

  // Remove estilo de auto-preenchido ao editar manualmente
  nomeInput.addEventListener('input', () => {
    nomeInput.classList.remove('auto-filled');
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    resp.innerHTML = '';
    resp.className = '';
    nomeInput.classList.remove('auto-filled');
    nomeInput.classList.remove('new-product');
    nomeInput.placeholder = 'Ex: Batom Vermelho';
  });

  function setLoading(loading){
    if (loading){
      submitBtn.classList.add('btn--loading');
      submitBtn.disabled = true;
      // add spinner
      if (!submitBtn.querySelector('.btn-spinner')){
        const s = document.createElement('span');
        s.className = 'btn-spinner';
        s.setAttribute('aria-hidden','true');
        submitBtn.prepend(s);
      }
    } else {
      submitBtn.classList.remove('btn--loading');
      submitBtn.disabled = false;
      const s = submitBtn.querySelector('.btn-spinner');
      if (s) s.remove();
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resp.innerHTML = '';
    resp.className = '';

    // simple client-side validation
    const data = new FormData(form);
    const validade = data.get('validade') || '';
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(validade)){
      resp.textContent = 'Use o formato de data YYYY-MM-DD.';
      resp.className = 'message message--error mt-4';
      return;
    }

    try {
      setLoading(true);
      clearErrors();
      // Convert FormData to URLSearchParams so express.urlencoded can parse it
      const params = new URLSearchParams();
      for (const pair of data.entries()) params.append(pair[0], pair[1]);
      const res = await fetch('/add', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: params.toString()
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        showToast((json && json.message) ? json.message : 'Produto cadastrado com sucesso!', 'success');
        resp.textContent = (json && json.message) ? json.message : 'Produto cadastrado com sucesso!';
        resp.className = 'message message--success mt-4';
        form.reset();
        nomeInput.classList.remove('auto-filled', 'new-product');
        nomeInput.placeholder = 'Ex: Batom Vermelho';
      } else {
        const msg = (json && json.message) ? json.message : 'Erro ao cadastrar';
        resp.textContent = msg;
        resp.className = 'message message--error mt-4';
        showToast(msg, 'error');
        markErrors();
      }
    } catch (err) {
      resp.textContent = 'Falha de rede. Tente novamente.';
      resp.className = 'message message--error mt-4';
      showToast('Falha de rede. Tente novamente.', 'error');
    } finally {
      setTimeout(() => setLoading(false), 300); // small delay for UX
    }
  });

  // Inicializa container de toasts
  function initToastContainer() {
    if (!document.querySelector('.toast-container')) {
      const container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }

  // Adiciona wrapper com spinner ao input
  function wrapInputWithSpinner(input) {
    if (!input || input.closest('.input-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';

    const spinner = document.createElement('div');
    spinner.className = 'input-spinner';
    spinner.setAttribute('aria-hidden', 'true');

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(spinner);
  }

  // Sistema de toasts melhorado
  function showToast(text, type = 'info') {
    const container = document.querySelector('.toast-container');
    if (!container) {
      initToastContainer();
      return showToast(text, type);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const content = document.createElement('span');
    content.className = 'toast-content';
    content.textContent = text;

    const progress = document.createElement('div');
    progress.className = 'toast-progress';

    toast.appendChild(content);
    toast.appendChild(progress);
    container.appendChild(toast);

    // Anima entrada
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Remove após 3.5s
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3500);

    // Permite fechar clicando
    toast.addEventListener('click', () => {
      toast.classList.remove('show');
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    });
  }

  function markErrors(){
    ['sku','nome','validade'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.classList.add('input-error');
    });
  }

  function clearErrors(){
    ['sku','nome','validade'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('input-error');
    });
  }
})();

// ===== IMPORTAÇÃO POR PLANILHA =====
(function(){
  const planilhaInput = document.getElementById('planilhaInput');
  const uploadArea    = document.getElementById('uploadArea');
  const uploadFileName= document.getElementById('uploadFileName');
  const loading       = document.getElementById('planilhaLoading');
  const errorDiv      = document.getElementById('planilhaError');
  const preview       = document.getElementById('planilhaPreview');
  const previewCount  = document.getElementById('previewCount');
  const tbody         = document.getElementById('previewTableBody');
  const clearBtn      = document.getElementById('planilhaClearBtn');
  const saveBtn       = document.getElementById('planilhaSaveBtn');
  const loteResp      = document.getElementById('loteResp');

  if (!planilhaInput) return; // página sem o painel de planilha

  // Drag & drop
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  planilhaInput.addEventListener('change', () => {
    if (planilhaInput.files[0]) handleFile(planilhaInput.files[0]);
  });

  clearBtn.addEventListener('click', resetPreview);

  async function handleFile(file) {
    // Validação básica
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      showError('Formato inválido. Envie um arquivo .xlsx ou .xls.');
      return;
    }

    // Mostra nome do arquivo
    uploadFileName.textContent = file.name;
    uploadFileName.style.display = 'block';

    // Mostra loading, esconde preview e erro
    setLoading(true);
    hideError();
    resetPreview(false);

    try {
      const formData = new FormData();
      formData.append('planilha', file);

      const res = await fetch('/upload-planilha', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.message || 'Erro ao processar planilha.');
        return;
      }

      renderPreview(data.items);
    } catch (err) {
      showError('Falha de rede ao enviar planilha.');
    } finally {
      setLoading(false);
    }
  }

  function renderPreview(items) {
    tbody.innerHTML = '';
    const newCount = items.filter(i => !i.inCatalog).length;
    const foundCount = items.filter(i => i.inCatalog).length;

    let countText = `${items.length} item(s) encontrado(s)`;
    if (foundCount) countText += ` · ${foundCount} no catálogo`;
    if (newCount) countText += ` · ${newCount} novo(s) — preencha o nome`;
    previewCount.textContent = countText;

    items.forEach((item, idx) => {
      const tr = document.createElement('tr');

      // Formata data YYYY-MM-DD → DD/MM/YYYY para exibição
      const [y, m, d] = item.validade.split('-');
      const displayDate = `${d}/${m}/${y}`;

      const nomeCellContent = item.inCatalog
        ? `<span class="preview-nome-text">${escapeHtml(item.nome)}</span>`
        : `<input
             class="preview-nome-input"
             type="text"
             placeholder="Digite o nome do produto"
             data-idx="${idx}"
             aria-label="Nome do produto SKU ${item.sku}"
           >`;

      const badge = item.inCatalog
        ? `<span class="badge badge--found">Catálogo</span>`
        : `<span class="badge badge--new">Novo</span>`;

      tr.innerHTML = `
        <td style="font-size:13px;font-weight:500">${escapeHtml(item.sku)}</td>
        <td>${nomeCellContent}</td>
        <td style="font-size:13px">${displayDate}</td>
        <td>${badge}</td>
      `;
      tbody.appendChild(tr);
    });

    // Guarda os itens no dataset do botão para usar no save
    saveBtn.dataset.items = JSON.stringify(items);
    preview.style.display = 'block';
  }

  saveBtn.addEventListener('click', async () => {
    const items = JSON.parse(saveBtn.dataset.items || '[]');
    if (!items.length) return;

    // Coleta nomes preenchidos para itens novos
    const inputs = tbody.querySelectorAll('.preview-nome-input');
    let hasError = false;

    inputs.forEach(input => {
      const idx = parseInt(input.dataset.idx, 10);
      const nome = input.value.trim();
      input.classList.remove('input-error');
      if (!nome) {
        input.classList.add('input-error');
        hasError = true;
      } else {
        items[idx].nome = nome;
      }
    });

    if (hasError) {
      loteResp.textContent = 'Preencha o nome de todos os produtos novos antes de salvar.';
      loteResp.className = 'message message--error mt-4';
      return;
    }

    // Botão loading
    saveBtn.disabled = true;
    const originalHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="btn-spinner"></span> Salvando...';
    loteResp.innerHTML = '';
    loteResp.className = '';

    try {
      const res = await fetch('/add-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();

      if (data.ok) {
        let msg = `${data.success} item(s) cadastrado(s) com sucesso!`;
        if (data.errors && data.errors.length) {
          msg += ` · ${data.errors.length} erro(s): ${data.errors.join('; ')}`;
          loteResp.className = 'message message--warning mt-4';
        } else {
          loteResp.className = 'message message--success mt-4';
        }
        loteResp.textContent = msg;
        showToast(msg, data.errors && data.errors.length ? 'warning' : 'success');
        // Limpa o preview após sucesso total
        if (!data.errors || !data.errors.length) {
          setTimeout(() => resetPreview(true), 1200);
        }
      } else {
        loteResp.textContent = data.message || 'Erro ao salvar.';
        loteResp.className = 'message message--error mt-4';
        showToast(data.message || 'Erro ao salvar.', 'error');
      }
    } catch (err) {
      loteResp.textContent = 'Falha de rede. Tente novamente.';
      loteResp.className = 'message message--error mt-4';
      showToast('Falha de rede.', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  });

  function resetPreview(clearFile = true) {
    preview.style.display = 'none';
    tbody.innerHTML = '';
    loteResp.innerHTML = '';
    loteResp.className = '';
    saveBtn.dataset.items = '[]';
    if (clearFile) {
      planilhaInput.value = '';
      uploadFileName.style.display = 'none';
      uploadFileName.textContent = '';
    }
  }

  function setLoading(on) {
    loading.style.display = on ? 'block' : 'none';
  }

  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
  }

  function hideError() {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Reutiliza o showToast do escopo pai se disponível
  function showToast(text, type) {
    const container = document.querySelector('.toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    const content = document.createElement('span');
    content.className = 'toast-content';
    content.textContent = text;
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    toast.appendChild(content);
    toast.appendChild(progress);
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
    toast.addEventListener('click', () => {
      toast.classList.remove('show');
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    });
  }
})();