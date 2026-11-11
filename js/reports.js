async function buildReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const today = todayISO();

  const incomes = await db.incomes.toArray();
  const expenses = await db.expenses.toArray();

  const inRange = (d) => {
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // Разделяем доходы по статусам
  const factIncomes = incomes.filter(i => inRange(i.date) && i.paid);
  const unpaidPast = incomes.filter(i => inRange(i.date) && !i.paid && getIncomeStatus(i) === 'unpaid');
  const futureInPeriod = incomes.filter(i => inRange(i.date) && !i.paid && getIncomeStatus(i) === 'new');
  const allFuture = incomes.filter(i => i.date && i.date > today && !i.paid);

  // Расходы — как факт
  const filteredExpenses = expenses.filter(e => inRange(e.date));

  const sum = (arr) => arr.reduce((s, x) => s + Number(x.amount || 0), 0);

  const totalIncomeFact = sum(factIncomes);
  const totalUnpaidPast = sum(unpaidPast);
  const totalFuture = sum(futureInPeriod);
  const totalAllFuture = sum(allFuture);
  const totalExpense = sum(filteredExpenses);
  const profitFact = totalIncomeFact - totalExpense;

  // Разбивки — только по факту (оплачено)
  const byService = {};
  const byClient = {};
  const clientServiceMatrix = {};

  for (const i of factIncomes) {
    const sName = servicesCache.find(s => s.id === i.serviceId)?.name || 'Без услуги';
    const cName = clientsCache.find(c => c.id === i.clientId)?.name || 'Без клиента';
    byService[sName] = (byService[sName] || 0) + Number(i.amount || 0);
    byClient[cName] = (byClient[cName] || 0) + Number(i.amount || 0);
    if (!clientServiceMatrix[cName]) clientServiceMatrix[cName] = {};
    const cell = clientServiceMatrix[cName][sName] || { sum: 0, count: 0 };
    cell.sum += Number(i.amount || 0);
    cell.count += 1;
    clientServiceMatrix[cName][sName] = cell;
  }

  const byCategory = {};
  filteredExpenses.forEach(e => {
    const key = e.category || 'Без категории';
    byCategory[key] = (byCategory[key] || 0) + Number(e.amount || 0);
  });

  // Список будущих записей (все, независимо от периода)
  const futureList = allFuture
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .map(i => {
      const client = clientsCache.find(c => c.id === i.clientId);
      const service = servicesCache.find(s => s.id === i.serviceId);
      return {
        date: i.date,
        time: i.time || '10:00',
        client: client?.name || '—',
        service: service?.name || '—',
        amount: Number(i.amount || 0)
      };
    });

  const out = document.getElementById('report-output');
  out.innerHTML = `
    <div class="report-summary">
      <div>Оплачено (факт)<strong>${totalIncomeFact.toFixed(2)}</strong></div>
      <div>Просрочено (не оплачено)<strong style="color:#9c27b0">${totalUnpaidPast.toFixed(2)}</strong></div>
      <div>Предстоит в периоде<strong style="color:#4caf50">${totalFuture.toFixed(2)}</strong></div>
      <div>Расходы<strong>${totalExpense.toFixed(2)}</strong></div>
      <div>Прибыль (факт)<strong style="color:${profitFact >= 0 ? '#1a8f3c' : '#c00'}">${profitFact.toFixed(2)}</strong></div>
      <div>Всего записано вперёд<strong style="color:#00bcd4">${totalAllFuture.toFixed(2)}</strong></div>
    </div>

    <h3>Доходы по услугам (оплачено)</h3>
    ${renderKeyValueTable(byService)}

    <h3>Доходы по клиентам (оплачено)</h3>
    ${renderKeyValueTable(byClient)}

    <h3>Клиент × Услуга (оплачено: сумма / кол-во)</h3>
    ${renderMatrixTable(clientServiceMatrix)}

    <h3>Расходы по категориям</h3>
    ${renderKeyValueTable(byCategory)}

    <h3>Прогноз: будущие записи (${futureList.length})</h3>
    ${renderFutureTable(futureList)}
  `;
}

function renderKeyValueTable(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return '<p class="muted">Нет данных</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Название</th><th>Сумма</th></tr></thead><tbody>
    ${entries.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v.toFixed(2)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function renderMatrixTable(matrix) {
  const clients = Object.keys(matrix);
  if (!clients.length) return '<p class="muted">Нет данных</p>';
  const allServices = new Set();
  clients.forEach(c => Object.keys(matrix[c]).forEach(s => allServices.add(s)));
  const serviceList = [...allServices];

  let html = '<div class="table-wrap"><table><thead><tr><th>Клиент</th>';
  serviceList.forEach(s => html += `<th>${escapeHtml(s)}</th>`);
  html += '<th>Итого</th></tr></thead><tbody>';

  clients.forEach(c => {
    html += `<tr><td>${escapeHtml(c)}</td>`;
    let rowTotal = 0;
    serviceList.forEach(s => {
      const cell = matrix[c][s];
      if (cell) {
        rowTotal += cell.sum;
        html += `<td>${cell.sum.toFixed(0)} / ${cell.count}</td>`;
      } else {
        html += '<td class="muted">—</td>';
      }
    });
    html += `<td><strong>${rowTotal.toFixed(0)}</strong></td></tr>`;
  });
  html += '</tbody></table></div>';
  return html;
}

function renderFutureTable(rows) {
  if (!rows.length) return '<p class="muted">Будущих записей нет</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Дата</th><th>Время</th><th>Клиент</th><th>Услуга</th><th>Сумма</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.time)}</td>
        <td>${escapeHtml(r.client)}</td>
        <td>${escapeHtml(r.service)}</td>
        <td>${r.amount.toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function initReports() {
  document.getElementById('build-report-btn').addEventListener('click', buildReport);
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  document.getElementById('report-from').value = first;
  document.getElementById('report-to').value = todayISO();
}