let calendar = null;

const STATUS_COLORS = {
  new:     '#4caf50', // зелёный
  unpaid:  '#9c27b0', // фиолетовый
  paid:    '#00bcd4'  // голубой
};

// Возвращает 'new' | 'unpaid' | 'paid'
function getIncomeStatus(income) {
  if (income.paid) return 'paid';
  const date = income.date;
  const time = income.time || '10:00';
  const service = servicesCache.find(s => s.id === income.serviceId);
  const duration = service?.duration || 60;
  const [h, m] = time.split(':').map(Number);
  const end = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  end.setMinutes(end.getMinutes() + duration);
  return new Date() >= end ? 'unpaid' : 'new';
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
    buttonText: {
      today: 'Сегодня',
      month: 'Месяц',
      week: 'Неделя',
      day: 'День',
      list: 'Список'
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
      if (id) openIncomeCard(id); // теперь открываем карточку записи
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
      const status = getIncomeStatus(i);
      const color = STATUS_COLORS[status];

      const [h, m] = time.split(':').map(Number);
      const total = h * 60 + m + duration;
      const eh = Math.floor(total / 60) % 24;
      const em = total % 60;
      const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

      const statusLabel = status === 'paid' ? '✔ оплачено' : status === 'unpaid' ? '⏳ не оплачено' : '';

      return {
        id: String(i.id),
        title: `${client?.name || 'Клиент'} — ${service?.name || ''} (${Number(i.amount || 0).toFixed(0)})${statusLabel ? ' ' + statusLabel : ''}`,
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