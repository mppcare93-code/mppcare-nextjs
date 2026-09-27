'use client';

import { useEffect } from 'react';

function loadScript(src, readyCheck) {
  if (readyCheck()) return Promise.resolve();
  const existing = document.querySelector(`script[data-mppcare-src="${src}"]`);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.dataset.mppcareSrc = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Tidak dapat memuat ${src}`));
    document.body.appendChild(script);
  });
}

function startLegacyControllers() {
  if (window.__mppcareRuntimePromise) return window.__mppcareRuntimePromise;
  window.__MPPCareConfig = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  };
  window.__mppcareRuntimePromise = (async () => {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', () => Boolean(window.supabase?.createClient));
    await loadScript('https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js', () => Boolean(window.bootstrap));
    await loadScript('https://cdn.jsdelivr.net/npm/chart.js', () => Boolean(window.Chart));
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', () => Boolean(window.html2pdf));
    await loadScript('/app.js', () => Boolean(window.MPPCare));
  })();
  return window.__mppcareRuntimePromise;
}

export default function HomePage() {
  useEffect(() => {
    window.switchView = (viewId, element) => {
      document.querySelectorAll('.view-section').forEach((view) => {
        view.classList.add('d-none');
        view.classList.remove('active-view');
      });
      document.querySelectorAll('#sidebar .nav-link').forEach((link) => link.classList.remove('active'));
      const target = document.getElementById(viewId);
      target?.classList.remove('d-none');
      target?.classList.add('active-view');
      if (element?.classList.contains('nav-link')) element.classList.add('active');
    };

    const sidebarButton = document.getElementById('sidebarCollapse');
    const toggleSidebar = () => {
      document.getElementById('sidebar')?.classList.toggle('toggled');
      document.getElementById('content')?.classList.toggle('expanded');
    };
    sidebarButton?.addEventListener('click', toggleSidebar);
    if (window.matchMedia('(max-width: 800px)').matches) toggleSidebar();

    const dateLabel = document.getElementById('tanggalHariIni');
    if (dateLabel) dateLabel.textContent = ` · ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}`;
    startLegacyControllers().catch((error) => {
      const alert = document.getElementById('authAlert');
      if (alert) {
        alert.textContent = `Aplikasi gagal dimuat: ${error.message}`;
        alert.className = 'alert alert-danger';
      }
    });

    return () => sidebarButton?.removeEventListener('click', toggleSidebar);
  }, []);

  return (
    <>
      <section id="authGate" className="auth-gate" aria-labelledby="loginTitle">
        <form id="loginForm" className="auth-panel">
          <span className="brand-mark">MPP</span>
          <p className="eyebrow">RSUD MERAH PUTIH</p>
          <h1 id="loginTitle">Masuk ke MPPCare</h1>
          <p className="auth-copy">Pilih akun unit kerja dan masukkan password.</p>
          <div id="authAlert" className="alert d-none" role="alert" />
          <label htmlFor="loginAccount">Akun<select id="loginAccount" className="form-select" autoComplete="username" required defaultValue=""><option value="" disabled>-- Pilih akun --</option><optgroup label="Administrator"><option value="admin">Administrator</option></optgroup><optgroup label="Petugas MPP"><option value="mpp1">MPP 1</option><option value="mpp2">MPP 2</option></optgroup><optgroup label="Ruangan"><option value="igd">IGD</option><option value="icu-picu">ICU/PICU</option><option value="nicu">NICU</option><option value="borobudur-1a">BOROBUDUR 1A</option><option value="borobudur-1b">BOROBUDUR 1B</option><option value="borobudur-2">BOROBUDUR 2</option><option value="borobudur-3">BOROBUDUR 3</option><option value="candi-pawon">CANDI PAWON</option><option value="candi-ngawen">CANDI NGAWEN</option><option value="candi-selogriyo">CANDI SELOGRIYO</option><option value="candi-mendut">CANDI MENDUT</option><option value="ibs">IBS</option><option value="poliklinik">POLIKLINIK</option></optgroup></select></label>
          <label>Password<input id="loginPassword" className="form-control" type="password" autoComplete="current-password" required /></label>
          <button id="loginSubmit" className="btn btn-success w-100" type="submit">Masuk</button>
        </form>
      </section>

      <div className="app-shell d-none d-flex">
        <nav id="sidebar" className="text-white" aria-label="Navigasi utama">
          <div className="sidebar-header border-bottom border-warning border-3 p-4 text-center">
            <div className="d-flex justify-content-center align-items-center">
              <img src="https://i.ibb.co.com/Q3t8KyGV/logo.png" alt="Logo RS" className="me-3 drop-shadow sidebar-logo" />
              <div className="text-start"><h3 className="mb-0 fw-bold text-white"><span className="text-warning">MPP</span></h3><h5 className="mb-0 fw-bold text-white">Care</h5></div>
            </div>
          </div>
          <ul className="list-unstyled components mt-3">
            <li data-dashboard-nav><button className="nav-link active" type="button" onClick={(event) => window.switchView('view-dashboard', event.currentTarget)}><i className="fas fa-chart-pie" />Dashboard</button></li>
            <li data-role="ppa,admin"><button className="nav-link" type="button" onClick={(event) => window.switchView('view-form-ppa', event.currentTarget)}><i className="fas fa-file-medical" />Form Aktivasi PPA</button></li>
            <li data-role="mpp,admin"><button className="nav-link text-warning fw-bold" type="button" onClick={(event) => window.switchView('view-tindak-lanjut', event.currentTarget)}><i className="fas fa-user-md" />Tindak Lanjut MPP <i className="fas fa-lock ms-2 small" /></button></li>
            <li data-role="mpp,admin"><button className="nav-link text-info fw-bold" type="button" onClick={(event) => window.switchView('view-form-a', event.currentTarget)}><i className="fas fa-print" />Cetak Form A (MPP)</button></li>
            <li data-role="ppa,mpp,admin"><button className="nav-link" type="button" onClick={(event) => window.switchView('view-igd', event.currentTarget)}><i className="fas fa-ambulance" />Koordinasi Stagnasi IGD</button></li>
          </ul>
          <div className="mt-auto p-3 text-center border-top border-danger sidebar-developer"><small className="text-white-50 fw-bold">Developed by</small><br /><span className="text-white fw-bold">Daniel Ari Kristianto</span></div>
        </nav>

        <div id="content">
          <div className="top-navbar bg-white shadow-sm border-bottom border-primary">
            <button type="button" className="btn btn-outline-primary border-0 fs-4" id="sidebarCollapse" aria-label="Toggle sidebar"><i className="fas fa-bars" /></button>
            <h5 className="mb-0 fw-bold text-primary">Sistem Informasi MPP <span className="text-dark">RSUD Merah Putih</span></h5>
            <span id="userEmail" className="text-muted small ms-auto me-2" />
            <button id="logoutButton" className="btn btn-sm btn-outline-danger" type="button">Keluar</button>
          </div>

          <div className="container-fluid p-4">
            <section id="view-dashboard" className="view-section active-view" aria-labelledby="dashboard-title">
              <h3 id="dashboard-title" className="fw-bold text-primary mb-4 border-bottom border-primary pb-2"><i className="fas fa-chart-pie me-2" />Dashboard Analitik MPP <small id="tanggalHariIni" className="text-muted small fw-normal" /></h3>
              <div className="row mb-4">
                <div className="col-md-4 mb-3"><div className="card shadow-sm border-primary text-center p-4"><h1 className="text-primary fw-bold" id="dash-total">-</h1><span className="text-muted fw-bold">Total Pasien Diaktivasi</span></div></div>
                <div className="col-md-4 mb-3"><div className="card shadow-sm border-warning text-center p-4 bg-warning bg-opacity-10"><h1 className="text-warning fw-bold" id="dash-pending">-</h1><span className="text-dark fw-bold">Menunggu Tindak Lanjut</span></div></div>
                <div className="col-md-4 mb-3"><div className="card shadow-sm border-success text-center p-4 bg-success bg-opacity-10"><h1 className="text-success fw-bold" id="dash-selesai">-</h1><span className="text-dark fw-bold">Selesai Ditangani</span></div></div>
              </div>
              <div id="dashboardAlert" className="alert d-none" role="status" />
              <div className="row mb-4">
                <div className="col-lg-7 mb-3"><div className="card shadow-sm p-4 h-100 border-top border-primary border-4"><div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2 flex-wrap gap-2"><h6 className="fw-bold text-primary mb-0"><i className="fas fa-chart-bar me-2" />Distribusi Aktivasi &amp; Tren</h6><select id="pilihanGrafikDinamis" className="form-select form-select-sm border-primary fw-bold text-dark shadow-sm dashboard-chart-select"><option value="ruang">Bar: Distribusi Per Ruangan</option><option value="pembiayaan">Pie: Jenis Pembiayaan</option><option value="diagnosa">Bar: Diagnosa Terbanyak</option><option value="tren_mpp">Line: Tren Kinerja Petugas MPP</option></select></div><div className="dashboard-chart-wrap"><canvas id="chartDinamis" /></div></div></div>
                <div className="col-lg-5 mb-3"><div className="card shadow-sm p-4 h-100 border-top border-info border-4"><div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2"><h6 className="fw-bold text-info mb-0"><i className="fas fa-chart-pie me-2" />Analisis Informasi Pasien</h6><button className="btn btn-sm btn-info text-white fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#collapseKeteranganPie"><i className="fas fa-info-circle" /> Info</button></div><div className="dashboard-chart-wrap dashboard-chart-small"><canvas id="chartAnalisis" /></div><div className="collapse mt-3" id="collapseKeteranganPie"><div className="card card-body bg-light border-info border-2 small fw-semibold" id="tempatKeteranganPie">Distribusi alasan analisis dari tindak lanjut yang sudah tersimpan.</div></div></div></div>
              </div>
              <div className="card shadow-sm p-4 border-top border-warning border-4 mb-4"><div className="d-flex justify-content-between align-items-center mb-3"><h5 className="fw-bold text-warning mb-0"><i className="fas fa-list-alt me-2" />Antrian Pasien Membutuhkan Tindak Lanjut</h5><button id="refreshDashboardButton" className="btn btn-sm btn-outline-warning text-dark fw-bold" type="button"><i className="fas fa-sync-alt" /> Refresh Data</button></div><div className="table-responsive"><table className="table table-hover align-middle border"><thead className="table-light"><tr><th>Tgl Aktivasi</th><th>Nama Pasien</th><th>No. RM</th><th>Ruang Perawatan</th><th>Nama Pelapor (PPA)</th><th className="text-center">Aksi (Proses / Detail)</th></tr></thead><tbody id="tabelAntrianDashboard"><tr><td colSpan="6" className="text-center text-muted py-4">Memuat data antrian pasien...</td></tr></tbody></table></div></div>
              <div className="card shadow-sm p-4 border-top border-success border-4 mb-2"><div className="d-flex justify-content-between align-items-center mb-3"><h5 className="fw-bold text-success mb-0"><i className="fas fa-check-circle me-2" />Riwayat Pasien Selesai Ditindaklanjuti MPP</h5></div><div className="row mb-3 p-3 bg-light border border-success rounded align-items-end mx-0"><div className="col-md-3 mb-2 mb-md-0"><label htmlFor="filterPetugasMpp" className="form-label fw-bold text-success small mb-1">Filter Petugas MPP</label><select id="filterPetugasMpp" className="form-select form-select-sm border-success fw-semibold"><option value="SEMUA">Semua Petugas MPP</option><option value="PRIYO">Priyo Sulistiyono</option><option value="ARUM">Wahyu Dyah Setyaningrum</option></select></div><div className="col-md-3 mb-2 mb-md-0"><label htmlFor="filterTglMulai" className="form-label fw-bold text-success small mb-1">Mulai Tanggal</label><input id="filterTglMulai" type="date" className="form-control form-control-sm border-success" /></div><div className="col-md-3 mb-2 mb-md-0"><label htmlFor="filterTglAkhir" className="form-label fw-bold text-success small mb-1">Sampai Tanggal</label><input id="filterTglAkhir" type="date" className="form-control form-control-sm border-success" /></div><div className="col-md-3"><button id="terapkanFilterRiwayat" className="btn btn-sm btn-success w-100 fw-bold shadow-sm" type="button"><i className="fas fa-filter me-1" />Terapkan Filter</button></div></div><div className="table-responsive"><table className="table table-hover align-middle border"><thead className="table-light"><tr><th>Tgl TL</th><th>Nama Pasien</th><th>No. RM</th><th>Ruangan</th><th>Petugas MPP</th><th>Analisis Informasi</th><th className="text-center">Aksi / Detail</th></tr></thead><tbody id="tabelRiwayatDashboard"><tr><td colSpan="7" className="text-center text-muted py-4">Memuat riwayat intervensi MPP...</td></tr></tbody></table></div></div>
            </section>

            <section id="view-form-ppa" className="view-section d-none" aria-label="Form Aktivasi PPA" />
            <section id="view-tindak-lanjut" className="view-section d-none" aria-label="Tindak Lanjut MPP" />
            <section id="view-form-a" className="view-section d-none" aria-label="Cetak Form A" />
            <section id="view-igd" className="view-section d-none" aria-label="Koordinasi Stagnasi IGD" />
          </div>

          <div className="modal fade" id="modalDetailMpp" tabIndex="-1" aria-labelledby="modalDetailMppLabel" aria-hidden="true"><div className="modal-dialog modal-dialog-centered modal-lg"><div className="modal-content border-0 shadow-lg"><div className="modal-header bg-success text-white"><h5 className="modal-title fw-bold" id="modalDetailMppLabel"><i className="fas fa-file-medical-alt me-2" />Detail Tindak Lanjut MPP</h5><button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Tutup" /></div><div className="modal-body bg-light"><div className="card mb-3 border-success"><div className="card-header bg-success bg-opacity-10 text-success fw-bold">Analisis Informasi</div><div className="card-body"><p id="teksModalAnalisis" className="mb-0 text-dark small" style={{ whiteSpace: 'pre-wrap' }} /></div></div><div className="card mb-3 border-primary"><div className="card-header bg-primary bg-opacity-10 text-primary fw-bold">Plan of Care MPP</div><div className="card-body"><p id="teksModalPlanOfCare" className="mb-0 text-dark" style={{ whiteSpace: 'pre-wrap' }} /></div></div><p id="teksModalKeterangan" className="small text-muted" /></div><div className="modal-footer bg-white"><button type="button" className="btn btn-secondary fw-bold" data-bs-dismiss="modal">Tutup</button></div></div></div></div>
        </div>
      </div>
    </>
  );
}
