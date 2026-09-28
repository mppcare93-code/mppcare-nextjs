(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum form-a.js.');
  const supabase = app.supabase;
  let wired = false;

  function mount({ role }) {
    if (!app.canMpp(role) || wired) return;
    const area = document.getElementById('areaPrintFormA');
    if (!area) return;
    wired = true;
    document.getElementById('selectPasienFormA').addEventListener('change', loadSelectedActivation);
    document.getElementById('btnPilihPasienFormA').addEventListener('click', openPatientPicker);
    document.getElementById('btnSimpanDataFormA').addEventListener('click', saveFormA);
    document.getElementById('btnBukaDataFormA').addEventListener('click', showSavedForms);
    document.getElementById('btnCetakFormA').addEventListener('click', exportFormA);
    document.getElementById('btnHapusTtdFormA').addEventListener('click', clearSignature);
    document.getElementById('bodyTableTersimpan').addEventListener('click', (event) => {
      const button = event.target.closest('[data-form-id]');
      if (button) loadFormA(button.dataset.formId);
    });
    document.getElementById('filterNamaFormA')?.addEventListener('input', renderPatientPickerRows);
    document.getElementById('filterRmFormA')?.addEventListener('input', renderPatientPickerRows);
    wireSignaturePad();
  }

  function getCompletedActivations() {
    return (app.state.activations || []).filter((row) => row.status === 'Selesai');
  }

  function renderPatientPickerRows() {
    const body = document.getElementById('bodyPilihPasienFormA');
    if (!body) return;
    const queryNama = (document.getElementById('filterNamaFormA')?.value || '').trim().toLowerCase();
    const queryRm = (document.getElementById('filterRmFormA')?.value || '').trim().toLowerCase();
    const rows = getCompletedActivations().filter((row) => {
      const nama = (row.nama_pasien || '').toLowerCase();
      const rm = (row.no_rm || '').toLowerCase();
      return (!queryNama || nama.includes(queryNama)) && (!queryRm || rm.includes(queryRm));
    });
    body.replaceChildren();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Tidak ada pasien yang sudah selesai di-TL sesuai filter.</td></tr>';
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const nama = document.createElement('td');
      nama.textContent = row.nama_pasien || '-';
      const rm = document.createElement('td');
      rm.textContent = row.no_rm || '-';
      const ruang = document.createElement('td');
      ruang.textContent = row.ruang || '-';
      const tujuan = document.createElement('td');
      tujuan.textContent = row.mpp_tujuan || '-';
      const action = document.createElement('td');
      action.className = 'text-center';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-primary';
      button.textContent = 'Pilih';
      button.addEventListener('click', () => {
        const select = document.getElementById('selectPasienFormA');
        if (!select) return;
        select.value = row.id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPilihPasienFormA')).hide();
      });
      action.append(button);
      tr.append(nama, rm, ruang, tujuan, action);
      body.append(tr);
    });
  }

  function openPatientPicker() {
    renderPatientPickerRows();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalPilihPasienFormA')).show();
  }

  function onActivations(activations) {
    const select = document.getElementById('selectPasienFormA');
    if (!select || !app.canMpp(app.state.role)) return;
    const selectedId = select.value;
    const completed = activations.filter((row) => row.status === 'Selesai');
    select.replaceChildren(new Option('Pilih pasien', ''));
    completed.forEach((row) => select.add(new Option(`${row.nama_pasien || '-'} (${row.no_rm || '-'})`, row.id)));
    if (completed.some((row) => row.id === selectedId)) select.value = selectedId;
    renderPatientPickerRows();
  }

  async function loadSelectedActivation(event) {
    const activationId = event.target.value;
    if (!activationId) {
      document.getElementById('fa_record_id').value = '';
      document.getElementById('fa_aktivasi_id').value = '';
      document.getElementById('fa_nama').textContent = '';
      document.getElementById('fa_rm').textContent = '';
      return;
    }
    const { data, error } = await supabase.from('aktivasi_mpp')
      .select('nama_pasien,no_rm,tgl_masuk_rs').eq('id', activationId).maybeSingle();
    if (error) return app.setAlert('alertFormA', error.message);
    if (!data) return;
    const result = await supabase.from('tindak_lanjut_mpp')
      .select('tanggal_tl,nama_petugas_mpp').eq('aktivasi_mpp_id', activationId).maybeSingle();
    if (result.error) return app.setAlert('alertFormA', result.error.message);
    document.getElementById('fa_record_id').value = '';
    document.getElementById('fa_aktivasi_id').value = activationId;
    document.getElementById('fa_nama').textContent = data.nama_pasien || '';
    document.getElementById('fa_rm').textContent = data.no_rm || '';
    document.getElementById('fa_tgl_mrs').value = formatDate(data.tgl_masuk_rs);
    document.getElementById('fa_tgl_kaji').value = formatDate(result.data?.tanggal_tl || app.today());
    if (result.data?.nama_petugas_mpp) {
      const select = document.getElementById('fa_nama_mpp_ttd');
      const option = [...select.options].find((item) => item.value.includes(result.data.nama_petugas_mpp));
      if (option) select.value = option.value;
    }
  }

  function parseDate(value) {
    const text = value.trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  function formatDate(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }

  function parseTime(value) {
    const text = value.trim();
    if (!text) return null;
    return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text) ? text : null;
  }

  function serializeSection(group) {
    const checked = [...document.querySelectorAll(`#areaPrintFormA [data-group="${group}"][type="checkbox"]:checked`)].map((el) => el.value);
    const radios = [...document.querySelectorAll('#areaPrintFormA input[type="radio"]:checked')]
      .filter(() => group === 'B')
      .reduce((result, el) => ({ ...result, [el.name]: el.value }), {});
    const extras = [...document.querySelectorAll(`#areaPrintFormA [data-extra-group="${group}"]`)]
      .reduce((result, el) => ({ ...result, [el.dataset.extraKey]: el.value }), {});
    return JSON.stringify({ checked, radios, extras });
  }

  function applySection(group, raw) {
    let value;
    try { value = JSON.parse(raw || '{}'); } catch { value = {}; }
    const checked = new Set(value.checked || []);
    document.querySelectorAll(`#areaPrintFormA [data-group="${group}"][type="checkbox"]`).forEach((el) => { el.checked = checked.has(el.value); });
    document.querySelectorAll(`#areaPrintFormA [data-extra-group="${group}"]`).forEach((el) => { el.value = value.extras?.[el.dataset.extraKey] || ''; });
    for (const [name, selected] of Object.entries(value.radios || {})) {
      const radio = document.querySelector(`#areaPrintFormA input[type="radio"][name="${CSS.escape(name)}"][value="${CSS.escape(selected)}"]`);
      if (radio) radio.checked = true;
    }
  }

  async function saveFormA() {
    const nama = document.getElementById('fa_nama').textContent.trim();
    const rm = document.getElementById('fa_rm').textContent.trim();
    const activationId = document.getElementById('fa_aktivasi_id').value;
    if (!activationId || !nama || !rm) return app.setAlert('alertFormA', 'Pilih pasien dari aktivasi sebelum menyimpan Form A.');
    for (const id of ['fa_tgl_lahir', 'fa_tgl_mrs', 'fa_tgl_kaji']) {
      const value = document.getElementById(id).value;
      if (value && !parseDate(value)) return app.setAlert('alertFormA', 'Format tanggal harus DD/MM/YYYY atau YYYY-MM-DD.');
    }
    for (const id of ['fa_jam_mrs', 'fa_jam_kaji']) {
      const value = document.getElementById(id).value;
      if (value && !parseTime(value)) return app.setAlert('alertFormA', 'Format jam harus HH:MM atau HH:MM:SS.');
    }
    const row = {
      aktivasi_mpp_id: activationId,
      nama_pasien: nama,
      nomor_rm: rm,
      tgl_lahir: parseDate(document.getElementById('fa_tgl_lahir').value),
      tgl_mrs: parseDate(document.getElementById('fa_tgl_mrs').value),
      tgl_pengkajian: parseDate(document.getElementById('fa_tgl_kaji').value),
      jam_mrs: parseTime(document.getElementById('fa_jam_mrs').value),
      jam_pengkajian: parseTime(document.getElementById('fa_jam_kaji').value),
      bagian_a_skrining: serializeSection('A'),
      bagian_b_asesmen: serializeSection('B'),
      bagian_c_masalah: serializeSection('C'),
      bagian_d_sasaran: serializeSection('D'),
      bagian_e_perencanaan: serializeSection('E'),
      nama_mpp_ttd: document.getElementById('fa_nama_mpp_ttd').value || null,
      ttd_mpp_data_url: getSignatureDataUrl()
    };
    const id = document.getElementById('fa_record_id').value;
    try {
      const result = id
        ? await supabase.from('form_a_mpp').update(row).eq('id', id)
        : await supabase.from('form_a_mpp').insert(row).select('id').single();
      if (result.error) throw result.error;
      if (!id && result.data?.id) document.getElementById('fa_record_id').value = result.data.id;
      app.setAlert('alertFormA', 'Form A berhasil disimpan.', 'success');
    } catch (error) {
      app.setAlert('alertFormA', error.message);
    }
  }

  async function showSavedForms() {
    const body = document.getElementById('bodyTableTersimpan');
    body.replaceChildren();
    const { data, error } = await supabase.from('form_a_mpp')
      .select('id,waktu_simpan,nama_pasien,nomor_rm').order('waktu_simpan', { ascending: false }).limit(100);
    if (error) return app.setAlert('alertFormA', error.message);
    (data || []).forEach((record) => {
      const tr = document.createElement('tr');
      [new Date(record.waktu_simpan).toLocaleString('id-ID'), record.nama_pasien, record.nomor_rm].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value || '-';
        tr.append(td);
      });
      const action = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-primary';
      button.dataset.formId = record.id;
      button.textContent = 'Buka';
      action.append(button);
      tr.append(action);
      body.append(tr);
    });
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDataTersimpan')).show();
  }

  async function loadFormA(id) {
    const { data, error } = await supabase.from('form_a_mpp').select('*').eq('id', id).single();
    if (error) return app.setAlert('alertFormA', error.message);
    document.getElementById('fa_record_id').value = data.id;
    document.getElementById('fa_aktivasi_id').value = data.aktivasi_mpp_id || '';
    document.getElementById('fa_nama').textContent = data.nama_pasien || '';
    document.getElementById('fa_rm').textContent = data.nomor_rm || '';
    document.getElementById('fa_tgl_lahir').value = formatDate(data.tgl_lahir);
    document.getElementById('fa_tgl_mrs').value = formatDate(data.tgl_mrs);
    document.getElementById('fa_tgl_kaji').value = formatDate(data.tgl_pengkajian);
    document.getElementById('fa_jam_mrs').value = data.jam_mrs || '';
    document.getElementById('fa_jam_kaji').value = data.jam_pengkajian || '';
    document.getElementById('fa_nama_mpp_ttd').value = data.nama_mpp_ttd || '';
    clearSignature();
    if (data.ttd_mpp_data_url) {
      const signature = new Image();
      signature.onload = () => document.getElementById('sigCanvas').getContext('2d').drawImage(signature, 0, 0);
      signature.src = data.ttd_mpp_data_url;
    }
    ['A', 'B', 'C', 'D', 'E'].forEach((section) => applySection(section, data[`bagian_${section.toLowerCase()}_${({ A: 'skrining', B: 'asesmen', C: 'masalah', D: 'sasaran', E: 'perencanaan' })[section]}`]));
    document.getElementById('selectPasienFormA').value = data.aktivasi_mpp_id || '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDataTersimpan')).hide();
    app.setAlert('alertFormA', 'Form A tersimpan dimuat.', 'success');
  }

  function exportFormA() {
    if (!window.html2pdf) return app.setAlert('alertFormA', 'Library PDF belum dimuat.');
    const paper = document.getElementById('selectUkuranCetakFormA')?.value || 'A4';
    const isF4 = paper === 'F4';
    const area = document.getElementById('areaPrintFormA');
    if (!area) return;

    area.style.width = '100%';
    area.style.maxWidth = '100%';
    area.style.boxSizing = 'border-box';

    window.html2pdf().set({
      margin: isF4 ? { top: 8, right: 7, bottom: 8, left: 7 } : { top: 6, right: 6, bottom: 6, left: 6 },
      filename: `Form-A-${(document.getElementById('fa_rm').textContent || 'pasien').replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: {
        unit: 'mm',
        format: isF4 ? [210, 330] : 'a4',
        orientation: 'portrait'
      }
    }).from(area).save();
  }

  function wireSignaturePad() {
    const canvas = document.getElementById('sigCanvas');
    const context = canvas.getContext('2d');
    context.strokeStyle = '#173d35';
    context.lineWidth = 2;
    context.lineCap = 'round';
    let drawing = false;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
    };
    canvas.addEventListener('pointerdown', (event) => { drawing = true; canvas.setPointerCapture?.(event.pointerId); const pos = point(event); context.beginPath(); context.moveTo(pos.x, pos.y); });
    canvas.addEventListener('pointermove', (event) => { if (drawing) { const pos = point(event); context.lineTo(pos.x, pos.y); context.stroke(); } });
    ['pointerup', 'pointercancel'].forEach((name) => canvas.addEventListener(name, () => { drawing = false; }));
  }

  function clearSignature() {
    const canvas = document.getElementById('sigCanvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  function getSignatureDataUrl() {
    const canvas = document.getElementById('sigCanvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) return canvas.toDataURL('image/png');
    return null;
  }

  app.modules.formA = { mount, onActivations };
})();
