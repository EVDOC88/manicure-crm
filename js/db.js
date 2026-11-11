const db = new Dexie('ManicureCRM');

db.version(2).stores({
  clients:  '++id, name, phone, email',
  services: '++id, name, price',
  clientServices: '++id, clientId, serviceId, [clientId+serviceId]',
  incomes:  '++id, clientId, serviceId, date, amount',
  expenses: '++id, date, category, amount',
  backups:  '++id, createdAt'
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}