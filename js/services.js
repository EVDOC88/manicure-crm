let servicesCache = [];

async function loadServices() {
  servicesCache = await db.services.toArray();
  await renderServices();
}

async function renderServices() {
  const tbody = document.querySelector('#services-table tbody');
  tbody.innerHTML = '';
  if (!servicesCache.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Услуг пока нет</td></tr>';
    return;
  }
  for (const s of servicesCache) {
    const count = await db.clientServices.where('serviceId').equals(s.id).count();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${Number(s.price || 0).toFixed(2)}</td>
	  <td>${Number(s.duration || 60)}</td>
      <td>${count}</td>
      <td>
        <button class="btn" data-edit="${s.id}">✏️</button>
        <button class="btn danger" data-del="${s.id}">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openServiceModal(Number(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Удалить услугу? Связи с клиентами тоже удалятся.')) return;
    await db.transaction('rw', db.services, db.clientServices, async () => {
      await db.clientServices.where('serviceId').equals(Number(b.dataset.del)).delete();
      await db.services.delete(Number(b.dataset.del));
    });
    await loadServices();
    await makeSnapshot();
  });
}

function openServiceModal(id = null) {
  const item = id ? servicesCache.find(s => s.id === id) : {};
  const form = document.getElementById('modal-form');
  document.getElementById('modal-title').textContent = id ? 'Редактировать услугу' : 'Новая услуга';
  form.innerHTML = `
    <input type="hidden" name="id" value="${item.id || ''}" />
    <label>Название<input name="name" required value="${escapeAttr(item.name)}" /></label>
    <label>Цена<input type="number" step="0.01" name="price" required value="${item.price ?? ''}" /></label>
    <label>Длительность, мин<input type="number" step="5" min="5" name="duration" required value="${item.duration ?? 60}" /></label>
  `;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      name: fd.get('name').trim(),
      price: Number(fd.get('price')),
      duration: Number(fd.get('duration')) || 60
    };
    const editId = fd.get('id');
    if (editId) await db.services.update(Number(editId), data);
    else await db.services.add(data);
    closeModal();
    await loadServices();
    await loadClients();
    await makeSnapshot();
  };
  openModal();
}

function initServices() {
  document.getElementById('add-service-btn').addEventListener('click', () => openServiceModal());
}