(() => {
  const supabase = window.supabaseClient;
  if (!supabase) throw new Error('Supabase client belum siap untuk modul IGD.');
  const criticalAlarm = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-back-2575.mp3');

  const columns = 'id,tanggal,no_rm,nama_pasien,informed_consent,inden_bangsal,jam_inden,jaminan,jam_daftar,nomor_bed,nama_dpjp,koordinasi_kepala_ruang,koordinasi_dpjp,koordinasi_ibs,koordinasi_lab,koordinasi_radiologi,fasilitas,advokasi,edukasi,akar_masalah,bangsal_tujuan,tanggal_pindah,jam_pindah,waktu_tunggu,waktu_input';
  let records = [];
  let filter = 'inden';
  let mode = 'tabel';
  let disasterActive = false;
  let tvActive = false;
  let initialized = false;
  let role = null;
  let heatmapTimer = null;
  let tvRefreshTimer = null;
  let lastCriticalCount = 0;

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const dateText = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('id-ID') : '-';
  const timeText = (value) => value ? String(value).slice(0, 5) : '-';
  const text = (id) => byId(id)?.value?.trim() || '';

  function alertStage(id, message, type = 'success') {
    const target = byId(id);
    if (!target) return;
    target.className = `alert mt-2 text-center fw-bold alert-${type}`;
    target.textContent = message;
    target.classList.remove('d-none');
  }

  function getStage(row) {
    if (row.bangsal_tujuan) return 'pindah';
    if (row.koordinasi_kepala_ruang || row.koordinasi_dpjp || row.koordinasi_ibs || row.koordinasi_lab || row.koordinasi_radiologi || row.fasilitas || row.advokasi || row.edukasi || row.akar_masalah) return 'mpp';
    if (row.nomor_bed || row.nama_dpjp) return 'pelayanan';
    return 'inden';
  }

  function elapsed(row, endAt = new Date()) {
    if (!row.tanggal) return 0;
    const startTime = String(row.jam_inden || row.jam_daftar || '00:00').slice(0, 5);
    const startAt = new Date(`${row.tanggal}T${startTime}:00`);
    const endTime = endAt instanceof Date ? null : String(endAt.time || '00:00').slice(0, 5);
    const end = endAt instanceof Date ? endAt : new Date(`${endAt.date}T${endTime}:00`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.floor((end.getTime() - startAt.getTime()) / 60000));
  }

  function durationInfo(minutes, complete = false) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const label = `${hours > 0 ? `${hours}j ` : ''}${mins}m`;
    if (complete) return { label, badge: 'bg-secondary', row: 'table-success', hours };
    if (hours >= 4) return { label: `⏳ ${label}`, badge: 'bg-danger', row: 'table-danger', hours };
    if (hours >= 2) return { label, badge: 'bg-warning text-dark', row: 'table-warning', hours };
    return { label, badge: 'bg-success', row: 'table-warning', hours };
  }

  function filteredRecords() {
    if (filter === 'pindah') return records.filter((row) => Boolean(row.bangsal_tujuan));
    if (filter === 'kritis') return records.filter((row) => !row.bangsal_tujuan && elapsed(row) >= 240);
    return records.filter((row) => !row.bangsal_tujuan);
  }

  async function refresh() {
    const tbody = byId('tabelMonitorIgd');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4">Menyinkronkan data IGD...</td></tr>';
    const { data, error } = await supabase.from('monitoring_igd').select(columns)
      .order('tanggal', { ascending: false }).order('waktu_input', { ascending: false }).limit(1000);
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Gagal memuat data: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    records = data || [];
    window.dataIgdLokal = records;
    populatePatientSelects();
    updateStatistics();
    renderHeatmap();
    renderCurrentView();
    if (!heatmapTimer) heatmapTimer = window.setInterval(() => {
      renderHeatmap();
      checkCriticalAlarm();
    }, 60000);
    checkCriticalAlarm();
  }

  function populatePatientSelects(selectedId) {
    const pending = records.filter((row) => !row.bangsal_tujuan);
    ['selectPasienTahap2', 'selectPasienTahap3', 'selectPasienTahap4'].forEach((id) => {
      const select = byId(id);
      if (!select) return;
      const previous = selectedId || select.value;
      select.replaceChildren(new Option('-- Pilih Pasien IGD --', ''));
      pending.forEach((row) => select.add(new Option(`${row.nama_pasien} (${row.no_rm}) · ${row.inden_bangsal || '-'}`, row.id)));
      if (previous && pending.some((row) => row.id === previous)) select.value = previous;
    });
  }

  function updateStatistics() {
    const active = records.filter((row) => !row.bangsal_tujuan);
    const underway = active.filter((row) => ['pelayanan', 'mpp'].includes(getStage(row)));
    const todayMoved = records.filter((row) => row.tanggal_pindah === today());
    byId('igd-total-inden').textContent = active.length - underway.length;
    byId('igd-proses-mpp').textContent = underway.length;
    byId('igd-pindah-hari-ini').textContent = todayMoved.length;
  }

  function renderHeatmap() {
    const body = byId('tabelHeatmapStagnasi');
    if (!body) return;
    const roomStats = new Map();
    records.filter((row) => row.inden_bangsal && !['PULANG/APS', 'MENINGGAL'].includes(row.inden_bangsal)).forEach((row) => {
      const item = roomStats.get(row.inden_bangsal) || { count: 0, minutes: 0 };
      item.count += 1;
      item.minutes += elapsed(row, row.bangsal_tujuan
        ? { date: row.tanggal_pindah, time: row.jam_pindah }
        : new Date());
      roomStats.set(row.inden_bangsal, item);
    });
    const sorted = [...roomStats.entries()].map(([room, item]) => ({ room, count: item.count, average: Math.round(item.minutes / item.count) }))
      .sort((a, b) => b.average - a.average).slice(0, 5);
    if (!sorted.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Belum ada data pasien valid untuk heatmap.</td></tr>';
      return;
    }
    body.innerHTML = sorted.map((item, index) => {
      const info = durationInfo(item.average);
      const sla = item.average >= 240 ? '<span class="badge bg-danger">Melebihi SLA</span>' : item.average >= 120 ? '<span class="badge bg-warning text-dark">Mendekati batas</span>' : '<span class="badge bg-success">Sesuai SLA</span>';
      return `<tr><td class="text-center fw-bold">${index + 1}</td><td class="fw-bold">${escapeHtml(item.room)}</td><td class="text-center">${item.count}</td><td class="text-center">${info.label}</td><td class="text-center">${sla}</td></tr>`;
    }).join('');
  }

  function checkCriticalAlarm() {
    const criticalCount = records.filter((row) => !row.bangsal_tujuan && elapsed(row) >= 240).length;
    if (tvActive && criticalCount > lastCriticalCount) {
      criticalAlarm.currentTime = 0;
      criticalAlarm.play().catch(() => {});
      byId('bannerBencana')?.classList.remove('d-none');
      byId('bannerBencana')?.classList.add('bencana-aktif');
    }
    lastCriticalCount = criticalCount;
  }

  function renderCurrentView() {
    window.dataIgdFiltered = filteredRecords();
    renderTable(window.dataIgdFiltered);
    if (mode === 'kanban') renderKanban(window.dataIgdFiltered);
  }

  function renderTable(rows) {
    const body = byId('tabelMonitorIgd');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="text-center text-muted fw-bold py-4">Tidak ada data pasien pada filter ini.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row, index) => {
      const stage = getStage(row);
      const info = durationInfo(elapsed(row), stage === 'pindah');
      const status = row.bangsal_tujuan
        ? `<span class="badge bg-success d-block mb-1">Pindah: ${escapeHtml(row.bangsal_tujuan)}</span><small>${dateText(row.tanggal_pindah)} (${timeText(row.jam_pindah)})</small>`
        : `<span class="badge ${info.badge}">${info.hours >= 4 ? 'Kritis · ' : 'Inden · '}${info.label}</span>`;
      const mppNotes = [row.koordinasi_kepala_ruang && `Ka. Ruang: ${row.koordinasi_kepala_ruang}`, row.koordinasi_dpjp && `DPJP: ${row.koordinasi_dpjp}`, row.koordinasi_ibs && `IBS: ${row.koordinasi_ibs}`, row.koordinasi_lab && `Lab: ${row.koordinasi_lab}`, row.koordinasi_radiologi && `Radiologi: ${row.koordinasi_radiologi}`].filter(Boolean).join(' · ') || '-';
      return `<tr class="${info.row}"><td class="text-center fw-bold">${index + 1}</td><td>${dateText(row.tanggal)}<br><strong>${escapeHtml(row.no_rm)}</strong></td><td class="fw-bold">${escapeHtml(row.nama_pasien)}</td><td><span class="badge bg-secondary">${escapeHtml(row.jaminan || '-')}</span><br><small>IC: ${escapeHtml(row.informed_consent || '-')}</small></td><td><strong class="d-block">${escapeHtml(row.inden_bangsal || '-')}</strong><small>Jam: ${timeText(row.jam_inden || row.jam_daftar)}</small><br>${status}</td><td><small class="d-block">Bed: <b>${escapeHtml(row.nomor_bed || '-')}</b></small><small>DPJP: <b>${escapeHtml(row.nama_dpjp || '-')}</b></small></td><td><small>${escapeHtml(mppNotes)}</small><br><button type="button" class="btn btn-sm btn-outline-info mt-1" data-action="details" data-id="${row.id}">Detail</button></td><td><small class="text-danger fw-bold">${escapeHtml(row.akar_masalah || '-')}</small></td><td class="igd-row-actions"><button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${row.id}" title="Edit"><i class="fas fa-edit"></i></button><button type="button" class="btn btn-sm btn-outline-success" data-action="wa" data-id="${row.id}" title="WhatsApp"><i class="fab fa-whatsapp"></i></button><button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${row.id}" title="Hapus"><i class="fas fa-trash-alt"></i></button></td></tr>`;
    }).join('');
  }

  function renderKanban(rows) {
    const counts = { inden: 0, pelayanan: 0, mpp: 0, pindah: 0 };
    const buckets = { inden: [], pelayanan: [], mpp: [], pindah: [] };
    rows.forEach((row) => {
      const stage = getStage(row);
      counts[stage] += 1;
      buckets[stage].push(row);
    });
    Object.keys(buckets).forEach((stage) => {
      const column = byId(`col-${stage}`);
      byId(`count-${stage}`).textContent = counts[stage];
      column.innerHTML = buckets[stage].length ? buckets[stage].map((row) => kanbanCard(row, stage)).join('') : '<div class="text-center text-muted p-3">Kosong</div>';
    });
  }

  function kanbanCard(row, stage) {
    const info = durationInfo(elapsed(row), stage === 'pindah');
    return `<article class="card kanban-card aksen-${stage} mb-3 shadow-sm bg-white" draggable="true" data-id="${row.id}" data-tahap="${stage}"><div class="card-body p-3">
      <div class="d-flex justify-content-between align-items-start"><div><span class="badge bg-light text-dark border mb-1">${dateText(row.tanggal)} · ${timeText(row.jam_daftar)}</span><br><span class="badge ${info.badge} badge-durasi">${info.label}</span></div><button class="btn btn-sm btn-light" data-action="edit" data-id="${row.id}" type="button" aria-label="Edit pasien"><i class="fas fa-ellipsis-v"></i></button></div>
      <h3 class="h6 fw-bold mt-2 mb-1">${escapeHtml(row.nama_pasien)}</h3><div class="small text-muted mb-2"><b>${escapeHtml(row.no_rm)}</b> · ${escapeHtml(row.inden_bangsal || '-')}</div>
      ${row.bangsal_tujuan ? `<div class="small text-success fw-bold">Pindah: ${escapeHtml(row.bangsal_tujuan)} · ${dateText(row.tanggal_pindah)} ${timeText(row.jam_pindah)}</div>` : ''}
      <details class="small text-muted mt-2"><summary class="fw-bold">Detail Lengkap Pasien</summary><div class="pt-2">Jaminan: ${escapeHtml(row.jaminan || '-')}<br>IC: ${escapeHtml(row.informed_consent || '-')}<br>Bed: ${escapeHtml(row.nomor_bed || '-')}<br>DPJP: ${escapeHtml(row.nama_dpjp || '-')}<br>Koordinasi: ${escapeHtml(row.koordinasi_dpjp || '-')}<br>Lab: ${escapeHtml(row.koordinasi_lab || '-')}<br>Radiologi: ${escapeHtml(row.koordinasi_radiologi || '-')}<br>Akar masalah: ${escapeHtml(row.akar_masalah || '-')}</div></details>
      <div class="d-grid gap-2 mt-3"><button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${row.id}"><i class="fas fa-edit me-1"></i>Edit data / lanjut tahap</button>${stage !== 'pindah' ? `<button type="button" class="btn btn-sm btn-success" data-action="wa" data-id="${row.id}"><i class="fab fa-whatsapp me-1"></i>Lapor ruangan</button>` : ''}</div>
    </div></article>`;
  }

  function setupHandlers(root) {
    if (root.dataset.wired) return;
    root.dataset.wired = 'true';
    ['formIgdTahap1', 'formIgdTahap2', 'formIgdTahap3', 'formIgdTahap4'].forEach((id, index) => {
      byId(id).addEventListener('submit', (event) => saveStage(index + 1, event));
    });
    ['selectPasienTahap2', 'selectPasienTahap3', 'selectPasienTahap4'].forEach((id) => {
      byId(id).addEventListener('change', (event) => fillEditForms(event.target.value));
    });
    root.addEventListener('click', handleClick);
    root.addEventListener('dragstart', handleDragStart);
    root.addEventListener('dragover', handleDragOver);
    root.addEventListener('dragleave', handleDragLeave);
    root.addEventListener('drop', handleDrop);
    root.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));
    root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
    byId('igdTanggal').value = today();
  }

  async function mount() {
    if (initialized || !role) return;
    initialized = true;
    const target = byId('view-igd');
    try {
      const response = await fetch('igd-view.html');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      target.innerHTML = await response.text();
      setupHandlers(target);
      await refresh();
    } catch (error) {
      initialized = false;
      target.innerHTML = `<div class="alert alert-danger">Gagal memuat Koordinasi IGD: ${escapeHtml(error.message)}</div>`;
    }
  }

  function handleSession(event) {
    role = event.detail?.role || null;
    if (role) mount();
    else {
      initialized = false;
      if (heatmapTimer) window.clearInterval(heatmapTimer);
      heatmapTimer = null;
      if (tvRefreshTimer) window.clearInterval(tvRefreshTimer);
      tvRefreshTimer = null;
      records = [];
      const target = byId('view-igd');
      if (target) target.replaceChildren();
    }
  }

  function setFilter(value) {
    filter = value;
    byId('igdTab').querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === value));
    renderCurrentView();
  }

  function setMode(value) {
    mode = value;
    byId('tabelMonitorIgdContainer').classList.toggle('d-none', value !== 'tabel');
    byId('kanbanContainer').classList.toggle('d-none', value !== 'kanban');
    byId('btnModeTabel').className = value === 'tabel' ? 'btn btn-primary active' : 'btn btn-outline-primary bg-white';
    byId('btnModeKanban').className = value === 'kanban' ? 'btn btn-primary active' : 'btn btn-outline-primary bg-white';
    renderCurrentView();
  }

  function setDisaster(active) {
    disasterActive = active;
    byId('bannerBencana').classList.toggle('d-none', !active);
    byId('bannerBencana').classList.toggle('bencana-aktif', active);
    const button = byId('btnToggleBencana');
    button.classList.toggle('btn-danger', active);
    button.classList.toggle('btn-warning', !active);
    button.innerHTML = active ? '<i class="fas fa-times-circle me-1"></i>Matikan Code' : '<i class="fas fa-exclamation-triangle me-1"></i>Code Yellow / Orange';
    const audio = byId('audioBencana');
    if (active) { audio.loop = true; audio.play().catch(() => {}); }
    else { audio.pause(); audio.currentTime = 0; }
  }

  function handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const row = records.find((item) => item.id === button.dataset.id);
    if (action === 'toggle-disaster') setDisaster(!disasterActive);
    if (action === 'share-disaster') openWhatsApp('🚨 PANGGILAN CODE YELLOW / ORANGE - RS 🚨\n\nTerjadi lonjakan pasien stagnan di IGD. Mohon percepatan koordinasi pemindahan bed.\n\nSistem MPPCare');
    if (action === 'report-whatsapp') reportWaiting();
    if (action === 'toggle-tv') toggleTv();
    if (action === 'refresh') refresh();
    if (action === 'refresh-heatmap') renderHeatmap();
    if (action === 'edit' && row) fillEditForms(row.id);
    if (action === 'delete' && row) deleteRecord(row);
    if (action === 'wa' && row) reportRoom(row);
    if (action === 'details' && row) showDetails(row);
    if (action === 'cancel-edit') cancelEdit();
  }

  async function saveStage(stage, event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      let error;
      if (stage === 1) {
        const id = text('igdIdEditLokal');
        const row = {
          tanggal: text('igdTanggal'), no_rm: text('igdNoRM'), nama_pasien: text('igdNamaPasien'),
          informed_consent: text('igdInformedConsent'), inden_bangsal: text('igdIndenBangsal'),
          jam_inden: text('igdJamInden') || null, jaminan: text('igdJaminan'), jam_daftar: text('igdJamDaftar') || null
        };
        const query = id ? supabase.from('monitoring_igd').update(row).eq('id', id) : supabase.from('monitoring_igd').insert(row);
        ({ error } = await query);
      } else {
        const id = text(`selectPasienTahap${stage}`);
        if (!id) throw new Error('Pilih pasien terlebih dahulu.');
        const row = stage === 2
          ? { nomor_bed: text('igdNomorBed'), nama_dpjp: text('igdNamaDpjp') }
          : stage === 3
            ? { koordinasi_kepala_ruang: text('mppKoorKaru') || null, koordinasi_dpjp: text('mppKoorDpjp') || null, koordinasi_ibs: text('mppKoorIbs') || null, koordinasi_lab: text('mppKoorLab') || null, koordinasi_radiologi: text('mppKoorRad') || null, fasilitas: text('mppFasilitasi') || null, advokasi: text('mppAdvokasi') || null, edukasi: text('mppEdukasiRetensi') || null, akar_masalah: text('igdAkarMasalah') || null }
            : makeTransferUpdate(id);
        ({ error } = await supabase.from('monitoring_igd').update(row).eq('id', id));
      }
      if (error) throw error;
      alertStage(`alertTahap${stage}`, `Data tahap ${stage} berhasil disimpan.`, 'success');
      byId('igdIdEditLokal').value = '';
      if (stage === 1) {
        form.reset();
        byId('igdTanggal').value = today();
      }
      await refresh();
    } catch (error) {
      alertStage(`alertTahap${stage}`, `Gagal menyimpan: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
    }
  }

  function makeTransferUpdate(id) {
    const row = records.find((item) => item.id === id);
    const now = new Date();
    const date = today();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    return {
      bangsal_tujuan: text('igdPindahBangsal'),
      tanggal_pindah: date,
      jam_pindah: time,
      waktu_tunggu: formatDuration(elapsed(row, now)),
      akar_masalah: row?.akar_masalah || null
    };
  }

  function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}j ${remaining}m`;
  }

  function fillEditForms(id) {
    const row = records.find((item) => item.id === id);
    if (!row) return;
    populatePatientSelects(id);
    byId('igdIdEditLokal').value = row.id;
    byId('igdTanggal').value = row.tanggal || '';
    byId('igdNoRM').value = row.no_rm || '';
    byId('igdNamaPasien').value = row.nama_pasien || '';
    byId('igdInformedConsent').value = row.informed_consent || '';
    byId('igdIndenBangsal').value = row.inden_bangsal || '';
    byId('igdJamInden').value = timeText(row.jam_inden) === '-' ? '' : timeText(row.jam_inden);
    byId('igdJaminan').value = row.jaminan || '';
    byId('igdJamDaftar').value = timeText(row.jam_daftar) === '-' ? '' : timeText(row.jam_daftar);
    byId('igdNomorBed').value = row.nomor_bed || '';
    byId('igdNamaDpjp').value = row.nama_dpjp || '';
    byId('mppKoorKaru').value = row.koordinasi_kepala_ruang || '';
    byId('mppKoorDpjp').value = row.koordinasi_dpjp || '';
    byId('mppKoorIbs').value = row.koordinasi_ibs || '';
    byId('mppKoorLab').value = row.koordinasi_lab || '';
    byId('mppKoorRad').value = row.koordinasi_radiologi || '';
    byId('mppFasilitasi').value = row.fasilitas || '';
    byId('mppAdvokasi').value = row.advokasi || '';
    byId('mppEdukasiRetensi').value = row.edukasi || '';
    byId('igdAkarMasalah').value = row.akar_masalah || '';
    byId('igdPindahBangsal').value = row.bangsal_tujuan || '';
    byId('igdKeteranganTunggu').value = row.waktu_tunggu || '';
    byId('btnBatalEditIgdContainer').innerHTML = `<div class="alert alert-primary py-2 px-3 fw-bold d-flex justify-content-between align-items-center"><span>Mengedit data: ${escapeHtml(row.nama_pasien)}</span><button class="btn btn-sm btn-outline-danger" type="button" data-action="cancel-edit">Batal</button></div>`;
    ['collapseTahap1', 'collapseTahap2', 'collapseTahap3', 'collapseTahap4'].forEach((collapseId) => {
      bootstrap.Collapse.getOrCreateInstance(byId(collapseId), { toggle: false }).show();
    });
    byId('accordionIgdFlow').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    ['formIgdTahap1', 'formIgdTahap2', 'formIgdTahap3', 'formIgdTahap4'].forEach((id) => byId(id).reset());
    byId('igdIdEditLokal').value = '';
    byId('igdTanggal').value = today();
    byId('btnBatalEditIgdContainer').replaceChildren();
    populatePatientSelects();
  }

  async function deleteRecord(row) {
    if (!window.confirm(`Hapus data IGD untuk ${row.nama_pasien} (${row.no_rm}) secara permanen?`)) return;
    const { error } = await supabase.from('monitoring_igd').delete().eq('id', row.id);
    if (error) window.alert(`Gagal menghapus: ${error.message}`);
    else await refresh();
  }

  function showDetails(row) {
    window.alert([
      `Nama: ${row.nama_pasien || '-'}`, `No. RM: ${row.no_rm || '-'}`,
      `IBS: ${row.koordinasi_ibs || '-'}`, `Laboratorium: ${row.koordinasi_lab || '-'}`,
      `Radiologi: ${row.koordinasi_radiologi || '-'}`, `Fasilitasi: ${row.fasilitas || '-'}`,
      `Advokasi: ${row.advokasi || '-'}`, `Edukasi: ${row.edukasi || '-'}`
    ].join('\n'));
  }

  function fillEditFormsForStage(id, stage) {
    fillEditForms(id);
    const collapseId = { pelayanan: 'collapseTahap2', mpp: 'collapseTahap3', pindah: 'collapseTahap4' }[stage];
    if (collapseId) bootstrap.Collapse.getOrCreateInstance(byId(collapseId), { toggle: false }).show();
  }

  function handleDragStart(event) {
    const card = event.target.closest('[data-id][data-tahap]');
    if (!card) return;
    event.dataTransfer.setData('text/plain', JSON.stringify({ id: card.dataset.id, stage: card.dataset.tahap }));
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event) {
    const column = event.target.closest('.kanban-col');
    if (!column) return;
    event.preventDefault();
    column.classList.add('drag-over');
  }

  function handleDragLeave(event) {
    const column = event.target.closest('.kanban-col');
    if (column && !column.contains(event.relatedTarget)) column.classList.remove('drag-over');
  }

  function handleDrop(event) {
    const column = event.target.closest('.kanban-col');
    if (!column) return;
    event.preventDefault();
    column.classList.remove('drag-over');
    try {
      const { id, stage: fromStage } = JSON.parse(event.dataTransfer.getData('text/plain'));
      const toStage = column.dataset.tahap;
      if (id && toStage !== fromStage) {
        window.alert(`Lengkapi dan simpan form tahap ${toStage} untuk memindahkan pasien. Status tahap mengikuti data yang tersimpan.`);
        fillEditFormsForStage(id, toStage);
      }
    } catch { /* Ignore invalid drag payloads. */ }
  }

  function reportRoom(row) {
    const info = durationInfo(elapsed(row));
    openWhatsApp(`INFO STAGNASI IGD\n\nPasien ${row.nama_pasien} terinden ke ruang ${row.inden_bangsal}.\nDurasi tunggu: ${info.label}.\nMohon percepatan serah terima dan kesiapan bed.`);
  }

  function reportWaiting() {
    const waiting = records.filter((row) => !row.bangsal_tujuan).sort((a, b) => new Date(`${a.tanggal}T${a.jam_inden || a.jam_daftar || '00:00'}`) - new Date(`${b.tanggal}T${b.jam_inden || b.jam_daftar || '00:00'}`));
    if (!waiting.length) return window.alert('Tidak ada pasien yang sedang inden saat ini.');
    const lines = waiting.map((row, index) => `${index + 1}. ${row.nama_pasien} (RM: ${row.no_rm}) · Tujuan: ${row.inden_bangsal || '-'} · Tunggu: ${durationInfo(elapsed(row)).label} · Kendala: ${row.akar_masalah || 'Menunggu bed'}`);
    openWhatsApp(`LAPORAN STAGNASI IGD\nTanggal: ${new Date().toLocaleDateString('id-ID')}\nTotal pasien inden: ${waiting.length}\n\n${lines.join('\n')}`);
  }

  function openWhatsApp(message) {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }

  function toggleTv() {
    tvActive = !tvActive;
    const root = document.querySelector('.igd-module');
    root.classList.toggle('igd-tv-mode', tvActive);
    byId('btnTvMode').innerHTML = tvActive ? '<i class="fas fa-compress me-1"></i>Keluar TV' : '<i class="fas fa-tv me-1"></i>Mode TV Monitor';
    if (tvActive) {
      lastCriticalCount = records.filter((row) => !row.bangsal_tujuan && elapsed(row) >= 240).length;
      document.documentElement.requestFullscreen?.().catch(() => {});
      tvRefreshTimer = window.setInterval(refresh, 60000);
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      if (tvRefreshTimer) window.clearInterval(tvRefreshTimer);
      tvRefreshTimer = null;
    }
  }

  window.addEventListener('mppcare:session-ready', handleSession);
  if (window.currentMppcareRole) {
    role = window.currentMppcareRole;
    mount();
  }
})();
