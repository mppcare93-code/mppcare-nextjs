// PENTING: Gunakan URL dan Anon Key (Public), bukan Connection String (Password).
const SUPABASE_URL = window.__MPPCareConfig?.url || 'https://xjygwnkiccedymswpscf.supabase.co';
const SUPABASE_ANON_KEY = window.__MPPCareConfig?.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJJzdXBhYmFzZSIsInJlZiI6InhqeWd3bmtpY2NlZHltc3dwc2NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNzg5NTEsImV4cCI6MjEwNTk1NDk1MX0.I8XoUv9_ZwN3ek4paTuCnJQJWcoceTasEJvl8jQng8c';

if (!window.supabase?.createClient) {
  throw new Error('Supabase JS v2 harus dimuat sebelum supabase-igd.js.');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

window.simpanIgd = async function (data) {
  const alertDiv = document.getElementById('alertTahap1');
  const form = document.getElementById('formIgdTahap1');

  try {
    const row = {
      tanggal: data.tanggal || null,
      no_rm: data.noRM,
      nama_pasien: data.namaPasien,
      informed_consent: data.informedConsent,
      inden_bangsal: data.indenBangsal,
      jam_inden: data.jamInden || null,
      jaminan: data.jaminan,
      jam_daftar: data.jamDaftar || null,
    };

    const { error } = await supabaseClient.from('monitoring_igd').insert([row]);
    if (error) throw error;

    if (alertDiv) {
      alertDiv.className = 'alert mt-2 text-center fw-bold mb-0 alert-success';
      alertDiv.textContent = 'Data IGD berhasil disimpan.';
      alertDiv.classList.remove('d-none');
    }
    if (form) form.reset();

    return { success: true };
  } catch (error) {
    if (alertDiv) {
      alertDiv.className = 'alert mt-2 text-center fw-bold mb-0 alert-danger';
      alertDiv.textContent = `Gagal menyimpan data: ${error.message}`;
      alertDiv.classList.remove('d-none');
    }

    return { success: false, error };
  }
};
