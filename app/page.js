'use client';

import { useEffect } from 'react';
import DashboardBangsal from './dashboard-bangsal';
import DashboardCharts from './dashboard-charts';

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
      <DashboardBangsal />
      <section id="authGate" className="auth-gate d-none" aria-labelledby="loginTitle">
        <form id="loginForm" className="auth-panel">
          <span className="brand-mark">MPP</span>
          <p className="eyebrow">RSUD MERAH PUTIH</p>
          <h1 id="loginTitle">Masuk ke MPPCare</h1>
          <p className="auth-copy">Pilih akun unit kerja dan masukkan password.</p>
          <div id="authAlert" className="alert d-none" role="alert" />
          <label htmlFor="loginAccount">Akun<select id="loginAccount" className="form-select" autoComplete="username" required defaultValue=""><option value="" disabled>Memuat akun...</option></select></label>
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
            <li data-dashboard-nav><a className="nav-link active" href="/"><i className="fas fa-chart-pie" />Dashboard</a></li>
            <li data-role="ppa,mpp,admin"><a className="nav-link" href="/workspace-mpp"><i className="fas fa-briefcase-medical" />Ruang Kerja MPP</a></li>
            <li data-role="ppa,mpp,admin"><a className="nav-link" href="/arsip-mpp"><i className="fas fa-folder-open" />Arsip &amp; Riwayat</a></li>
            <li data-role="ppa,admin"><a className="nav-link" href="/?view=view-form-ppa"><i className="fas fa-file-medical" />Form Aktivasi PPA</a></li>
            <li data-role="mpp,admin"><a className="nav-link text-warning fw-bold" href="/workspace-mpp#view-tindak-lanjut"><i className="fas fa-user-md" />Tindak Lanjut MPP</a></li>
            <li data-role="mpp,admin"><a className="nav-link text-info fw-bold" href="/?view=view-form-a"><i className="fas fa-print" />Cetak Form A (MPP)</a></li>
            <li data-role="admin,mpp_manager"><button className="nav-link" type="button" onClick={(event) => window.switchView?.('view-kelola-mpp', event.currentTarget)}><i className="fas fa-user-gear" />Kelola Akun MPP</button></li>
            <li data-role="ppa,mpp,admin,admisi"><a className="nav-link" href="/?view=view-igd"><i className="fas fa-ambulance" />Dashboard Stagnansi IGD</a></li>
          </ul>
          <div className="mt-auto p-3 text-center border-top border-danger sidebar-developer"><small className="text-white-50 fw-bold">Developed by</small><br /><span className="text-white fw-bold">Daniel Ari Kristianto</span></div>
        </nav>

        <div id="content">
          <div className="top-navbar bg-white shadow-sm border-bottom border-primary">
            <button type="button" className="btn btn-outline-primary border-0 fs-4" id="sidebarCollapse" aria-label="Toggle sidebar"><i className="fas fa-bars" /></button>
            <h5 className="mb-0 fw-bold text-primary">Sistem Informasi MPP <span className="text-dark">RSUD Merah Putih</span></h5>
            <span id="userEmail" className="text-muted small ms-auto me-2" />
            <button id="bukaPengaturanTampilan" className="btn btn-sm btn-outline-secondary" type="button" aria-label="Pengaturan tampilan" title="Pengaturan tampilan"><i className="fas fa-palette" aria-hidden="true" /><span className="d-none d-md-inline ms-1">Tampilan</span></button>
            <button id="logoutButton" className="btn btn-sm btn-outline-danger" type="button">Keluar</button>
          </div>
          <div id="view-pengaturan-tampilan" />

          <div className="container-fluid p-4">
            <section id="view-dashboard" className="view-section active-view" aria-labelledby="dashboard-title">
              <div className="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-4 border-bottom border-primary pb-3">
                <div><p className="eyebrow mb-1">MONITORING OPERASIONAL</p><h1 id="dashboard-title" className="h3 fw-bold text-primary mb-0">Command Center MPP</h1></div>
                <small id="tanggalHariIni" className="text-muted" />
              </div>
              <div id="dashboardAlert" className="alert d-none" role="status" />
              <section id="dashboardBottlenecks" className="dashboard-bottlenecks mb-4" aria-live="polite" aria-label="Peringatan bottleneck">
                <div className="dashboard-bottleneck-empty"><i className="fas fa-circle-check" /><span>Memeriksa batas waktu layanan...</span></div>
              </section>
              <section className="dashboard-kpis mb-4" aria-label="Metrik kinerja">
                <article className="dashboard-kpi"><span className="dashboard-kpi-label">Rata-rata waktu tunggu IGD</span><strong id="kpiIgdWait">-</strong><small id="kpiIgdSample">Pasien yang sudah pindah</small></article>
                <article className="dashboard-kpi"><span className="dashboard-kpi-label">Rata-rata respons MPP</span><strong id="kpiMppResponse">-</strong><small id="kpiMppSample">Aktivasi ke tindak lanjut</small></article>
                <article className="dashboard-kpi dashboard-kpi-pending"><span className="dashboard-kpi-label">Aktivasi menunggu</span><strong id="dash-pending">-</strong><small>Belum ada tindak lanjut</small></article>
                <article className="dashboard-kpi dashboard-kpi-complete"><span className="dashboard-kpi-label">Aktivasi selesai</span><strong id="dash-selesai">-</strong><small id="dash-total-label">Dari - total aktivasi</small></article>
              </section>
              <section className="dashboard-urgent" aria-labelledby="urgent-title">
                <div className="dashboard-section-heading">
                  <div><p className="eyebrow mb-1">PERLU DITANGANI</p><h2 id="urgent-title">Top Urgent</h2><p id="urgentSummary" className="mb-0 text-muted small">Memuat antrean aktivasi...</p></div>
                  <a className="btn btn-outline-primary btn-sm fw-bold" href="/workspace-mpp"><i className="fas fa-arrow-right me-1" />Lihat Semua di Ruang Kerja</a>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead><tr><th>Pasien</th><th>Ruangan</th><th>MPP Tujuan</th><th>Waktu Menunggu</th></tr></thead>
                    <tbody id="tabelTopUrgent"><tr><td colSpan="4" className="text-center text-muted py-4">Memuat antrean...</td></tr></tbody>
                  </table>
                </div>
              </section>
              <DashboardCharts />
            </section>

            <section id="view-form-ppa" className="view-section d-none" aria-label="Form Aktivasi PPA" />
            <section id="view-tindak-lanjut" className="view-section d-none" aria-label="Tindak Lanjut MPP" />
            <section id="view-form-a" className="view-section d-none" aria-label="Cetak Form A" />
            <section id="view-kelola-mpp" className="view-section d-none" aria-label="Kelola Akun MPP" />
            <section id="view-igd" className="view-section d-none" aria-label="Koordinasi Stagnasi IGD" />
          </div>

        </div>
      </div>
    </>
  );
}
