const fs = require('node:fs');
const path = require('node:path');

const rooms = [
  ['igd', 'IGD'],
  ['icu-picu', 'ICU,PICU'],
  ['nicu', 'NICU'],
  ['borobudur-1a', 'BOROBUDUR 1A'],
  ['borobudur-1b', 'BOROBUDUR 1B'],
  ['borobudur-2', 'BOROBUDUR 2'],
  ['borobudur-3', 'BOROBUDUR 3'],
  ['candi-pawon', 'CANDI PAWON'],
  ['candi-ngawen', 'CANDI NGAWEN'],
  ['candi-selogriyo', 'CANDI SELOGRIYO'],
  ['candi-mendut', 'CANDI MENDUT'],
  ['ibs', 'IBS'],
  ['poliklinik', 'POLIKLINIK'],
];

const accounts = [
  { username: 'admin', metadata: { role: 'admin' } },
  { username: 'admisi', metadata: { role: 'admisi', room: 'IGD' } },
  { username: 'mpp1', metadata: { role: 'mpp', mpp_tujuan: 'PRIYO' } },
  { username: 'mpp2', metadata: { role: 'mpp', mpp_tujuan: 'ARUM' } },
  ...rooms.map(([username, room]) => ({
    username,
    metadata: { role: 'ppa', room },
  })),
].map((account) => ({
  ...account,
  email: `${account.username}@mppcare.invalid`,
}));

function loadEnvFiles() {
  for (const filename of ['.env.local', '.env']) {
    const envPath = path.join(__dirname, '..', filename);
    if (!fs.existsSync(envPath)) continue;

    const contents = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;

      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '');
      }
      process.env[match[1]] = value;
    }
  }
}

function getConfig() {
  loadEnvFiles();
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceRoleKey) {
    throw new Error('Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.');
  }
  return { url, serviceRoleKey };
}

async function adminRequest(config, method, route, body) {
  const response = await fetch(`${config.url}/auth/v1/admin/users${route}`, {
    method,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Supabase Auth ${method} ${route} gagal (${response.status}): ${payload.msg || payload.message || payload.error_description || 'periksa konfigurasi dan izin key.'}`);
  }
  return payload;
}

async function listUsers(config) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const payload = await adminRequest(config, 'GET', `?page=${page}&per_page=1000`);
    const batch = payload.users || [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

async function provision(config) {
  const password = process.env.INITIAL_ACCOUNT_PASSWORD || '';
  if (password.length < 12) {
    throw new Error('Atur INITIAL_ACCOUNT_PASSWORD di .env.local dengan minimal 12 karakter. Password tidak ditampilkan oleh skrip.');
  }

  const users = await listUsers(config);
  const usersByEmail = new Map(users.map((user) => [user.email?.toLowerCase(), user]));
  for (const account of accounts) {
    const existingUser = usersByEmail.get(account.email);
    if (existingUser) {
      const metadata = { ...(existingUser.app_metadata || {}), ...account.metadata };
      await adminRequest(config, 'PUT', `/${encodeURIComponent(existingUser.id)}`, { app_metadata: metadata });
      console.log(`Metadata diperbarui: ${account.username} (${existingUser.id}); password tetap.`);
      continue;
    }

    const created = await adminRequest(config, 'POST', '', {
      email: account.email,
      password,
      email_confirm: true,
      app_metadata: account.metadata,
    });
    const user = created.user || created;
    console.log(`Dibuat: ${account.username} (${user.id})`);
  }
  console.log(`Selesai. ${accounts.length} akun diproses; password awal hanya diterapkan pada akun baru.`);
}

async function deleteLegacy(config, confirmed) {
  const ids = [...new Set((process.env.LEGACY_AUTH_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    throw new Error('Isi LEGACY_AUTH_USER_IDS dengan UUID akun lama yang sudah diperiksa, dipisahkan koma.');
  }
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('Semua nilai LEGACY_AUTH_USER_IDS harus berupa UUID pengguna Supabase Auth.');
  }

  const users = await listUsers(config);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const managedEmails = new Set(accounts.map((account) => account.email));
  const targets = ids.map((id) => usersById.get(id));
  if (targets.some((user) => !user)) throw new Error('Ada UUID yang tidak ditemukan. Tidak ada akun yang dihapus.');
  if (targets.some((user) => managedEmails.has(user.email?.toLowerCase()))) {
    throw new Error('Target mencakup akun MPPCare baru yang dikelola skrip. Penghapusan dibatalkan.');
  }

  if (!confirmed) {
    console.log('DRY RUN. Akun berikut akan dihapus hanya jika dijalankan ulang dengan --confirm-delete:');
    targets.forEach((user) => console.log(`${user.id} ${user.email}`));
    return;
  }

  for (const user of targets) {
    await adminRequest(config, 'DELETE', `/${encodeURIComponent(user.id)}`);
    console.log(`Dihapus: ${user.id} ${user.email}`);
  }
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  const config = getConfig();
  if (command === 'provision') return provision(config);
  if (command === 'delete-legacy') return deleteLegacy(config, flags.includes('--confirm-delete'));
  throw new Error('Gunakan perintah: provision atau delete-legacy.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});