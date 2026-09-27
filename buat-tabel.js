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
    status_bed VARCHAR(50) NOT NULL DEFAULT 'Menunggu Cleaning Service'
      CHECK (status_bed IN ('Menunggu Cleaning Service', 'Menunggu Linen/Alat', 'Kamar Siap - Menunggu Transpor')),
    bed_ready_at TIMESTAMPTZ,

    waktu_input TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const queryBuatTabelAktivasiMpp = `
  CREATE TABLE IF NOT EXISTS public.aktivasi_mpp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tgl_aktivasi DATE,
    tgl_masuk_rs DATE,
    nama_pasien VARCHAR(255),
    no_rm VARCHAR(50),
    usia INTEGER,
    ruang VARCHAR(150),
    nama_pelapor VARCHAR(255),
    jenis_pembiayaan VARCHAR(150),
    diagnosa TEXT,
    dpjp VARCHAR(255),
    data_informasi TEXT,
    mpp_tujuan VARCHAR(10)
      CHECK (mpp_tujuan IS NULL OR mpp_tujuan IN ('PRIYO', 'ARUM')),
    status VARCHAR(50) NOT NULL DEFAULT 'Menunggu',
    waktu_input TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const queryBuatTabelFormA = `
  CREATE TABLE IF NOT EXISTS public.form_a_mpp (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    waktu_simpan TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nama_pasien VARCHAR(255) NOT NULL,
    nomor_rm VARCHAR(50) NOT NULL,
    tgl_lahir DATE,
    tgl_mrs DATE,
    tgl_pengkajian DATE,
    bagian_a_skrining TEXT,
    bagian_b_asesmen TEXT,
    bagian_c_masalah TEXT,
    bagian_d_sasaran TEXT,
    bagian_e_perencanaan TEXT,
    nama_mpp_ttd VARCHAR(100),
    CONSTRAINT form_a_mpp_schema_pkey PRIMARY KEY (id)
  );
`;

async function buatTabelMpp() {
  loadLocalEnv();

  const connectionString =
    process.env.SUPABASE_DB_URL ||
    "postgresql://USER:PASSWORD@HOST:PORT/DATABASE";
  if (connectionString === "postgresql://USER:PASSWORD@HOST:PORT/DATABASE") {
    throw new Error(
      "Atur SUPABASE_DB_URL di file .env/environment, atau ganti placeholder connectionString di skrip."
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
    application_name: "buat-tabel-mpp",
  });

  let connected = false;
  let transactionStarted = false;
  try {
    console.log("Menghubungkan ke Supabase PostgreSQL...");
    await client.connect();
    connected = true;
    console.log("Koneksi berhasil. Menyiapkan tabel monitoring_igd, aktivasi_mpp, dan form_a_mpp...");

    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(queryBuatTabel);
    await client.query(queryBuatTabelAktivasiMpp);
    await client.query(queryBuatTabelFormA);

    const verification = await client.query(
      `SELECT
        to_regclass('public.monitoring_igd') AS monitoring_igd,
        to_regclass('public.aktivasi_mpp') AS aktivasi_mpp,
        to_regclass('public.form_a_mpp') AS form_a_mpp`
    );
    const tables = verification.rows[0];
    const missingTables = Object.entries(tables)
      .filter(([, tableName]) => !tableName)
      .map(([tableName]) => `public.${tableName}`);
    if (missingTables.length) {
      throw new Error(`Tabel tidak ditemukan setelah pembuatan: ${missingTables.join(", ")}.`);
    }

    await client.query("COMMIT");
    transactionStarted = false;
    console.log(
      "Berhasil: tabel public.monitoring_igd, public.aktivasi_mpp, dan public.form_a_mpp sudah tersedia."
    );
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (connected) {
      await client.end();
    }
  }
}

buatTabelMpp().catch((error) => {
  console.error("Gagal membuat atau memverifikasi tabel database.");
  console.error(error.message);
  if (error.code) console.error(`Kode PostgreSQL: ${error.code}`);
  process.exitCode = 1;
});
