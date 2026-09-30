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
    await loadScript('/app.js?v=8', () => Boolean(window.MPPCare));
  })();
  return window.__mppcareRuntimePromise;
}

export default function ArsipMppPage() {
  useEffect(() => {
    const sidebarButton = document.getElementById('sidebarCollapse');
    const toggleSidebar = () => {
      document.getElementById('sidebar')?.classList.toggle('toggled');
      document.getElementById('content')?.classList.toggle('expanded');
    };
    sidebarButton?.addEventListener('click', toggleSidebar);
    if (window.matchMedia('(max-width: 800px)').matches) toggleSidebar();

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
      <section id="authGate" className="auth-gate d-none" aria-labelledby="loginTitle">
        <form id="loginForm" className="auth-panel">
          <span className="brand-mark">MPP</span>
          <p className="eyebrow">RSUD MERAH PUTIH</p>
          <h1 id="loginTitle">Masuk ke MPPCare</h1>
          <p className="auth-copy">Pilih akun unit kerja dan masukkan password.</p>
          <div id="authAlert" className="alert d-none" role="alert" />
          <label htmlFor="loginAccount">Akun
            <select id="loginAccount" className="form-select" autoComplete="username" required defaultValue=""><option value="" disabled>Memuat akun...</option></select>
          </label>
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
            <li data-dashboard-nav><a className="nav-link" href="/"><i className="fas fa-chart-pie" />Dashboard</a></li>
            <li data-role="ppa,mpp,admin"><a className="nav-link" href="/workspace-mpp"><i className="fas fa-briefcase-medical" />Ruang Kerja MPP</a></li>
            <li data-role="ppa,mpp,admin"><a className="nav-link active" href="/arsip-mpp"><i className="fas fa-folder-open" />Arsip &amp; Riwayat</a></li>
            <li data-role="ppa,admin"><a className="nav-link" href="/?view=view-form-ppa"><i className="fas fa-file-medical" />Form Aktivasi PPA</a></li>
            <li data-role="mpp,admin"><a className="nav-link text-warning fw-bold" href="/workspace-mpp#view-tindak-lanjut"><i className="fas fa-user-md" />Tindak Lanjut MPP</a></li>
            <li data-role="mpp,admin"><a className="nav-link text-info fw-bold" href="/?view=view-form-a"><i className="fas fa-print" />Cetak Form A (MPP)</a></li>
            <li data-role="ppa,mpp,admin,admisi"><a className="nav-link" href="/?view=view-igd"><i className="fas fa-ambulance" />Dashboard Stagnansi IGD</a></li>
          </ul>
          <div className="mt-auto p-3 text-center border-top border-danger sidebar-developer"><small className="text-white-50 fw-bold">Developed by</small><br /><span className="text-white fw-bold">Daniel Ari Kristianto</span></div>
        </nav>

        <div id="content">
          <div className="top-navbar bg-white shadow-sm border-bottom border-primary">
            <button type="button" className="btn btn-outline-primary border-0 fs-4" id="sidebarCollapse" aria-label="Toggle sidebar"><i className="fas fa-bars" /></button>
            <h5 className="mb-0 fw-bold text-primary">Arsip &amp; Riwayat MPP <span className="text-dark">RSUD Merah Putih</span></h5>
            <span id="userEmail" className="text-muted small ms-auto me-2" />
            <button id="bukaPengaturanTampilan" className="btn btn-sm btn-outline-secondary" type="button" aria-label="Pengaturan tampilan" title="Pengaturan tampilan"><i className="fas fa-palette" aria-hidden="true" /><span className="d-none d-md-inline ms-1">Tampilan</span></button>
            <button id="logoutButton" className="btn btn-sm btn-outline-danger" type="button">Keluar</button>
          </div>
          <div id="view-pengaturan-tampilan" />

          <main className="container-fluid p-4">
            <section className="view-section" aria-labelledby="archive-title">
              <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-success pb-2 flex-wrap gap-2">
                <div><p className="eyebrow mb-1">AUDIT DAN RIWAYAT</p><h1 id="archive-title" className="h3 fw-bold text-success mb-0">Tindak Lanjut MPP Selesai</h1></div>
                <button id="refreshArchiveButton" className="btn btn-outline-success btn-sm fw-bold" type="button"><i className="fas fa-sync-alt me-1" />Muat Ulang</button>
              </div>
              <div id="archiveAlert" className="alert d-none" role="status" />
              <div className="card shadow-sm p-4 border-top border-success border-4">
                <div className="row g-3 mb-3 align-items-end">
                  <div className="col-lg-3 col-md-6"><label htmlFor="filterTglMulai" className="form-label fw-bold small">Mulai Tanggal TL</label><input id="filterTglMulai" type="date" className="form-control" /></div>
                  <div className="col-lg-3 col-md-6"><label htmlFor="filterTglAkhir" className="form-label fw-bold small">Sampai Tanggal TL</label><input id="filterTglAkhir" type="date" className="form-control" /></div>
                  <div className="col-lg-3 col-md-6"><label htmlFor="filterPetugasMpp" className="form-label fw-bold small">Petugas MPP</label><select id="filterPetugasMpp" className="form-select"><option value="SEMUA">Semua Petugas</option></select></div>
                  <div className="col-lg-3 col-md-6"><label htmlFor="filterDpjp" className="form-label fw-bold small">DPJP</label><select id="filterDpjp" className="form-select"><option value="SEMUA">Semua DPJP</option></select></div>
                  <div className="col-12 d-flex justify-content-end gap-2">
                    <button id="resetFilterRiwayat" className="btn btn-outline-secondary" type="button"><i className="fas fa-rotate-left me-1" />Reset</button>
                    <button id="terapkanFilterRiwayat" className="btn btn-success fw-bold" type="button"><i className="fas fa-filter me-1" />Terapkan Filter</button>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover align-middle border">
                    <thead className="table-light"><tr><th>Tgl TL</th><th>Nama Pasien</th><th>No. RM</th><th>Ruangan</th><th>Petugas MPP</th><th>DPJP</th><th>Analisis Informasi</th><th className="text-center">Detail</th></tr></thead>
                    <tbody id="tabelRiwayatDashboard"><tr><td colSpan="8" className="text-center text-muted py-4">Memuat riwayat intervensi MPP...</td></tr></tbody>
                  </table>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      <div className="modal fade" id="modalDetailMpp" tabIndex="-1" aria-labelledby="modalDetailMppLabel" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered modal-lg"><div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-success text-white"><h2 className="modal-title h5 fw-bold" id="modalDetailMppLabel"><i className="fas fa-file-medical-alt me-2" />Detail Tindak Lanjut MPP</h2><button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Tutup" /></div>
          <div className="modal-body bg-light"><div className="card mb-3 border-success"><div className="card-header bg-success bg-opacity-10 text-success fw-bold">Analisis Informasi</div><div className="card-body"><p id="teksModalAnalisis" className="mb-0 text-dark small" style={{ whiteSpace: 'pre-wrap' }} /></div></div><div className="card mb-3 border-primary"><div className="card-header bg-primary bg-opacity-10 text-primary fw-bold">Plan of Care MPP</div><div className="card-body"><p id="teksModalPlanOfCare" className="mb-0 text-dark" style={{ whiteSpace: 'pre-wrap' }} /></div></div><p id="teksModalKeterangan" className="small text-muted" /></div>
          <div className="modal-footer bg-white justify-content-between"><button type="button" className="btn btn-outline-danger d-none fw-bold" id="deleteFollowUpButton"><i className="fas fa-trash-alt me-1" />Hapus</button><button type="button" className="btn btn-secondary fw-bold" data-bs-dismiss="modal">Tutup</button></div>
        </div></div>
      </div>
    </>
  );
}