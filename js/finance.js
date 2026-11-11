let incomesCache = [];
let expensesCache = [];

async function loadFinance() {
  incomesCache = await db.incomes.toArray();
  expensesCache = await db.expenses.toArray();
  await renderIncomes();
  await renderExpenses();
}

async function renderIncomes() {
  const tbody = document.querySelector('#incomes-table tbody');
  tbody.innerHTML = '';
  if (!incomesCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Доходов пока нет</td></tr>';
    return;
  }
  incomesCache.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const i of incomesCache) {
    const client = clientsCache.find(c => c.id === i.clientId);
    const service = servicesCache.find(s => s.id === i.serviceId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(i.date)}</td>
      <td>${escapeHtml(client?.name || '—')}</td>
      <td>${escapeHtml(service?.name || '—')}</td>
      <td>${Number(i.amount || 0).toFixed(2)}</td>
      <td>
        <button class="btn" data-edit="${i.id}">✏️</button>
        <button class="btn danger" data-del="${i.id}">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openIncomeModal(Number(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Удалить доход?')) {
      await db.incomes.delete(Number(b.dataset.del));
      await loadFinance();
      await refreshCalendar();
      await makeSnapshot();
    }
  });
}

async function renderExpenses() {
  const tbody = document.querySelector('#expenses-table tbody');
  tbody.innerHTML = '';
  if (!expensesCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Расходов пока нет</td></tr>';
    return;
  }
  expensesCache.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const e of expensesCache) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.category || '')}</td>
      <td>${Number(e.amount || 0).toFixed(2)}</td>
      <td>${escapeHtml(e.comment || '')}</td>
      <td>
        <button class="btn" data-edit="${e.id}">✏️</button>
        <button class="btn danger" data-del="${e.id}">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openExpenseModal(Number(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Удалить расход?')) {
      await db.expenses.delete(Number(b.dataset.del));
      await loadFinance();
      await makeSnapshot();
    }
  });
}

async function openIncomeModal(id = null) {
  const item = id ? incomesCache.find(x => x.id === id) : { date: todayISO(), time: '10:00' };
  const form = document.getElementById('modal-form');
  document.getElementById('modal-title').textContent = id ? 'Редактировать доход' : 'Новый доход';

  const canPickContact = 'contacts' in navigator && 'ContactsManager' in window;

  const clientsOptions = clientsCache.map(c =>
    `<option value="${c.id}" ${item.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}${c.phone ? ' — ' + escapeHtml(c.phone) : ''}</option>`
  ).join('');
  const servicesOptions = servicesCache.map(s =>
    `<option value="${s.id}" data-price="${s.price || 0}" data-duration="${s.duration || 60}" ${item.serviceId === s.id ? 'selected' : ''}>${escapeHtml(s.name)} (${s.duration || 60} мин)</option>`
  ).join('');

  const pickButtonHtml = canPickContact
    ? '<button type="button" id="pick-contact-income-btn" class="btn" style="margin-bottom: 8px;">📇 Выбрать клиента из контактов</button>'
    : '';

  form.innerHTML = `
    <input type="hidden" name="id" value="${item.id || ''}" />
    <label>Дата<input type="date" name="date" required value="${item.date || todayISO()}" /></label>
    <label>Время<input type="time" name="time" required value="${item.time || '10:00'}" /></label>
    <label>Окончание (расчёт)<input type="text" name="endTime" readonly value="" /></label>
    ${pickButtonHtml}
    <label>Клиент
      <select name="clientId" required>
        <option value="">— выберите —</option>
        ${clientsOptions}
      </select>
    </label>
    <label>Услуга
      <select name="serviceId" required>
        <option value="">— выберите —</option>
        ${servicesOptions}
      </select>
    </label>
    <label>Сумма<input type="number" step="0.01" name="amount" required value="${item.amount ?? ''}" /></label>
  `;

  const clientSelect = form.querySelector('select[name="clientId"]');
  const serviceSelect = form.querySelector('select[name="serviceId"]');
  const amountInput = form.querySelector('input[name="amount"]');
  const timeInput = form.querySelector('input[name="time"]');
  const endInput = form.querySelector('input[name="endTime"]');

  function updateEndTime() {
    const opt = serviceSelect.selectedOptions[0];
    const duration = opt && opt.dataset.duration ? Number(opt.dataset.duration) : 60;
    const t = timeInput.value || '10:00';
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m + duration;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    endInput.value = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }

  serviceSelect.addEventListener('change', () => {
    const opt = serviceSelect.selectedOptions[0];
    if (opt && opt.dataset.price !== undefined) {
      amountInput.value = Number(opt.dataset.price).toFixed(2);
    }
    updateEndTime();
  });
  timeInput.addEventListener('change', updateEndTime);
  updateEndTime(); // при открытии

  // Выбор клиента из контактов — без изменений
  if (canPickContact) {
    const pickBtn = document.getElementById('pick-contact-income-btn');
    pickBtn.addEventListener('click', async () => {
      try {
        const [contact] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!contact) return;
        const name = contact.name && contact.name[0] ? contact.name[0].trim() : '';
        const phone = contact.tel && contact.tel[0] ? contact.tel[0].trim() : '';
        if (!name && !phone) { alert('В выбранном контакте нет имени или телефона.'); return; }

        let existing = null;
        if (phone) {
          existing = clientsCache.find(c => c.phone && c.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
        }
        if (!existing && name) {
          existing = clientsCache.find(c => c.name && c.name.toLowerCase() === name.toLowerCase());
        }

        let clientId;
        if (existing) {
          clientId = existing.id;
        } else {
          clientId = await db.clients.add({ name: name || phone, phone, email: '', notes: '' });
          clientsCache = await db.clients.toArray();
          await renderClients();
          const opt = document.createElement('option');
          opt.value = clientId;
          opt.textContent = `${name || phone}${phone ? ' — ' + phone : ''}`;
          clientSelect.appendChild(opt);
        }
        clientSelect.value = String(clientId);
        if (!existing) {
          const note = document.createElement('div');
          note.className = 'muted';
          note.textContent = `Клиент «${name || phone}» добавлен в базу.`;
          form.insertBefore(note, form.firstChild);
          setTimeout(() => note.remove(), 4000);
        }
      } catch (err) {
        console.log('Contact picker cancelled or failed:', err.name);
      }
    });
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      date: fd.get('date'),
      time: fd.get('time'),
      clientId: Number(fd.get('clientId')),
      serviceId: Number(fd.get('serviceId')),
      amount: Number(fd.get('amount'))
    };
    const editId = fd.get('id');
    if (editId) await db.incomes.update(Number(editId), data);
    else await db.incomes.add(data);
    closeModal();
    await loadFinance();
    await refreshCalendar();
    await makeSnapshot();
  };
  openModal();
}
function openExpenseModal(id = null) {
  const item = id ? expensesCache.find(x => x.id === id) : { date: todayISO() };
  const form = document.getElementById('modal-form');
  document.getElementById('modal-title').textContent = id ? 'Редактировать расход' : 'Новый расход';
  form.innerHTML = `
    <input type="hidden" name="id" value="${item.id || ''}" />
    <label>Дата<input type="date" name="date" required value="${item.date || todayISO()}" /></label>
    <label>Категория<input name="category" value="${escapeAttr(item.category)}" /></label>
    <label>Сумма<input type="number" step="0.01" name="amount" required value="${item.amount ?? ''}" /></label>
    <label>Комментарий<textarea name="comment">${escapeHtml(item.comment || '')}</textarea></label>
  `;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      date: fd.get('date'),
      category: fd.get('category').trim(),
      amount: Number(fd.get('amount')),
      comment: fd.get('comment').trim()
    };
    const editId = fd.get('id');
    if (editId) await db.expenses.update(Number(editId), data);
    else await db.expenses.add(data);
    closeModal();
    await loadFinance();
    await makeSnapshot();
  };
  openModal();
}

function initFinance() {
  document.getElementById('add-income-btn').addEventListener('click', () => openIncomeModal());
  document.getElementById('add-expense-btn').addEventListener('click', () => openExpenseModal());
}