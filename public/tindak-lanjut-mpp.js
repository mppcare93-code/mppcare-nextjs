(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum tindak-lanjut-mpp.js.');
  const supabase = app.supabase;
  let wired = false;

  function mount({ role, user }) {
    if (!app.canMpp(role) || wired) return;
    const form = document.getElementById('formMPP');
    if (!form) return;
    wired = true;
    document.getElementById('mppTanggalTL').value = app.today();
    const name = user.user_metadata?.full_name || user.app_metadata?.nama_petugas || user.email || '';
    document.getElementById('mppNamaPetugas').value = name;
    document.getElementById('mppNamaAkun').textContent = name;
    document.getElementById('selectPasienMPP').addEventListener('change', (event) => {
      document.getElementById('mppIdUnik').value = event.target.value;
    });
    form.addEventListener('submit', saveFollowUp);
  }

  function onActivations(activations) {
    const select = document.getElementById('selectPasienMPP');
    if (!select || !app.canMpp(app.state.role)) return;
    const selectedId = select.value;
    const pending = activations.filter((row) => row.status === 'Menunggu');
    select.replaceChildren(new Option('Pilih pasien menunggu', ''));
    pending.forEach((row) => select.add(new Option(`${row.nama_pasien || '-'} (${row.no_rm || '-'})`, row.id)));
    if (pending.some((row) => row.id === selectedId)) select.value = selectedId;
  }

  async function saveFollowUp(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const activationId = document.getElementById('mppIdUnik').value;
    if (!activationId) return app.setAlert('alertMPP', 'Pilih pasien terlebih dahulu.');
    const selected = [...document.getElementById('mppAnalisisInformasi').selectedOptions].map((option) => option.value);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('simpan_tindak_lanjut_mpp', {
        p_aktivasi_mpp_id: activationId,
        p_tanggal_tl: document.getElementById('mppTanggalTL').value,
        p_nama_petugas_mpp: document.getElementById('mppNamaPetugas').value.trim(),
        p_analisis_informasi: selected,
        p_plan_of_care: document.getElementById('mppPlanOfCare').value.trim(),
        p_keterangan: document.getElementById('mppKeterangan').value.trim() || null
      });
      if (error) throw error;
      app.setAlert('alertMPP', 'Tindak lanjut tersimpan; status aktivasi menjadi Selesai.', 'success');
      form.reset();
      document.getElementById('mppIdUnik').value = '';
      document.getElementById('mppTanggalTL').value = app.today();
      await app.refreshData();
    } catch (error) {
      app.setAlert('alertMPP', error.message);
    } finally {
      button.disabled = false;
    }
  }

  app.modules.tindakLanjutMpp = { mount, onActivations };
})();
