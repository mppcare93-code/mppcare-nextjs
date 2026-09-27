(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum dashboard.js.');

  let completedRows = [];
  let wired = false;
  let pendingActivations = [];
  let igdRecords = [];
  let refreshTimer = null;
  let hasActivations = false;

  function mount() {
    if (wired) return;
    wired = true;
    loadIgdRecords();
    refreshTimer = window.setInterval(loadIgdRecords, 60000);
  }

  function onActivations(activations) {
    if (app.state.role === 'admisi' || !document.getElementById('view-dashboard')) return;
    hasActivations = true;
    pendingActivations = activations.filter((row) => row.status === 'Menunggu');
    renderCommandCenter();
    publishChartData();
    loadHistory(activations);
  }

  function publishChartData() {
    window.dispatchEvent(new CustomEvent('mppcare:dashboard-data', {
      detail: {
        activations: app.state.activations,
        igdRecords,
        followUps: completedRows,
        role: app.state.role,
        mppTarget: app.state.mppTarget
      }
    }));
  }

  function parseDateTime(date, time = '00:00') {
    if (!date) return null;
    const parsed = new Date(`${String(date).slice(0, 10)}T${String(time || '00:00').slice(0, 8)}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function elapsedMinutes(start, end = new Date()) {
    if (!start || !end || end < start) return null;
    return Math.floor((end.getTime() - start.getTime()) / 60000);
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function activationAge(activation, now = new Date()) {
    const activationDate = String(activation.tgl_aktivasi || '').slice(0, 10);
    const insertedAt = activation.waktu_input ? new Date(activation.waktu_input) : null;
    const insertedDate = insertedAt && !Number.isNaN(insertedAt.getTime()) ? localDateKey(insertedAt) : '';
    if (insertedDate === activationDate) {
      const minutes = elapsedMinutes(insertedAt, now);
      return minutes == null ? null : { minutes, label: formatDuration(minutes) };
    }
    const enteredAt = parseDateTime(activationDate);
    const minutes = elapsedMinutes(enteredAt, now);
    if (minutes == null) return null;
    const today = localDateKey(now);
    if (activationDate === today) return { minutes: 0, label: 'Hari ini · jam tidak tersedia' };
    return { minutes, label: `${Math.floor(minutes / 1440)}+ hari` };
  }

  function formatDuration(minutes) {
    if (minutes == null) return '-';
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const remaining = minutes % 60;
    if (days) return `${days} hari ${hours} j`;
    if (hours) return `${hours} j ${remaining} m`;
    return `${remaining} m`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function renderCommandCenter() {
    if (!hasActivations) return;
    const now = new Date();
    const pending = pendingActivations.map((activation) => ({
      activation,
      age: activationAge(activation, now)
    })).filter((item) => item.age != null)
      .sort((left, right) => right.age.minutes - left.age.minutes);
    const completedCount = app.state.activations.length - pendingActivations.length;
    setText('dash-pending', pendingActivations.length);
    setText('dash-selesai', completedCount);
    setText('dash-total-label', `Dari ${app.state.activations.length} total aktivasi`);

    const urgentBody = document.getElementById('tabelTopUrgent');
    if (urgentBody) {
      urgentBody.replaceChildren();
      if (!pending.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.className = 'text-center text-muted py-4';
        cell.textContent = 'Tidak ada aktivasi yang menunggu tindak lanjut.';
        row.append(cell);
        urgentBody.append(row);
      } else {
        pending.slice(0, 5).forEach(({ activation, age }) => {
          const row = document.createElement('tr');
          [
            `${activation.nama_pasien || '-'} · RM ${activation.no_rm || '-'}`,
            activation.ruang || '-',
            activation.mpp_tujuan || '-',
            age.label
          ].forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
          });
          urgentBody.append(row);
        });
      }
    }
    setText('urgentSummary', `${pendingActivations.length} aktivasi menunggu · ditampilkan ${Math.min(pending.length, 5)} yang terlama`);

    const icuOverdue = pending.filter(({ activation, age }) => /\bicu\b|picu/i.test(activation.ruang || '') && age.minutes >= 60).length;
    const igdOverdue = igdRecords.filter((record) => !record.bangsal_tujuan)
      .filter((record) => {
        const start = parseDateTime(record.tanggal, record.jam_inden || record.jam_daftar);
        return elapsedMinutes(start, now) >= 30;
      }).length;
    renderBottlenecks(igdOverdue, icuOverdue);

    const transferredWaits = igdRecords.map((record) => {
      if (!record.bangsal_tujuan || !record.tanggal_pindah || !record.jam_pindah) return null;
      const start = parseDateTime(record.tanggal, record.jam_inden || record.jam_daftar);
      const end = parseDateTime(record.tanggal_pindah, record.jam_pindah);
      return elapsedMinutes(start, end);
    }).filter((minutes) => minutes != null);
    setText('kpiIgdWait', transferredWaits.length
      ? formatDuration(Math.round(transferredWaits.reduce((sum, minutes) => sum + minutes, 0) / transferredWaits.length))
      : '-');
    setText('kpiIgdSample', `${transferredWaits.length} pasien sudah pindah`);
  }

  function renderBottlenecks(igdOverdue, icuOverdue) {
    const panel = document.getElementById('dashboardBottlenecks');
    if (!panel) return;
    panel.replaceChildren();
    const alerts = [];
    if (igdOverdue) alerts.push({ tone: 'danger', text: `${igdOverdue} pasien IGD menunggu kamar lebih dari 30 menit` });
    if (icuOverdue) alerts.push({ tone: 'warning', text: `${icuOverdue} aktivasi PPA dari ICU/PICU belum di-TL lebih dari 1 jam` });
    if (!alerts.length) {
      const empty = document.createElement('div');
      empty.className = 'dashboard-bottleneck-empty';
      empty.innerHTML = '<i class="fas fa-circle-check"></i><span>Tidak ada bottleneck yang melewati batas SLA.</span>';
      panel.append(empty);
      return;
    }
    alerts.forEach((alert) => {
      const item = document.createElement('div');
      item.className = `dashboard-bottleneck dashboard-bottleneck-${alert.tone}`;
      const icon = document.createElement('i');
      icon.className = alert.tone === 'danger' ? 'fas fa-triangle-exclamation' : 'fas fa-clock';
      const message = document.createElement('strong');
      message.textContent = alert.text;
      item.append(icon, message);
      panel.append(item);
    });
  }

  async function loadIgdRecords() {
    if (!document.getElementById('view-dashboard')) return;
    const { data, error } = await app.supabase.from('monitoring_igd')
      .select('tanggal,jam_inden,jam_daftar,bangsal_tujuan,tanggal_pindah,jam_pindah,nomor_bed')
      .order('tanggal', { ascending: false }).limit(1000);
    if (error) {
      app.setAlert('dashboardAlert', `Data waktu tunggu IGD tidak dapat dimuat: ${error.message}`);
      return;
    }
    igdRecords = data || [];
    renderCommandCenter();
    publishChartData();
  }

  function averageResponseMinutes(rows) {
    const durations = rows.map((item) => {
      const enteredAt = reliableActivationTimestamp(item) && item.activation?.waktu_input
        ? new Date(item.activation.waktu_input)
        : null;
      const followedAt = item.waktu_simpan ? new Date(item.waktu_simpan) : null;
      return elapsedMinutes(enteredAt, followedAt);
    }).filter((minutes) => minutes != null);
    return durations.length
      ? Math.round(durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length)
      : null;
  }

  function reliableActivationTimestamp(item) {
    if (!item.activation?.waktu_input || !item.activation?.tgl_aktivasi) return false;
    const enteredAt = new Date(item.activation.waktu_input);
    return !Number.isNaN(enteredAt.getTime())
      && localDateKey(enteredAt) === String(item.activation.tgl_aktivasi).slice(0, 10);
  }

  function renderMppResponseKpi() {
    const average = averageResponseMinutes(completedRows);
    setText('kpiMppResponse', average == null ? '-' : formatDuration(average));
    const measuredCount = completedRows.filter((item) => reliableActivationTimestamp(item) && item.waktu_simpan).length;
    setText('kpiMppSample', measuredCount
      ? `${measuredCount} tindak lanjut dengan waktu terukur`
      : 'Data waktu historis belum cukup untuk mengukur durasi');
  }

  async function loadHistory(activations) {
    const { data, error } = await app.supabase.from('tindak_lanjut_mpp')
      .select('id,aktivasi_mpp_id,tanggal_tl,waktu_simpan,nama_petugas_mpp,analisis_informasi,plan_of_care,keterangan')
      .order('tanggal_tl', { ascending: false }).limit(1000);
    if (error) {
      completedRows = [];
      app.setAlert('dashboardAlert', `Riwayat tidak dapat dimuat: ${error.message}`);
      renderMppResponseKpi();
      return;
    }
    completedRows = (data || []).map((item) => ({
      ...item,
      activation: activations.find((activation) => activation.id === item.aktivasi_mpp_id)
    })).filter((item) => item.activation);
    renderMppResponseKpi();
    publishChartData();
  }

  app.modules.dashboard = { mount, onActivations };
})();
