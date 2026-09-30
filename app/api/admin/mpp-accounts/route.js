const managedEmailSuffix = '@mppcare.invalid';
const privilegedRoles = new Set(['admin', 'mpp_manager']);
const roleLabels = {
  admin: 'Administrator',
  mpp_manager: 'Pengelola Akun MPP',
  admisi: 'Admisi IGD',
  mpp: 'Petugas MPP',
  ppa: 'PPA / Bangsal',
};

function jsonError(message, status) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function getConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Konfigurasi server Supabase belum lengkap.');
  return { url, anonKey, serviceRoleKey };
}

async function requireAdmin(request, config) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { error: jsonError('Sesi Admin tidak ditemukan. Silakan masuk kembali.', 401) };

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) return { error: jsonError('Sesi tidak valid atau sudah kedaluwarsa.', 401) };
  const user = await response.json();
  const role = user.app_metadata?.role;
  const isDedicatedManager = role === 'mpp_manager' && user.email?.toLowerCase() === 'mpp-manager@mppcare.invalid';
  if (role !== 'admin' && !isDedicatedManager) {
    return { error: jsonError('Hanya Admin atau Pengelola Akun MPP yang dapat mengubah akun ini.', 403) };
  }
  return { user };
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
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.msg || payload.message || payload.error_description || 'Supabase menolak perubahan akun.');
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

function isApplicationAccount(user) {
  return user.email?.toLowerCase().endsWith(managedEmailSuffix);
}

function serializeAccount(user, actor) {
  const role = user.app_metadata?.role || '';
  const target = user.app_metadata?.mpp_tujuan || '';
  const room = user.app_metadata?.room || '';
  const username = user.email?.slice(0, user.email.indexOf('@')) || user.id;
  const fallbackName = role === 'mpp' && target
    ? `MPP ${target}`
    : role === 'ppa' && room
      ? room
      : role === 'admisi'
        ? 'Admisi IGD'
        : username;
  return {
    userId: user.id,
    username,
    email: user.email,
    role,
    roleLabel: roleLabels[role] || 'Akun aplikasi',
    room,
    mppTarget: target,
    displayName: user.app_metadata?.nama_petugas || user.user_metadata?.full_name || fallbackName,
    canEdit: actor.app_metadata?.role === 'admin' || !privilegedRoles.has(role),
  };
}

async function getAdminContext(request) {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    return { error: jsonError(error.message, 503) };
  }
  const authorization = await requireAdmin(request, config);
  if (authorization.error) return authorization;
  return { config, actor: authorization.user };
}

export async function GET(request) {
  const context = await getAdminContext(request);
  if (context.error) return context.error;
  try {
    const users = await listUsers(context.config);
    const accounts = users
      .filter(isApplicationAccount)
      .map((user) => serializeAccount(user, context.actor))
      .sort((left, right) => left.roleLabel.localeCompare(right.roleLabel, 'id') || left.username.localeCompare(right.username, 'id'));
    return Response.json({ accounts, actorRole: context.actor.app_metadata?.role }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error.message || 'Daftar akun MPP gagal dimuat.', 502);
  }
}

export async function PATCH(request) {
  const context = await getAdminContext(request);
  if (context.error) return context.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Data perubahan tidak valid.', 400);
  }

  const userId = String(body.userId || '');
  const displayName = String(body.displayName || '').trim();
  const newPassword = String(body.newPassword || '');
  if (!userId) return jsonError('Pilih akun yang akan diubah.', 400);
  if (displayName.length < 2 || displayName.length > 150) return jsonError('Nama petugas harus berisi 2 sampai 150 karakter.', 400);
  if (newPassword && newPassword.length < 12) return jsonError('Password baru harus minimal 12 karakter.', 400);

  try {
    const users = await listUsers(context.config);
    const user = users.find((candidate) => candidate.id === userId && isApplicationAccount(candidate));
    if (!user) return jsonError('Akun aplikasi tidak ditemukan.', 404);
    if (context.actor.app_metadata?.role !== 'admin' && privilegedRoles.has(user.app_metadata?.role)) {
      return jsonError('Akun dengan hak tinggi hanya dapat diubah oleh Administrator.', 403);
    }

    const update = {
      app_metadata: { ...(user.app_metadata || {}), nama_petugas: displayName },
      user_metadata: { ...(user.user_metadata || {}), full_name: displayName },
    };
    if (newPassword) update.password = newPassword;
    await adminRequest(context.config, 'PUT', `/${encodeURIComponent(user.id)}`, update);
    return Response.json({
      account: serializeAccount({ ...user, app_metadata: update.app_metadata, user_metadata: update.user_metadata }, context.actor),
      passwordChanged: Boolean(newPassword),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error.message || 'Perubahan akun MPP gagal disimpan.', 502);
  }
}

export async function POST(request) {
  const context = await getAdminContext(request);
  if (context.error) return context.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Data akun baru tidak valid.', 400);
  }

  const username = String(body.username || '').trim().toLowerCase();
  const room = String(body.room || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const displayName = String(body.displayName || '').trim();
  const password = String(body.password || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(username) || username.length > 50) {
    return jsonError('Username hanya boleh huruf kecil, angka, dan tanda hubung; tidak boleh diawali/diakhiri tanda hubung.', 400);
  }
  if (room.length < 2 || room.length > 100) return jsonError('Nama ruangan harus berisi 2 sampai 100 karakter.', 400);
  if (displayName.length < 2 || displayName.length > 150) return jsonError('Nama petugas harus berisi 2 sampai 150 karakter.', 400);
  if (password.length < 12 || password.length > 128) return jsonError('Password harus berisi 12 sampai 128 karakter.', 400);

  const email = `${username}${managedEmailSuffix}`;
  try {
    const users = await listUsers(context.config);
    if (users.some((user) => user.email?.toLowerCase() === email)) {
      return jsonError('Username tersebut sudah digunakan.', 409);
    }

    const created = await adminRequest(context.config, 'POST', '', {
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'ppa', room, nama_petugas: displayName },
      user_metadata: { full_name: displayName },
    });
    const user = created.user || created;
    return Response.json({ account: serializeAccount(user, context.actor) }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return jsonError(error.message || 'Akun ruangan gagal dibuat.', 502);
  }
}