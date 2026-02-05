(function(){
  const form = document.getElementById('productForm');
  const resp = document.getElementById('resp');
  const resetBtn = document.getElementById('resetBtn');

  if (!form) return;

  resetBtn.addEventListener('click', () => { form.reset(); resp.innerHTML = ''; resp.className = ''; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resp.innerHTML = '';
    resp.className = '';

    const data = new FormData(form);
    try {
      const res = await fetch('/add', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: data
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        resp.textContent = (json && json.message) ? json.message : 'Produto cadastrado com sucesso!';
        resp.className = 'message success';
        form.reset();
      } else {
        const msg = (json && json.message) ? json.message : 'Erro ao cadastrar';
        resp.textContent = msg;
        resp.className = 'message error';
      }
    } catch (err) {
      resp.textContent = 'Falha de rede. Tente novamente.';
      resp.className = 'message error';
    }
  });
})();