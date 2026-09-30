(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum kelola-mpp-accounts.js.');
  let wired = false;

  function showAlert(message, type = 'danger') {
    const alert = document.getElementById('mppAccountsAlert');
    if (!alert) return;
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
  }

  async function request(path, method = 'GET', body) {
    const { data, error } = await app.supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Sesi Admin berakhir. Silakan masuk kembali.');
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Permintaan pengelolaan akun gagal.');
    return payload;
  }

  function renderAccount(account) {
    const article = document.createElement('article');
    article.className = 'border-bottom py-4';
    const heading = document.createElement('div');
    heading.className = 'd-flex justify-content-between flex-wrap gap-2 mb-3';
    const title = document.createElement('h2');
    title.className = 'h5 fw-bold mb-0';
    title.textContent = account.username.toUpperCase();
    const email = document.createElement('span');
    email.className = 'text-muted small';
    email.textContent = `${account.roleLabel} · ${account.email}`;
    heading.append(title, email);
    article.append(heading);

    const details = [account.room, account.mppTarget && `MPP ${account.mppTarget}`].filter(Boolean);
    if (details.length) {
      const detail = document.createElement('p');
      detail.className = 'text-muted small mb-3';
      detail.textContent = details.join(' · ');
      article.append(detail);
    }

    if (!account.canEdit) {
      const warning = document.createElement('p');
      warning.className = 'text-muted small mb-0';
      warning.textContent = 'Hanya Administrator yang dapat mengubah akun ini.';
      article.append(warning);
      return article;
    }

    const form = document.createElement('form');
    form.dataset.userId = account.userId;
    form.innerHTML = `
      <div class="row g-3 align-items-end">
        <div class="col-lg-4">
          <label class="form-label fw-semibold" for="user-name-${account.userId}">Nama petugas</label>
          <input id="user-name-${account.userId}" name="displayName" class="form-control" type="text" maxlength="150" minlength="2" autocomplete="off" required>
        </div>
        <div class="col-lg-3">
          <label class="form-label fw-semibold" for="user-password-${account.userId}">Password baru</label>
          <input id="user-password-${account.userId}" name="newPassword" class="form-control" type="password" minlength="12" autocomplete="new-password" placeholder="Kosongkan jika tetap">
        </div>
        <div class="col-lg-3">
          <label class="form-label fw-semibold" for="user-confirm-${account.userId}">Ulangi password baru</label>
          <input id="user-confirm-${account.userId}" name="confirmPassword" class="form-control" type="password" minlength="12" autocomplete="new-password" placeholder="Kosongkan jika tetap">
        </div>
        <div class="col-lg-2 d-grid">
          <button class="btn btn-primary" type="submit"><i class="fas fa-save me-1" aria-hidden="true"></i>Simpan</button>
        </div>
      </div>`;
    form.elements.displayName.value = account.displayName;
    form.addEventListener('submit', saveAccount);
    article.append(form);
    return article;
  }

  function renderAccounts(accounts) {
    const list = document.getElementById('mppAccountsList');
    if (!list) return;
    if (!accounts.length) {
      list.textContent = 'Belum ada akun aplikasi yang terdaftar.';
      return;
    }
    list.replaceChildren(...accounts.map(renderAccount));
  }

  async function loadAccounts() {
    const list = document.getElementById('mppAccountsList');
    if (list) list.textContent = 'Memuat akun...';
    try {
      const payload = await request('/api/admin/mpp-accounts');
      renderAccounts(payload.accounts || []);
      showAlert(`${payload.accounts?.length || 0} akun berhasil dimuat.`, 'success');
    } catch (error) {
      if (list) list.textContent = 'Daftar akun tidak dapat dimuat.';
      showAlert(error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'Permintaan daftar akun melewati batas waktu. Periksa koneksi, lalu tekan Muat Ulang.'
        : error.message);
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const displayName = form.elements.displayName.value.trim();
    const newPassword = form.elements.newPassword.value;
    const confirmPassword = form.elements.confirmPassword.value;
    if (newPassword !== confirmPassword) {
      showAlert('Konfirmasi password baru tidak sama.');
      return;
    }
    if (newPassword && newPassword.length < 12) {
      showAlert('Password baru harus minimal 12 karakter.');
      return;
    }

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const payload = await request('/api/admin/mpp-accounts', 'PATCH', {
        userId: form.dataset.userId,
        displayName,
        newPassword,
      });
      form.elements.displayName.value = payload.account.displayName;
      form.elements.newPassword.value = '';
      form.elements.confirmPassword.value = '';
      showAlert(`Perubahan akun ${payload.account.username} berhasil disimpan${payload.passwordChanged ? '; password baru berlaku untuk login berikutnya' : ''}.`, 'success');
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function createRoomAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.elements.password.value;
    if (password !== form.elements.confirmPassword.value) {
      showAlert('Konfirmasi password akun baru tidak sama.');
      return;
    }

    const button = document.getElementById('btnBuatAkunRuangan');
    button.disabled = true;
    try {
      const payload = await request('/api/admin/mpp-accounts', 'POST', {
        username: form.elements.username.value,
        room: form.elements.room.value,
        displayName: form.elements.displayName.value,
        password,
      });
      form.reset();
      await loadAccounts();
      showAlert(`Akun ${payload.account.username} untuk ${payload.account.room} berhasil dibuat.`, 'success');
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  }

  function mount({ role }) {
    if (!['admin', 'mpp_manager'].includes(role)) return;
    const list = document.getElementById('mppAccountsList');
    if (!list) return;
    if (!wired) {
      wired = true;
      document.getElementById('refreshMppAccounts')?.addEventListener('click', loadAccounts);
      document.getElementById('formBuatAkunRuangan')?.addEventListener('submit', createRoomAccount);
    }
    loadAccounts();
  }

  app.modules.manageMppAccounts = { mount };
})();