(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum dashboard.js.');

  let completedRows = [];
  let distributionChart = null;
  let analysisChart = null;
  let activeFollowUpId = null;
  let wired = false;

  function mount() {
    if (wired) return;
    wired = true;
    const petugasSelect = document.getElementById('filterPetugasMpp');
    if (app.state.role === 'mpp' && petugasSelect) {
      petugasSelect.value = app.state.mppTarget || 'PRIYO';
      petugasSelect.disabled = true;
      const filterRow = petugasSelect.closest('.row');
      if (filterRow) filterRow.style.display = 'none';
    }
    document.getElementById('refreshDashboardButton')?.addEventListener('click', () => app.refreshData());
    document.getElementById('pilihanGrafikDinamis')?.addEventListener('change', () => renderDistribution(app.state.activations));
    document.getElementById('terapkanFilterRiwayat')?.addEventListener('click', renderHistory);
    document.getElementById('tabelAntrianDashboard')?.addEventListener('click', openActivation);
    document.getElementById('tabelRiwayatDashboard')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-followup-id]');
      if (button) showFollowUpDetail(button.dataset.followupId);
    });
    document.getElementById('deleteFollowUpButton')?.addEventListener('click', deleteCurrentFollowUp);
  }

  function onActivations(activations) {
    renderKpisAndQueue(activations);
    loadHistory(activations);
    renderDistribution(activations);
  }

  function renderKpisAndQueue(activations) {
    const pending = activations.filter((row) => row.status === 'Menunggu');
    document.getElementById('dash-total').textContent = activations.length;
    document.getElementById('dash-pending').textContent = pending.length;
    document.getElementById('dash-selesai').textContent = activations.length - pending.length;

    const body = document.getElementById('tabelAntrianDashboard');
    body.replaceChildren();
    if (!pending.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'text-center text-muted py-4';
      td.textContent = 'Belum ada pasien menunggu tindak lanjut.';
      tr.append(td);
      body.append(tr);
      return;
    }

    pending.slice(0, 100).forEach((row) => {
      const tr = document.createElement('tr');
      [row.tgl_aktivasi, row.nama_pasien, row.no_rm, row.ruang, row.nama_pelapor].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value || '-';
        tr.append(td);
      });
      const actionCell = document.createElement('td');
      actionCell.className = 'text-center';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-primary';
      button.dataset.activationId = row.id;
      button.textContent = app.canMpp(app.state.role) ? 'Proses' : 'Detail';
      actionCell.append(button);
      tr.append(actionCell);
      body.append(tr);
    });
  }

  async function loadHistory(activations) {
    const { data, error } = await app.supabase.from('tindak_lanjut_mpp')
      .select('id,aktivasi_mpp_id,tanggal_tl,nama_petugas_mpp,analisis_informasi,plan_of_care,keterangan')
      .order('tanggal_tl', { ascending: false }).limit(1000);
    if (error) {
      completedRows = [];
      app.setAlert('dashboardAlert', `Riwayat tidak dapat dimuat: ${error.message}`);
      renderHistory();
      return;
    }
    completedRows = (data || []).map((item) => ({
      ...item,
      activation: activations.find((activation) => activation.id === item.aktivasi_mpp_id)
    })).filter((item) => item.activation);
    renderHistory();
    renderAnalysis();
    if (document.getElementById('pilihanGrafikDinamis')?.value === 'tren_mpp') renderDistribution(activations);
  }

  function renderHistory() {
    const body = document.getElementById('tabelRiwayatDashboard');
    if (!body) return;
    const targetFilter = app.state.role === 'mpp'
      ? (app.state.mppTarget || 'SEMUA')
      : (document.getElementById('filterPetugasMpp')?.value || 'SEMUA');
    const startDate = document.getElementById('filterTglMulai')?.value || '';
    const endDate = document.getElementById('filterTglAkhir')?.value || '';
    const rows = completedRows.filter((item) => {
      const target = item.activation.mpp_tujuan || '';
      return (targetFilter === 'SEMUA' || target === targetFilter)
        && (!startDate || item.tanggal_tl >= startDate)
        && (!endDate || item.tanggal_tl <= endDate);
    });
    body.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.className = 'text-center text-muted py-4';
      td.textContent = 'Tidak ada riwayat sesuai filter.';
      tr.append(td);
      body.append(tr);
      return;
    }
    rows.slice(0, 100).forEach((item) => {
      const tr = document.createElement('tr');
      [item.tanggal_tl, item.activation.nama_pasien, item.activation.no_rm, item.activation.ruang, item.nama_petugas_mpp, (item.analisis_informasi || []).join(', ')].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value || '-';
        tr.append(td);
      });
      const action = document.createElement('td');
      action.className = 'text-center';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-primary';
      button.dataset.followupId = item.id;
      button.innerHTML = '<i class="fas fa-eye me-1"></i>Detail';
      action.append(button);
      tr.append(action);
      body.append(tr);
    });
  }

  function renderDistribution(activations) {
    const canvas = document.getElementById('chartDinamis');
    if (!canvas || !window.Chart) return;
    const mode = document.getElementById('pilihanGrafikDinamis')?.value || 'ruang';
    const type = mode === 'pembiayaan' ? 'pie' : mode === 'tren_mpp' ? 'line' : 'bar';
    let labels = [];
    let datasets = [];

    if (mode === 'tren_mpp') {
      const monthCounts = new Map();
      completedRows.forEach((item) => {
        const month = String(item.tanggal_tl || '').slice(0, 7);
        if (!month) return;
        const counts = monthCounts.get(month) || { PRIYO: 0, ARUM: 0 };
        if (counts[item.activation.mpp_tujuan] != null) counts[item.activation.mpp_tujuan] += 1;
        monthCounts.set(month, counts);
      });
      labels = [...monthCounts.keys()].sort();
      datasets = [
        { label: 'Priyo', data: labels.map((month) => monthCounts.get(month).PRIYO), borderColor: '#0d6efd', backgroundColor: '#0d6efd', tension: .25 },
        { label: 'Arum', data: labels.map((month) => monthCounts.get(month).ARUM), borderColor: '#ffc107', backgroundColor: '#ffc107', tension: .25 }
      ];
    } else {
      const field = mode === 'ruang' ? 'ruang' : mode === 'pembiayaan' ? 'jenis_pembiayaan' : 'diagnosa';
      const counts = new Map();
      activations.forEach((row) => {
        const label = String(row[field] || 'Tanpa Keterangan').trim();
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, mode === 'diagnosa' ? 10 : 12);
      labels = entries.map(([label]) => label);
      datasets = [{ label: 'Jumlah pasien', data: entries.map(([, value]) => value), backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#dc3545', '#0dcaf0', '#6c757d', '#fd7e14', '#6610f2'], borderRadius: type === 'bar' ? 3 : 0 }];
    }

    distributionChart?.destroy();
    distributionChart = new Chart(canvas, {
      type,
      data: { labels, datasets },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type !== 'bar', position: 'bottom' } }, scales: type === 'bar' || type === 'line' ? { y: { beginAtZero: true, ticks: { precision: 0 } } } : {} }
    });
  }

  function renderAnalysis() {
    const canvas = document.getElementById('chartAnalisis');
    if (!canvas || !window.Chart) return;
    const counts = new Map();
    completedRows.forEach((item) => (item.analisis_informasi || []).forEach((analysis) => counts.set(analysis, (counts.get(analysis) || 0) + 1)));
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    analysisChart?.destroy();
    analysisChart = new Chart(canvas, {
      type: 'pie',
      data: { labels: entries.length ? entries.map(([label]) => label) : ['Belum ada data'], datasets: [{ data: entries.length ? entries.map(([, count]) => count) : [1], backgroundColor: ['#0d6efd', '#ffc107', '#198754', '#dc3545', '#0dcaf0', '#6c757d', '#fd7e14', '#6610f2'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  function updateFollowUpActions() {
    const deleteButton = document.getElementById('deleteFollowUpButton');
    if (!deleteButton) return;
    const visible = app.state.role === 'mpp' && Boolean(activeFollowUpId);
    deleteButton.classList.toggle('d-none', !visible);
  }

  function showFollowUpDetail(id) {
    const item = completedRows.find((row) => row.id === id);
    if (!item) return;
    activeFollowUpId = id;
    document.getElementById('teksModalAnalisis').textContent = (item.analisis_informasi || []).join('\n') || 'Belum diisi';
    document.getElementById('teksModalPlanOfCare').textContent = item.plan_of_care || 'Belum diisi';
    document.getElementById('teksModalKeterangan').textContent = `Keterangan: ${item.keterangan || '-'} · Petugas: ${item.nama_petugas_mpp || '-'}`;
    updateFollowUpActions();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetailMpp')).show();
  }

  async function deleteCurrentFollowUp() {
    if (app.state.role !== 'mpp' || !activeFollowUpId) return;
    const item = completedRows.find((row) => row.id === activeFollowUpId);
    if (!item) return;
    const confirmed = window.confirm(`Hapus tindak lanjut untuk ${item.activation?.nama_pasien || '-'} (RM ${item.activation?.no_rm || '-'})?`);
    if (!confirmed) return;

    try {
      const { error: followUpError } = await app.supabase.from('tindak_lanjut_mpp').delete().eq('id', activeFollowUpId);
      if (followUpError) throw followUpError;
      const { error: activationError } = await app.supabase.from('aktivasi_mpp').update({ status: 'Menunggu' }).eq('id', item.aktivasi_mpp_id);
      if (activationError) throw activationError;
      app.setAlert('dashboardAlert', 'Tindak lanjut berhasil dihapus.', 'success');
      activeFollowUpId = null;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetailMpp')).hide();
      await app.refreshData();
    } catch (error) {
      app.setAlert('dashboardAlert', `Hapus tindak lanjut gagal: ${error.message}`);
    }
  }

  function openActivation(event) {
    const button = event.target.closest('[data-activation-id]');
    if (!button) return;
    const activation = app.state.activations.find((row) => row.id === button.dataset.activationId);
    if (!activation) return;
    if (app.canMpp(app.state.role)) {
      window.switchView('view-tindak-lanjut', document.querySelector('[data-role="mpp,admin"] .nav-link'));
      const select = document.getElementById('selectPasienMPP');
      select.value = activation.id;
      select.dispatchEvent(new Event('change'));
    } else {
      window.alert(`${activation.nama_pasien} · RM ${activation.no_rm}\nStatus: ${activation.status}\nMPP tujuan: ${activation.mpp_tujuan}`);
    }
  }

  app.modules.dashboard = { mount, onActivations };
})();
