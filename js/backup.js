const BACKUP_LIMIT = 5;

async function makeSnapshot() {
  try {
    const [clients, services, clientServices, incomes, expenses] = await Promise.all([
      db.clients.toArray(),
      db.services.toArray(),
      db.clientServices.toArray(),
      db.incomes.toArray(),
      db.expenses.toArray()
    ]);
    const snapshot = {
      createdAt: Date.now(),
      data: { clients, services, clientServices, incomes, expenses }
    };
    await db.backups.add(snapshot);
    const all = await db.backups.orderBy('createdAt').toArray();
    if (all.length > BACKUP_LIMIT) {
      const toDelete = all.slice(0, all.length - BACKUP_LIMIT);
      await db.backups.bulkDelete(toDelete.map(x => x.id));
    }
    updateBackupStatus();
  } catch (e) {
    console.error('Snapshot failed', e);
  }
}

async function updateBackupStatus() {
  const el = document.getElementById('backup-status');
  if (!el) return;
  const backups = await db.backups.orderBy('createdAt').toArray();
  const last = backups[backups.length - 1];
  el.textContent = last
    ? `Последний снимок: ${new Date(last.createdAt).toLocaleString('ru-RU')}`
    : 'Снимков пока нет';
}

async function exportExcel() {
  const clients = await db.clients.toArray();
  const services = await db.services.toArray();
  const clientServices = await db.clientServices.toArray();
  const incomes = await db.incomes.toArray();
  const expenses = await db.expenses.toArray();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clients), 'Clients');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(services), 'Services');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientServices), 'ClientServices');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomes), 'Incomes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses), 'Expenses');

  XLSX.writeFile(wb, `CRM-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function importExcel(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const readSheet = (name) => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name]) : [];

  const clients = readSheet('Clients');
  const services = readSheet('Services');
  const clientServices = readSheet('ClientServices');
  const incomes = readSheet('Incomes');
  const expenses = readSheet('Expenses');

  await db.transaction(
    'rw',
    [db.clients, db.services, db.clientServices, db.incomes, db.expenses],
    async () => {
      await Promise.all([
        db.clients.clear(), db.services.clear(), db.clientServices.clear(),
        db.incomes.clear(), db.expenses.clear()
      ]);
      if (clients.length) await db.clients.bulkPut(clients);
      if (services.length) await db.services.bulkPut(services);
      if (clientServices.length) await db.clientServices.bulkPut(clientServices);
      if (incomes.length) await db.incomes.bulkPut(incomes);
      if (expenses.length) await db.expenses.bulkPut(expenses);
    }
  );

  await makeSnapshot();
  alert('Импорт завершён.');
  location.reload();
}

function initBackup() {
  document.getElementById('export-excel-btn').addEventListener('click', exportExcel);
  document.getElementById('import-excel-btn').addEventListener('click', () => {
    document.getElementById('import-excel-input').click();
  });
  document.getElementById('import-excel-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && confirm('Импорт заменит все текущие данные. Продолжить?')) {
      await importExcel(file);
    }
    e.target.value = '';
  });
  updateBackupStatus();
}