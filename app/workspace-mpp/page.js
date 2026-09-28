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

export default function WorkspaceMppPage() {
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
            <select id="loginAccount" className="form-select" autoComplete="username" required defaultValue="">
              <option value="" disabled>-- Pilih akun --</option>
              <optgroup label="Administrator"><option value="admin">Administrator</option></optgroup>
              <optgroup label="Admisi IGD"><option value="admisi">Admisi IGD</option></optgroup>
              <optgroup label="Petugas MPP"><option value="mpp1">MPP 1</option><option value="mpp2">MPP 2</option></optgroup>
              <optgroup label="Ruangan"><option value="igd">IGD</option><option value="icu-picu">ICU/PICU</option><option value="nicu">NICU</option><option value="borobudur-1a">BOROBUDUR 1A</option><option value="borobudur-1b">BOROBUDUR 1B</option><option value="borobudur-2">BOROBUDUR 2</option><option value="borobudur-3">BOROBUDUR 3</option><option value="candi-pawon">CANDI PAWON</option><option value="candi-ngawen">CANDI NGAWEN</option><option value="candi-selogriyo">CANDI SELOGRIYO</option><option value="candi-mendut">CANDI MENDUT</option><option value="ibs">IBS</option><option value="poliklinik">POLIKLINIK</option></optgroup>
            </select>
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
            <li data-role="ppa,mpp,admin"><a className="nav-link active" href="/workspace-mpp"><i className="fas fa-briefcase-medical" />Ruang Kerja MPP</a></li>
            <li data-role="ppa,mpp,admin"><a className="nav-link" href="/arsip-mpp"><i className="fas fa-folder-open" />Arsip &amp; Riwayat</a></li>
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
            <h5 className="mb-0 fw-bold text-primary">Ruang Kerja MPP <span className="text-dark">RSUD Merah Putih</span></h5>
            <span id="userEmail" className="text-muted small ms-auto me-2" />
            <button id="logoutButton" className="btn btn-sm btn-outline-danger" type="button">Keluar</button>
          </div>

          <main className="container-fluid p-4">
            <section className="view-section" aria-labelledby="workspace-title">
              <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-primary pb-2 flex-wrap gap-2">
                <div>
                  <p className="eyebrow mb-1">OPERASIONAL</p>
                  <h1 id="workspace-title" className="h3 fw-bold text-primary mb-0">Ruang Kerja MPP</h1>
                </div>
                <button id="refreshWorkspaceButton" className="btn btn-outline-primary btn-sm fw-bold" type="button"><i className="fas fa-sync-alt me-1" />Muat Ulang</button>
              </div>
              <div id="workspaceAlert" className="alert d-none" role="status" />
              <div className="card shadow-sm p-4 border-top border-warning border-4 mb-4">
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h2 className="h5 fw-bold text-warning mb-1">Aktivasi PPA</h2>
                    <p className="small text-muted mb-0">Daftar pasien yang masih menunggu tindak lanjut.</p>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover align-middle border">
                    <thead className="table-light"><tr><th>Tgl Aktivasi</th><th>Nama Pasien</th><th>No. RM</th><th>Ruang Perawatan</th><th>Nama Pelapor (PPA)</th><th>MPP Tujuan</th><th>Data / Informasi Penting (Observasi PPA)</th><th className="text-center">Aksi</th></tr></thead>
                    <tbody id="tabelAntrianWorkspace"><tr><td colSpan="8" className="text-center text-muted py-4">Memuat data antrian pasien...</td></tr></tbody>
                  </table>
                </div>
              </div>
              <section id="view-tindak-lanjut" data-role="mpp,admin" aria-label="Form Tindak Lanjut MPP" />
            </section>
          </main>
        </div>
      </div>
    </>
  );
}