(function(){
  const form = document.getElementById('productForm');
  const resp = document.getElementById('resp');
  const resetBtn = document.getElementById('resetBtn');
  const submitBtn = document.getElementById('submitBtn');

  if (!form) return;

  resetBtn.addEventListener('click', () => { form.reset(); resp.innerHTML = ''; resp.className = ''; });

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
      resp.className = 'message error';
      return;
    }

    try {
      setLoading(true);
      clearErrors();
      const res = await fetch('/add', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: data
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        showToast((json && json.message) ? json.message : 'Produto cadastrado com sucesso!');
        resp.textContent = (json && json.message) ? json.message : 'Produto cadastrado com sucesso!';
        resp.className = 'message success';
        form.reset();
      } else {
        const msg = (json && json.message) ? json.message : 'Erro ao cadastrar';
        resp.textContent = msg;
        resp.className = 'message error';
        markErrors();
      }
    } catch (err) {
      resp.textContent = 'Falha de rede. Tente novamente.';
      resp.className = 'message error';
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
    ['sku','nome','validade','managerId'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.classList.add('input-error');
    });
  }

  function clearErrors(){
    ['sku','nome','validade','managerId'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('input-error');
    });
  }
})();