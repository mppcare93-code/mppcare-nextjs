(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum form-ppa.js.');
  const supabase = app.supabase;
  let wired = false;

  function mount({ role }) {
    if (!app.canPpa(role) || wired) return;
    const form = document.getElementById('formPPA');
    if (!form) return;
    wired = true;
    document.getElementById('tglAktivasi').value = app.today();
    document.getElementById('tglMasukRS').value = app.today();
    document.getElementById('nomorRM').addEventListener('blur', lookupPreviousPatient);
    form.addEventListener('submit', saveActivation);
  }

  async function lookupPreviousPatient() {
    const rm = document.getElementById('nomorRM').value.trim();
    const status = document.getElementById('statusCariPpaRm');
    if (!rm) return;
    if (status) status.textContent = 'Mencari rekam medis...';
    try {
      const { data, error } = await supabase.from('aktivasi_mpp')
        .select('nama_pasien,jenis_pembiayaan,usia,diagnosa,dpjp')
        .eq('no_rm', rm).order('waktu_input', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        const name = document.getElementById('namaPasien');
        const payer = document.getElementById('jenisPembiayaan');
        const age = document.getElementById('usia');
        if (!name.value) name.value = data.nama_pasien || '';
        if (!payer.value && data.jenis_pembiayaan) payer.value = data.jenis_pembiayaan;
        if (!age.value && data.usia != null) age.value = data.usia;
        if (status) status.textContent = 'Data pasien ditemukan dari aktivasi sebelumnya; periksa sebelum simpan.';
      } else if (status) {
        status.textContent = 'Belum ada aktivasi sebelumnya untuk nomor RM ini.';
      }
    } catch (error) {
      if (status) status.textContent = `Pencarian RM gagal: ${error.message}`;
    }
  }

  async function saveActivation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const row = {
      mpp_tujuan: form.querySelector('[name="pilihanMPP"]:checked')?.value,
      ruang: document.getElementById('ruang').value,
      nama_pelapor: document.getElementById('namaPPA').value.trim(),
      tgl_aktivasi: document.getElementById('tglAktivasi').value,
      tgl_masuk_rs: document.getElementById('tglMasukRS').value,
      nama_pasien: document.getElementById('namaPasien').value.trim(),
      no_rm: document.getElementById('nomorRM').value.trim(),
      usia: Number(document.getElementById('usia').value),
      jenis_pembiayaan: document.getElementById('jenisPembiayaan').value,
      diagnosa: document.getElementById('diagnosa').value.trim(),
      dpjp: [...document.getElementById('dpjp').selectedOptions].map((option) => option.value).join(', '),
      data_informasi: document.getElementById('dataInformasi').value.trim(),
      status: 'Menunggu'
    };
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await supabase.from('aktivasi_mpp').insert(row);
      if (error) throw error;
      app.setAlert('alertPPA', 'Aktivasi berhasil disimpan.', 'success');
      form.reset();
      document.getElementById('radioPriyo').checked = true;
      document.getElementById('tglAktivasi').value = app.today();
      document.getElementById('tglMasukRS').value = app.today();
      await app.refreshData();
    } catch (error) {
      app.setAlert('alertPPA', error.message);
    } finally {
      button.disabled = false;
    }
  }

  app.modules.formPpa = { mount };
})();
