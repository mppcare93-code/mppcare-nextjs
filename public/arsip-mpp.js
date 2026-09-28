(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum arsip-mpp.js.');

  let completedRows = [];
  let activeFollowUpId = null;

  function splitDpjpNames(value) {
    return String(value || '').split(/,\s*(?=dr\.)/i).map((name) => name.trim()).filter(Boolean);
  }

  function setOptions(select, values, placeholder) {
    if (!select) return;
    const selected = select.value;
    const uniqueValues = [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'id'));
    select.replaceChildren(new Option(placeholder, 'SEMUA'));
    uniqueValues.forEach((value) => select.add(new Option(value, value)));
    select.value = uniqueValues.includes(selected) ? selected : 'SEMUA';
  }

  function populateFilters() {
    setOptions(document.getElementById('filterPetugasMpp'), completedRows.map((item) => item.nama_petugas_mpp), 'Semua Petugas');
    setOptions(
      document.getElementById('filterDpjp'),
      completedRows.flatMap((item) => splitDpjpNames(item.activation.dpjp)),
      'Semua DPJP'
    );
  }

  function reportLoadError(body, message) {
    completedRows = [];
    app.setAlert('archiveAlert', `Riwayat tidak dapat dimuat: ${message}`);
    body.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Gagal memuat riwayat.</td></tr>';
  }

  async function loadHistory(activations) {
    const body = document.getElementById('tabelRiwayatDashboard');
    if (!body) return;
    const pageSize = 1000;
    const history = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await app.supabase.from('tindak_lanjut_mpp')
        .select('id,aktivasi_mpp_id,tanggal_tl,nama_petugas_mpp,analisis_informasi,plan_of_care,keterangan')
        .order('tanggal_tl', { ascending: false }).order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        reportLoadError(body, error.message);
        return;
      }
      history.push(...(data || []));
      if ((data || []).length < pageSize) break;
    }

    const activationIds = [...new Set(history.map((item) => item.aktivasi_mpp_id).filter(Boolean))];
    const knownIds = new Set(activations.map((activation) => activation.id));
    const missingIds = activationIds.filter((id) => !knownIds.has(id));
    const additionalActivations = [];
    for (let offset = 0; offset < missingIds.length; offset += 200) {
      const { data, error } = await app.supabase.from('aktivasi_mpp')
        .select('id,nama_pasien,no_rm,ruang,dpjp,mpp_tujuan')
        .in('id', missingIds.slice(offset, offset + 200));
      if (error) {
        reportLoadError(body, error.message);
        return;
      }
      additionalActivations.push(...(data || []));
    }
    const visibleActivations = [...activations, ...additionalActivations]
      .filter((activation) => app.state.role !== 'mpp' || activation.mpp_tujuan === app.state.mppTarget);
    completedRows = history.map((item) => ({
      ...item,
      activation: visibleActivations.find((activation) => activation.id === item.aktivasi_mpp_id)
    })).filter((item) => item.activation);
    populateFilters();
    renderHistory();
  }

  function renderHistory() {
    const body = document.getElementById('tabelRiwayatDashboard');
    if (!body) return;
    const staffFilter = document.getElementById('filterPetugasMpp')?.value || 'SEMUA';
    const dpjpFilter = document.getElementById('filterDpjp')?.value || 'SEMUA';
    const startDate = document.getElementById('filterTglMulai')?.value || '';
    const endDate = document.getElementById('filterTglAkhir')?.value || '';
    const rows = completedRows.filter((item) => {
      const dpjpNames = splitDpjpNames(item.activation.dpjp);
      return (staffFilter === 'SEMUA' || item.nama_petugas_mpp === staffFilter)
        && (dpjpFilter === 'SEMUA' || dpjpNames.includes(dpjpFilter))
        && (!startDate || item.tanggal_tl >= startDate)
        && (!endDate || item.tanggal_tl <= endDate);
    });

    body.replaceChildren();
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'text-center text-muted py-4';
      cell.textContent = 'Tidak ada riwayat sesuai filter.';
      row.append(cell);
      body.append(row);
      return;
    }

    rows.forEach((item) => {
      const row = document.createElement('tr');
      const analysis = Array.isArray(item.analisis_informasi) ? item.analisis_informasi.join(', ') : item.analisis_informasi;
      [item.tanggal_tl, item.activation.nama_pasien, item.activation.no_rm, item.activation.ruang, item.nama_petugas_mpp, item.activation.dpjp, analysis].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value || '-';
        row.append(cell);
      });
      const actionCell = document.createElement('td');
      actionCell.className = 'text-center';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-primary';
      button.dataset.followupId = item.id;
      button.innerHTML = '<i class="fas fa-eye me-1"></i>Detail';
      actionCell.append(button);
      row.append(actionCell);
      body.append(row);
    });
  }

  function updateFollowUpActions() {
    const deleteButton = document.getElementById('deleteFollowUpButton');
    if (!deleteButton) return;
    deleteButton.classList.toggle('d-none', app.state.role !== 'mpp' || !activeFollowUpId);
  }

  function showFollowUpDetail(id) {
    const item = completedRows.find((row) => row.id === id);
    if (!item) return;
    activeFollowUpId = id;
    const analysis = Array.isArray(item.analisis_informasi) ? item.analisis_informasi.join('\n') : item.analisis_informasi;
    document.getElementById('teksModalAnalisis').textContent = analysis || 'Belum diisi';
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
      app.setAlert('archiveAlert', 'Tindak lanjut berhasil dihapus.', 'success');
      activeFollowUpId = null;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetailMpp')).hide();
      await app.refreshData();
    } catch (error) {
      app.setAlert('archiveAlert', `Hapus tindak lanjut gagal: ${error.message}`);
    }
  }

  function mount() {
    document.getElementById('terapkanFilterRiwayat')?.addEventListener('click', renderHistory);
    document.getElementById('resetFilterRiwayat')?.addEventListener('click', () => {
      document.getElementById('filterTglMulai').value = '';
      document.getElementById('filterTglAkhir').value = '';
      document.getElementById('filterPetugasMpp').value = 'SEMUA';
      document.getElementById('filterDpjp').value = 'SEMUA';
      renderHistory();
    });
    document.getElementById('tabelRiwayatDashboard')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-followup-id]');
      if (button) showFollowUpDetail(button.dataset.followupId);
    });
    document.getElementById('deleteFollowUpButton')?.addEventListener('click', deleteCurrentFollowUp);
    document.getElementById('refreshArchiveButton')?.addEventListener('click', () => app.refreshData());
  }

  app.modules.arsipMpp = { mount, onActivations: loadHistory };
})();