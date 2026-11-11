function openModal() {
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal-form').innerHTML = '';
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'calendar') {
        setTimeout(() => calendar && calendar.updateSize(), 50);
      }
    });
  });
}

async function init() {
  initTabs();
  initBackup();
  initServices();
  initClients();
  initFinance();
  initReports();

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  await loadServices();
  await loadClients();
  await loadFinance();
  await initCalendar();
  await makeSnapshot();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);