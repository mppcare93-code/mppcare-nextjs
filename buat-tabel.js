const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }

    process.env[match[1]] = value;
  }
}

const queryBuatTabel = `
  CREATE TABLE IF NOT EXISTS public.monitoring_igd (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Bagian pendaftaran
    tanggal DATE,
    no_rm VARCHAR(50) NOT NULL,
    nama_pasien VARCHAR(255) NOT NULL,
    informed_consent VARCHAR(100),
    inden_bangsal VARCHAR(150),
    jam_inden TIME,
    jaminan VARCHAR(100),
    jam_daftar TIME,

    -- Bagian pelayanan IGD
    nomor_bed VARCHAR(50),
    nama_dpjp VARCHAR(255),

    -- Bagian tindak lanjut MPP
    koordinasi_kepala_ruang TEXT,
    koordinasi_dpjp TEXT,
    koordinasi_ibs TEXT,
    koordinasi_lab TEXT,
    koordinasi_radiologi TEXT,
    fasilitas TEXT,
    advokasi TEXT,
    edukasi TEXT,
    akar_masalah TEXT,

    -- Bagian pindah bangsal dan evaluasi
    bangsal_tujuan VARCHAR(150),
    tanggal_pindah DATE,
    jam_pindah TIME,
    waktu_tunggu VARCHAR(100),

    waktu_input TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

async function buatTabelIgd() {
  loadLocalEnv();

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error(
      "SUPABASE_DB_URL belum diatur. Isi di file .env atau sebagai environment variable."
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new Error(
      "SUPABASE_DB_URL tidak valid. Gunakan connection string PostgreSQL dari Supabase."
    );
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    !parsedUrl.pathname
  ) {
    throw new Error(
      "SUPABASE_DB_URL harus berbentuk postgresql://USER:PASSWORD@HOST:PORT/DATABASE."
    );
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    application_name: "buat-tabel-monitoring-igd",
  });

  let connected = false;
  try {
    console.log("Menghubungkan ke Supabase PostgreSQL...");
    await client.connect();
    connected = true;
    console.log("Koneksi berhasil. Membuat tabel monitoring_igd...");

    await client.query(queryBuatTabel);

    const verification = await client.query(
      "SELECT to_regclass('public.monitoring_igd') AS table_name"
    );
    if (!verification.rows[0]?.table_name) {
      throw new Error("Perintah selesai, tetapi tabel public.monitoring_igd tidak ditemukan.");
    }

    console.log("Berhasil: tabel public.monitoring_igd sudah tersedia.");
  } finally {
    if (connected) {
      await client.end();
    }
  }
}

buatTabelIgd().catch((error) => {
  console.error("Gagal membuat tabel monitoring_igd.");
  console.error(error.message);
  if (error.code) console.error(`Kode PostgreSQL: ${error.code}`);
  process.exitCode = 1;
});
