const emailSuffix = '@mppcare.invalid';
const roleGroups = {
  admin: 'Administrator',
  mpp_manager: 'Pengelola Akun MPP',
  admisi: 'Admisi IGD',
  mpp: 'Petugas MPP',
  ppa: 'Bangsal / Ruangan',
};

async function listUsers(url, serviceRoleKey) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.msg || payload.message || 'Daftar akun tidak dapat dimuat.');
    }
    const batch = payload.users || [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

export async function GET() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceRoleKey) {
    return Response.json({ error: 'Konfigurasi server akun belum lengkap.' }, { status: 503 });
  }

  try {
    const users = await listUsers(url, serviceRoleKey);
    const accounts = users
      .filter((user) => user.email?.toLowerCase().endsWith(emailSuffix))
      .map((user) => {
        const username = user.email.slice(0, -emailSuffix.length);
        return {
          username,
          group: roleGroups[user.app_metadata?.role] || 'Akun lainnya',
        };
      })
      .filter((account) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(account.username))
      .sort((left, right) => left.group.localeCompare(right.group, 'id') || left.username.localeCompare(right.username, 'id'));

    return Response.json({ accounts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Daftar akun gagal dimuat.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}