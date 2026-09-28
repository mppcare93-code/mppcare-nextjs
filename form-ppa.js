(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum form-ppa.js.');
  const supabase = app.supabase;
  let wired = false;

  function mount({ role }) {
    if (!app.canPpa(role) || wired) return;
    const form = document.getElementById('formPPA');
    const ruangAktivasi = document.getElementById('ruangAktivasi');
    const tglAktivasi = document.getElementById('tglAktivasi');
    const tglMasukRS = document.getElementById('tglMasukRS');
    const nomorRM = document.getElementById('nomorRM');
    if (!form || !ruangAktivasi || !tglAktivasi || !tglMasukRS || !nomorRM) return;
    wired = true;
    ruangAktivasi.textContent = app.state.room || 'Akun belum memiliki ruangan';
    tglAktivasi.value = app.today();
    tglMasukRS.value = app.today();
    nomorRM.addEventListener('blur', lookupPreviousPatient);
    form.addEventListener('submit', saveActivation);
  }

  async function lookupPreviousPatient() {
    const nomorRM = document.getElementById('nomorRM');
    const status = document.getElementById('statusCariPpaRm');
    const rm = nomorRM?.value?.trim() || '';
    if (!nomorRM || !rm) return;
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
        if (name && !name.value) name.value = data.nama_pasien || '';
        if (payer && !payer.value && data.jenis_pembiayaan) payer.value = data.jenis_pembiayaan;
        if (age && !age.value && data.usia != null) age.value = data.usia;
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
    const namaPPA = document.getElementById('namaPPA');
    const tglAktivasi = document.getElementById('tglAktivasi');
    const tglMasukRS = document.getElementById('tglMasukRS');
    const namaPasien = document.getElementById('namaPasien');
    const nomorRM = document.getElementById('nomorRM');
    const usia = document.getElementById('usia');
    const jenisPembiayaan = document.getElementById('jenisPembiayaan');
    const diagnosa = document.getElementById('diagnosa');
    const dpjp = document.getElementById('dpjp');
    const dataInformasi = document.getElementById('dataInformasi');
    const radioPriyo = document.getElementById('radioPriyo');

    if (!form || !namaPPA || !tglAktivasi || !tglMasukRS || !namaPasien || !nomorRM || !usia || !jenisPembiayaan || !diagnosa || !dpjp || !dataInformasi) {
      app.setAlert('alertPPA', 'Form aktivasi belum siap. Muat ulang halaman lalu coba lagi.');
      return;
    }

    const selectedMppRadio = [...document.querySelectorAll('input[name="pilihanMPP"]')].find((input) => input.checked)
      ?? (document.getElementById('radioPriyo')?.checked ? document.getElementById('radioPriyo') : document.getElementById('radioArum')?.checked ? document.getElementById('radioArum') : null);

    const row = {
      mpp_tujuan: selectedMppRadio?.value ?? null,
      ruang: app.state.room,
      nama_pelapor: namaPPA.value.trim(),
      tgl_aktivasi: tglAktivasi.value,
      tgl_masuk_rs: tglMasukRS.value,
      nama_pasien: namaPasien.value.trim(),
      no_rm: nomorRM.value.trim(),
      usia: Number(usia.value),
      jenis_pembiayaan: jenisPembiayaan.value,
      diagnosa: diagnosa.value.trim(),
      dpjp: [...dpjp.selectedOptions].map((option) => option.value).join(', '),
      data_informasi: dataInformasi.value.trim(),
      status: 'Menunggu'
    };
    if (!row.mpp_tujuan) {
      app.setAlert('alertPPA', 'Pilih tujuan MPP terlebih dahulu.');
      return;
    }
    if (!row.nama_pelapor || !row.tgl_aktivasi || !row.tgl_masuk_rs || !row.nama_pasien || !row.no_rm || !row.jenis_pembiayaan || !row.diagnosa || !row.data_informasi || Number.isNaN(row.usia)) {
      app.setAlert('alertPPA', 'Semua field wajib diisi sebelum mengirim aktivasi.');
      return;
    }
    if (!row.ruang) {
      app.setAlert('alertPPA', 'Akun ini belum memiliki ruangan yang ditetapkan. Hubungi administrator.');
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await supabase.from('aktivasi_mpp').insert(row);
      if (error) throw error;
      app.setAlert('alertPPA', 'Aktivasi berhasil disimpan.', 'success');
      form.reset();
      if (radioPriyo) radioPriyo.checked = true;
      tglAktivasi.value = app.today();
      tglMasukRS.value = app.today();
      await app.refreshData();
    } catch (error) {
      app.setAlert('alertPPA', error.message);
    } finally {
      button.disabled = false;
    }
  }

  app.modules.formPpa = { mount };
})();
