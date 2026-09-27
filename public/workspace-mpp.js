(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum workspace-mpp.js.');

  function render(activations) {
    const body = document.getElementById('tabelAntrianWorkspace');
    if (!body) return;

    const pending = activations.filter((row) => row.status === 'Menunggu');
    body.replaceChildren();
    if (!pending.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.className = 'text-center text-muted py-4';
      cell.textContent = 'Belum ada pasien menunggu tindak lanjut.';
      row.append(cell);
      body.append(row);
      return;
    }

    pending.forEach((activation) => {
      const row = document.createElement('tr');
      [activation.tgl_aktivasi, activation.nama_pasien, activation.no_rm, activation.ruang, activation.nama_pelapor].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value || '-';
        row.append(cell);
      });
      const mppTarget = document.createElement('td');
      mppTarget.textContent = activation.mpp_tujuan || '-';
      row.append(mppTarget);
      const observation = document.createElement('td');
      observation.className = 'workspace-observation';
      observation.textContent = activation.data_informasi || '-';
      row.append(observation);
      const actionCell = document.createElement('td');
      actionCell.className = 'text-center';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-primary';
      button.dataset.activationId = activation.id;
      button.textContent = app.canMpp(app.state.role) ? 'Proses' : 'Detail';
      actionCell.append(button);
      if (['ppa', 'mpp', 'admin'].includes(app.state.role)) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-sm btn-outline-danger ms-1';
        deleteButton.dataset.deleteActivationId = activation.id;
        deleteButton.setAttribute('aria-label', `Hapus aktivasi ${activation.nama_pasien || ''}`);
        deleteButton.title = 'Hapus aktivasi duplikat';
        deleteButton.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
        actionCell.append(deleteButton);
      }
      row.append(actionCell);
      body.append(row);
    });
  }

  function handleActivationClick(event) {
    const deleteButton = event.target.closest('[data-delete-activation-id]');
    if (deleteButton) {
      deleteActivation(deleteButton.dataset.deleteActivationId);
      return;
    }
    const button = event.target.closest('[data-activation-id]');
    if (!button) return;
    const activation = app.state.activations.find((row) => row.id === button.dataset.activationId);
    if (!activation) return;
    if (!app.canMpp(app.state.role)) {
      window.alert(`${activation.nama_pasien} · RM ${activation.no_rm}\nStatus: ${activation.status}\nMPP tujuan: ${activation.mpp_tujuan}`);
      return;
    }

    const select = document.getElementById('selectPasienMPP');
    if (!select) return;
    select.value = activation.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('view-tindak-lanjut')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function deleteActivation(id) {
    const activation = app.state.activations.find((row) => row.id === id);
    if (!activation || activation.status !== 'Menunggu') {
      app.setAlert('workspaceAlert', 'Hanya aktivasi berstatus Menunggu yang dapat dihapus.', 'warning');
      return;
    }
    const confirmed = window.confirm(`Hapus aktivasi ${activation.nama_pasien || '-'} (RM ${activation.no_rm || '-'})? Data yang dihapus tidak dapat dipulihkan.`);
    if (!confirmed) return;

    const button = document.querySelector(`[data-delete-activation-id="${CSS.escape(id)}"]`);
    if (button) button.disabled = true;
    try {
      const { data, error } = await app.supabase.from('aktivasi_mpp')
        .delete().eq('id', id).eq('status', 'Menunggu').select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Data sudah berubah atau akun tidak memiliki izin menghapus aktivasi ini.');
      app.setAlert('workspaceAlert', `Aktivasi ${activation.nama_pasien || ''} berhasil dihapus.`, 'success');
      await app.refreshData();
    } catch (error) {
      app.setAlert('workspaceAlert', `Aktivasi gagal dihapus: ${error.message}`);
      if (button) button.disabled = false;
    }
  }

  function mount() {
    document.getElementById('tabelAntrianWorkspace')?.addEventListener('click', handleActivationClick);
    document.getElementById('refreshWorkspaceButton')?.addEventListener('click', () => app.refreshData());
  }

  app.modules.workspaceMpp = { mount, onActivations: render };
})();