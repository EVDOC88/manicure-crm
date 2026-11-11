let clientsCache = [];

async function loadClients() {
  clientsCache = await db.clients.toArray();
  await renderClients();
}

async function renderClients() {
  const tbody = document.querySelector('#clients-table tbody');
  tbody.innerHTML = '';
  if (!clientsCache.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Клиентов пока нет</td></tr>';
    return;
  }
  for (const c of clientsCache) {
    const links = await db.clientServices.where('clientId').equals(c.id).toArray();
    const serviceNames = links
      .map(l => servicesCache.find(s => s.id === l.serviceId)?.name)
      .filter(Boolean)
      .join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>${escapeHtml(c.email || '')}</td>
      <td>${escapeHtml(serviceNames || '—')}</td>
      <td>${escapeHtml(c.notes || '')}</td>
      <td>
        <button class="btn" data-edit="${c.id}">✏️</button>
        <button class="btn danger" data-del="${c.id}">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openClientModal(Number(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Удалить клиента? Связи с услугами тоже удалятся.')) return;
    await db.transaction('rw', db.clients, db.clientServices, async () => {
      await db.clientServices.where('clientId').equals(Number(b.dataset.del)).delete();
      await db.clients.delete(Number(b.dataset.del));
    });
    await loadClients();
    await makeSnapshot();
  });
}

async function openClientModal(id = null) {
  const client = id ? clientsCache.find(c => c.id === id) : {};
  let linkedServiceIds = [];
  if (id) {
    const links = await db.clientServices.where('clientId').equals(id).toArray();
    linkedServiceIds = links.map(l => l.serviceId);
  }
  const form = document.getElementById('modal-form');
  document.getElementById('modal-title').textContent = id ? 'Редактировать клиента' : 'Новый клиент';

  const servicesHtml = servicesCache.length
    ? servicesCache.map(s => `
        <label class="checkbox-row">
          <input type="checkbox" name="services" value="${s.id}" ${linkedServiceIds.includes(s.id) ? 'checked' : ''} />
          ${escapeHtml(s.name)} (${Number(s.price || 0).toFixed(0)})
        </label>`).join('')
    : '<p class="muted">Сначала добавьте услуги на вкладке «Услуги»</p>';

  // Проверяем поддержку Contact Picker API
  const canPickContact = 'contacts' in navigator && 'ContactsManager' in window;
  const pickButtonHtml = canPickContact
    ? '<button type="button" id="pick-contact-btn" class="btn" style="margin-bottom: 8px;">📇 Выбрать из контактов</button>'
    : '';

  form.innerHTML = `
    <input type="hidden" name="id" value="${client.id || ''}" />
    ${pickButtonHtml}
    <label>Имя<input name="name" required value="${escapeAttr(client.name)}" /></label>
    <label>Телефон<input name="phone" value="${escapeAttr(client.phone)}" /></label>
    <label>Email<input name="email" type="email" value="${escapeAttr(client.email)}" /></label>
    <label>Заметки<textarea name="notes">${escapeHtml(client.notes || '')}</textarea></label>
    <fieldset>
      <legend>Услуги клиента</legend>
      ${servicesHtml}
    </fieldset>
  `;

  // Логика кнопки выбора контакта
  if (canPickContact) {
    const pickBtn = document.getElementById('pick-contact-btn');
    pickBtn.addEventListener('click', async () => {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const [contact] = await navigator.contacts.select(props, opts);
        
        if (contact) {
          // Заполняем поля, если данные есть
          const nameInput = form.querySelector('input[name="name"]');
          const phoneInput = form.querySelector('input[name="phone"]');
          
          if (contact.name && contact.name.length > 0) {
            nameInput.value = contact.name[0];
          }
          if (contact.tel && contact.tel.length > 0) {
            phoneInput.value = contact.tel[0];
          }
        }
      } catch (err) {
        // Пользователь отменил выбор или произошла ошибка — ничего не делаем
        console.log('Contact picker cancelled or failed:', err.name);
      }
    });
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      name: fd.get('name').trim(),
      phone: fd.get('phone').trim(),
      email: fd.get('email').trim(),
      notes: fd.get('notes').trim()
    };
    const editId = fd.get('id');
    let clientId = editId ? Number(editId) : null;

    await db.transaction('rw', db.clients, db.clientServices, async () => {
      if (clientId) {
        await db.clients.update(clientId, data);
      } else {
        clientId = await db.clients.add(data);
      }
      await db.clientServices.where('clientId').equals(clientId).delete();
      const selected = fd.getAll('services').map(Number);
      for (const sid of selected) {
        await db.clientServices.add({ clientId, serviceId: sid });
      }
    });

    closeModal();
    await loadClients();
    await loadServices();
    await makeSnapshot();
  };
  openModal();
}

function initClients() {
  document.getElementById('add-client-btn').addEventListener('click', () => openClientModal());
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
function escapeAttr(s) { return escapeHtml(s); }