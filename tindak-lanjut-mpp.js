(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum tindak-lanjut-mpp.js.');
  const supabase = app.supabase;
  let wired = false;

  function mount({ role, user }) {
    if (!app.canMpp(role) || wired) return;
    const form = document.getElementById('formMPP');
    const tanggalTL = document.getElementById('mppTanggalTL');
    const namaPetugas = document.getElementById('mppNamaPetugas');
    const namaAkun = document.getElementById('mppNamaAkun');
    const selectPasien = document.getElementById('selectPasienMPP');
    const mppIdUnik = document.getElementById('mppIdUnik');
    if (!form || !tanggalTL || !namaPetugas || !namaAkun || !selectPasien || !mppIdUnik) return;
    wired = true;
    tanggalTL.value = app.today();
    const name = user.user_metadata?.full_name || user.app_metadata?.nama_petugas || user.email || '';
    namaPetugas.value = name;
    namaAkun.textContent = name;
    selectPasien.addEventListener('change', (event) => {
      mppIdUnik.value = event.target.value;
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
    const tanggalTL = document.getElementById('mppTanggalTL');
    const namaPetugas = document.getElementById('mppNamaPetugas');
    const mppIdUnik = document.getElementById('mppIdUnik');
    const analisisInformasi = document.getElementById('mppAnalisisInformasi');
    const planOfCare = document.getElementById('mppPlanOfCare');
    const keterangan = document.getElementById('mppKeterangan');

    if (!form || !tanggalTL || !namaPetugas || !mppIdUnik || !analisisInformasi || !planOfCare || !keterangan) {
      app.setAlert('alertMPP', 'Form tindak lanjut belum siap. Muat ulang halaman lalu coba lagi.');
      return;
    }

    const activationId = mppIdUnik.value;
    if (!activationId) return app.setAlert('alertMPP', 'Pilih pasien terlebih dahulu.');
    const selected = [...analisisInformasi.selectedOptions].map((option) => option.value);
    if (selected.length === 0 || !planOfCare.value.trim() || !keterangan.value.trim()) {
      app.setAlert('alertMPP', 'Analisis informasi, plan of care, dan keterangan wajib diisi.');
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('simpan_tindak_lanjut_mpp', {
        p_aktivasi_mpp_id: activationId,
        p_tanggal_tl: tanggalTL.value,
        p_nama_petugas_mpp: namaPetugas.value.trim(),
        p_analisis_informasi: selected,
        p_plan_of_care: planOfCare.value.trim(),
        p_keterangan: keterangan.value.trim() || null
      });
      if (error) throw error;
      app.setAlert('alertMPP', 'Tindak lanjut tersimpan; status aktivasi menjadi Selesai.', 'success');
      form.reset();
      mppIdUnik.value = '';
      tanggalTL.value = app.today();
      await app.refreshData();
    } catch (error) {
      app.setAlert('alertMPP', error.message);
    } finally {
      button.disabled = false;
    }
  }

  app.modules.tindakLanjutMpp = { mount, onActivations };
})();
