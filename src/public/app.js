(function(){
  const form = document.getElementById('productForm');
  const resp = document.getElementById('resp');
  const resetBtn = document.getElementById('resetBtn');
  const submitBtn = document.getElementById('submitBtn');
  const skuInput = document.getElementById('sku');
  const nomeInput = document.getElementById('nome');

  if (!form) return;

  // Busca automática do nome ao sair do campo SKU
  let searchTimeout = null;
  skuInput.addEventListener('blur', async () => {
    const sku = skuInput.value.trim();
    if (!sku) return;

    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(sku)}`);
      const data = await res.json();
      if (data.found) {
        nomeInput.value = data.nome;
        nomeInput.classList.add('auto-filled');
        nomeInput.classList.remove('new-product');
        showToast('Produto encontrado no catálogo!');
      } else {
        nomeInput.value = '';
        nomeInput.classList.remove('auto-filled');
        nomeInput.classList.add('new-product');
        nomeInput.placeholder = 'Produto novo - digite o nome';
        nomeInput.focus();
        showToast('Produto novo! Digite o nome para cadastrar.');
      }
    } catch (err) {
      console.error('Erro ao buscar catálogo:', err);
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
        showToast((json && json.message) ? json.message : 'Produto cadastrado com sucesso!');
        resp.textContent = (json && json.message) ? json.message : 'Produto cadastrado com sucesso!';
        resp.className = 'message message--success mt-4';
        form.reset();
        nomeInput.classList.remove('auto-filled', 'new-product');
        nomeInput.placeholder = 'Ex: Batom Vermelho';
      } else {
        const msg = (json && json.message) ? json.message : 'Erro ao cadastrar';
        resp.textContent = msg;
        resp.className = 'message message--error mt-4';
        markErrors();
      }
    } catch (err) {
      resp.textContent = 'Falha de rede. Tente novamente.';
      resp.className = 'message message--error mt-4';
      showToast('Falha de rede. Tente novamente.');
    } finally {
      setTimeout(() => setLoading(false), 300); // small delay for UX
    }
  });

  function showToast(text){
    let t = document.querySelector('.toast');
    if (!t){
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{ t.classList.remove('show'); }, 3500);
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