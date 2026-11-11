let calendar = null;

// Палитра цветов (достаточно различимых)
const CLIENT_COLORS = [
  '#6c63ff', '#e91e63', '#ff9800', '#4caf50', '#00bcd4',
  '#9c27b0', '#f44336', '#3f51b5', '#009688', '#ff5722',
  '#8bc34a', '#03a9f4', '#cddc39', '#795548', '#607d8b'
];

function colorForClient(clientId) {
  if (!clientId) return '#9e9e9e'; // серый для «без клиента»
  return CLIENT_COLORS[Number(clientId) % CLIENT_COLORS.length];
}

async function initCalendar() {
  const events = await loadCalendarEvents();
  const calendarEl = document.getElementById('calendar');

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth',
    locale: 'ru',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
    },
    height: 'auto',
    events: events,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    dateClick: (info) => {
      const dateStr = info.dateStr.slice(0, 10);
      const timeStr = info.dateStr.length > 10 ? info.dateStr.slice(11, 16) : '10:00';
      openIncomeModal();
      setTimeout(() => {
        const dateInput = document.querySelector('#modal-form input[name="date"]');
        const timeInput = document.querySelector('#modal-form input[name="time"]');
        if (dateInput) dateInput.value = dateStr;
        if (timeInput) timeInput.value = timeStr;
      }, 0);
    },
    eventClick: (info) => {
      info.jsEvent.preventDefault();
      const id = Number(info.event.id);
      if (id) openIncomeModal(id);
    }
  });

  calendar.render();

  window.addEventListener('resize', () => {
    if (!calendar) return;
    const want = window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth';
    if (calendar.view.type !== want && (calendar.view.type === 'dayGridMonth' || calendar.view.type === 'listWeek')) {
      calendar.changeView(want);
    }
  });
}

async function loadCalendarEvents() {
  const incomes = await db.incomes.toArray();
  return incomes
    .filter(i => i.date)
    .map(i => {
      const client = clientsCache.find(c => c.id === i.clientId);
      const service = servicesCache.find(s => s.id === i.serviceId);
      const time = i.time || '10:00';
      const duration = service?.duration || 60;
      const color = colorForClient(i.clientId);

      // Вычисляем время окончания
      const [h, m] = time.split(':').map(Number);
      const total = h * 60 + m + duration;
      const eh = Math.floor(total / 60) % 24;
      const em = total % 60;
      const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

      return {
        id: String(i.id),
        title: `${client?.name || 'Клиент'} — ${service?.name || ''} (${Number(i.amount || 0).toFixed(0)})`,
        start: `${i.date}T${time}:00`,
        end: `${i.date}T${endTime}:00`,
        allDay: false,
        backgroundColor: color,
        borderColor: color,
        textColor: '#fff'
      };
    });
}

async function refreshCalendar() {
  if (!calendar) return;
  const events = await loadCalendarEvents();
  calendar.removeAllEvents();
  events.forEach(e => calendar.addEvent(e));
}