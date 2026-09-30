(() => {
  const supabase = window.supabaseClient;
  if (!supabase) throw new Error('Supabase client belum siap. Periksa urutan modul aplikasi.');
  const roomAccounts = [
    ['igd', 'IGD'], ['icu-picu', 'ICU,PICU'], ['nicu', 'NICU'],
    ['borobudur-1a', 'BOROBUDUR 1A'], ['borobudur-1b', 'BOROBUDUR 1B'],
    ['borobudur-2', 'BOROBUDUR 2'], ['borobudur-3', 'BOROBUDUR 3'],
    ['candi-pawon', 'CANDI PAWON'], ['candi-ngawen', 'CANDI NGAWEN'],
    ['candi-selogriyo', 'CANDI SELOGRIYO'], ['candi-mendut', 'CANDI MENDUT'],
    ['ibs', 'IBS'], ['poliklinik', 'POLIKLINIK']
  ];
  const accountEmail = (account) => `${account}@mppcare.invalid`;

  const app = window.MPPCare = {
    supabase,
    modules: {},
    state: { role: null, user: null, room: null, mppTarget: null, activations: [] },
    getUserRoom: (user) => String(user?.app_metadata?.room || user?.raw_app_meta_data?.room || '').trim().toUpperCase(),
    today: () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },
    canPpa: (role) => ['ppa', 'admin'].includes(role),
    canMpp: (role) => ['mpp', 'admin'].includes(role),
    setAlert(id, message, type = 'danger') {
      const alert = document.getElementById(id);
      if (!alert) return;
      alert.className = `alert alert-${type} mt-3`;
      alert.textContent = message;
      alert.classList.remove('d-none');
    },
    async loadFragment(targetId, fileName) {
      const target = document.getElementById(targetId);
      if (!target || target.dataset.ready === 'true') return;
      if (target.dataset.loadPromise) return target.dataset.loadPromise;
      target.dataset.ready = 'loading';
      target.dataset.loadPromise = (async () => {
        try {
          const response = await fetch(fileName);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          target.innerHTML = await response.text();
          target.dataset.ready = 'true';
        } catch (error) {
          delete target.dataset.ready;
          target.innerHTML = `<div class="alert alert-danger">Gagal memuat ${fileName}: ${String(error.message)}</div>`;
          throw error;
        } finally {
          delete target.dataset.loadPromise;
        }
      })();
      return target.dataset.loadPromise;
    },
    async refreshData() {
      const { role, mppTarget } = app.state;
      if (role === 'mpp_manager') {
        app.state.activations = [];
        window.dashboardActivations = [];
        return;
      }
      if (role === 'admisi') {
        app.state.activations = [];
        Object.values(app.modules).forEach((module) => module.onActivations?.([]));
        return;
      }
      const pageSize = 500;
      const activations = [];
      for (let offset = 0; ; offset += pageSize) {
        let query = supabase.from('aktivasi_mpp')
          .select('id,tgl_aktivasi,tgl_masuk_rs,nama_pasien,no_rm,usia,ruang,nama_pelapor,jenis_pembiayaan,diagnosa,dpjp,data_informasi,mpp_tujuan,status,waktu_input');
        if (role === 'mpp') query = query.eq('mpp_tujuan', mppTarget);
        const { data, error } = await query
          .order('waktu_input', { ascending: false })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) {
          app.setAlert(document.getElementById('workspaceAlert') ? 'workspaceAlert' : 'dashboardAlert', error.message);
          return;
        }
        activations.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      app.state.activations = activations;
      window.dashboardActivations = app.state.activations;
      Object.values(app.modules).forEach((module) => module.onActivations?.(app.state.activations));
    }
  };

  function updateNavigation(role) {
    document.querySelectorAll('[data-role]').forEach((item) => {
      const roles = item.dataset.role.split(',');
      item.classList.toggle('d-none', !roles.includes(role) && role !== 'admin');
    });
    document.querySelectorAll('[data-dashboard-nav]').forEach((item) => {
      item.classList.toggle('d-none', !['ppa', 'mpp', 'admin'].includes(role));
    });
  }

  async function showSession(session) {
    const gate = document.getElementById('authGate');
    const shell = document.querySelector('.app-shell');
    if (!session?.user) {
      app.state = { role: null, user: null, room: null, mppTarget: null, activations: [] };
      window.currentMppcareRole = null;
      gate?.classList.remove('d-none');
      shell?.classList.add('d-none');
      window.dispatchEvent(new CustomEvent('mppcare:session-ready', { detail: { role: null } }));
      return;
    }

    const role = session.user.app_metadata?.role || '';
    const mppTarget = session.user.app_metadata?.mpp_tujuan || '';
    const room = app.getUserRoom(session.user);
    const email = session.user.email?.toLowerCase() || '';
    const ppaUsername = email.endsWith('@mppcare.invalid') ? email.slice(0, -'@mppcare.invalid'.length) : '';
    if (!['ppa', 'mpp', 'admin', 'admisi', 'mpp_manager'].includes(role)) {
      await supabase.auth.signOut();
      gate?.classList.remove('d-none');
      app.setAlert('authAlert', 'Akun belum memiliki role ppa atau mpp. Hubungi administrator Supabase.');
      return;
    }
    if (role === 'mpp' && !['PRIYO', 'ARUM'].includes(mppTarget)) {
      await supabase.auth.signOut();
      gate?.classList.remove('d-none');
      app.setAlert('authAlert', 'Akun MPP memerlukan app_metadata.mpp_tujuan PRIYO atau ARUM.');
      return;
    }
    if (role === 'ppa' && (!room || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ppaUsername))) {
      await supabase.auth.signOut();
      gate?.classList.remove('d-none');
      app.setAlert('authAlert', 'Akun ruangan belum memiliki username dan app_metadata.room yang valid. Hubungi administrator.');
      return;
    }
    if (role === 'admisi' && (room !== 'IGD' || session.user.email?.toLowerCase() !== accountEmail('admisi'))) {
      await supabase.auth.signOut();
      gate?.classList.remove('d-none');
      app.setAlert('authAlert', 'Akun Admisi harus menggunakan email admisi@mppcare.invalid dan app_metadata.room IGD.');
      return;
    }
    if (role === 'mpp_manager' && window.location.pathname !== '/') {
      window.location.replace('/');
      return;
    }
    if (role === 'admisi' && window.location.pathname !== '/') {
      window.location.replace('/?view=view-igd');
      return;
    }
    if (role === 'admisi' && window.location.pathname !== '/') {
      window.location.replace('/?view=view-igd');
      return;
    }

    app.state = { role, user: session.user, room: ['ppa', 'admisi'].includes(role) ? room : null, mppTarget: role === 'mpp' ? mppTarget : null, activations: [] };
    window.currentMppcareRole = role;
    if (role === 'admisi') window.switchView?.('view-igd', document.querySelector('[data-role="admisi"] .nav-link'));
    gate?.classList.add('d-none');
    shell?.classList.remove('d-none');
    updateNavigation(role);
    document.getElementById('userEmail').textContent = role === 'mpp_manager' ? 'Pengelola Akun MPP' : room || (role === 'mpp' ? `MPP ${mppTarget}` : session.user.email || '');
    window.dispatchEvent(new CustomEvent('mppcare:session-ready', { detail: { role, user: session.user } }));

    if (role === 'mpp_manager') {
      await Promise.all([
        app.loadFragment('view-kelola-mpp', 'kelola-mpp-accounts.html?v=4'),
        app.loadFragment('view-pengaturan-tampilan', 'pengaturan-tampilan.html?v=1')
      ]);
    } else if (role !== 'admisi') {
      const fragments = [
        app.loadFragment('view-form-ppa', 'form-ppa.html'),
        app.loadFragment('view-tindak-lanjut', 'tindak-lanjut-mpp.html'),
        app.loadFragment('view-form-a', 'form-a.html'),
        app.loadFragment('view-pengaturan-tampilan', 'pengaturan-tampilan.html?v=1')
      ];
      if (role === 'admin') fragments.push(app.loadFragment('view-kelola-mpp', 'kelola-mpp-accounts.html?v=4'));
      await Promise.all(fragments);
    } else {
      await app.loadFragment('view-pengaturan-tampilan', 'pengaturan-tampilan.html?v=1');
    }
    if (role === 'mpp_manager') {
      if (typeof app.modules.manageMppAccounts?.mount === 'function') {
        app.modules.manageMppAccounts.mount({ role, user: session.user, app });
      } else {
        const list = document.getElementById('mppAccountsList');
        if (list) list.textContent = 'Panel akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.';
        app.setAlert('mppAccountsAlert', 'Controller pengelolaan akun tidak termuat. Periksa koneksi lalu muat ulang halaman.');
      }
      app.modules.appearanceSettings?.mount?.({ role, user: session.user, app });
    } else {
      Object.values(app.modules).forEach((module) => module.mount?.({ role, user: session.user, app }));
    }
    const initialView = role === 'admisi' ? 'view-igd' : role === 'mpp_manager' ? 'view-kelola-mpp' : new URLSearchParams(window.location.search).get('view');
    if (initialView) window.switchView?.(initialView, document.querySelector(`[href="/?view=${initialView}"]`));
    if (window.location.hash === '#view-tindak-lanjut') {
      document.getElementById('view-tindak-lanjut')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    document.getElementById('logoutButton').onclick = () => supabase.auth.signOut();
    await app.refreshData();
  }

  async function initialize() {
    const loginAccount = document.getElementById('loginAccount');
    const loginSubmit = document.getElementById('loginSubmit');
    if (loginAccount && loginSubmit) {
      loginSubmit.disabled = true;
      try {
        const response = await fetch('/api/login-accounts', {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Daftar akun gagal dimuat.');
        const groups = new Map();
        for (const account of payload.accounts || []) {
          if (!groups.has(account.group)) groups.set(account.group, []);
          groups.get(account.group).push(account.username);
        }
        const placeholder = new Option('-- Pilih akun --', '');
        placeholder.disabled = true;
        loginAccount.replaceChildren(placeholder);
        for (const [groupName, usernames] of groups) {
          const group = document.createElement('optgroup');
          group.label = groupName;
          usernames.forEach((username) => group.append(new Option(username, username)));
          loginAccount.append(group);
        }
        if (!payload.accounts?.length) throw new Error('Belum ada akun aplikasi terdaftar.');
      } catch (error) {
        const placeholder = new Option('Daftar akun gagal dimuat', '');
        placeholder.disabled = true;
        loginAccount.replaceChildren(placeholder);
        loginAccount.disabled = true;
        app.setAlert('authAlert', `${error.message} Muat ulang halaman untuk mencoba kembali.`);
      } finally {
        loginSubmit.disabled = loginAccount.disabled;
      }
    }

    document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('loginSubmit');
      button.disabled = true;
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: accountEmail(document.getElementById('loginAccount').value),
          password: document.getElementById('loginPassword').value
        });
        if (error) throw error;
      } catch (error) {
        app.setAlert('authAlert', error.message || 'Login gagal.');
      } finally {
        button.disabled = false;
      }
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) app.setAlert('authAlert', error.message);
    await showSession(data?.session);
    supabase.auth.onAuthStateChange((_event, session) => window.setTimeout(() => showSession(session), 0));
  }

  window.addEventListener('mppcare:modules-ready', () => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
  }, { once: true });
})();
