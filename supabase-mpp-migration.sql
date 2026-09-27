CREATE TABLE IF NOT EXISTS public.tindak_lanjut_mpp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aktivasi_mpp_id UUID NOT NULL UNIQUE
    REFERENCES public.aktivasi_mpp(id) ON DELETE CASCADE,
  tanggal_tl DATE NOT NULL,
  nama_petugas_mpp VARCHAR(150) NOT NULL,
  analisis_informasi TEXT[] NOT NULL DEFAULT '{}',
  plan_of_care TEXT NOT NULL,
  keterangan TEXT,
  waktu_simpan TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  waktu_diperbarui TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.form_a_mpp
  ADD COLUMN IF NOT EXISTS ttd_mpp_data_url TEXT;

ALTER TABLE public.form_a_mpp
  ADD COLUMN IF NOT EXISTS jam_mrs TIME,
  ADD COLUMN IF NOT EXISTS jam_pengkajian TIME;

ALTER TABLE public.form_a_mpp
  ADD COLUMN IF NOT EXISTS aktivasi_mpp_id UUID
    REFERENCES public.aktivasi_mpp(id) ON DELETE SET NULL;

ALTER TABLE public.monitoring_igd
  ADD COLUMN IF NOT EXISTS status_bed TEXT NOT NULL DEFAULT 'Menunggu Cleaning Service';

ALTER TABLE public.monitoring_igd
  ADD COLUMN IF NOT EXISTS bed_ready_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'monitoring_igd_status_bed_check'
      AND conrelid = 'public.monitoring_igd'::regclass
  ) THEN
    ALTER TABLE public.monitoring_igd
      ADD CONSTRAINT monitoring_igd_status_bed_check
      CHECK (status_bed IN ('Menunggu Cleaning Service', 'Menunggu Linen/Alat', 'Kamar Siap - Menunggu Transpor'));
  END IF;
END;
$$;

ALTER TABLE public.monitoring_igd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aktivasi_mpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_a_mpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tindak_lanjut_mpp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monitoring_igd_role_access ON public.monitoring_igd;
CREATE POLICY monitoring_igd_role_access ON public.monitoring_igd
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('ppa', 'mpp', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('ppa', 'mpp', 'admin'));

DROP POLICY IF EXISTS monitoring_igd_admisi_read ON public.monitoring_igd;
CREATE POLICY monitoring_igd_admisi_read ON public.monitoring_igd
  FOR SELECT TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admisi'
    AND auth.jwt() -> 'app_metadata' ->> 'room' = 'IGD'
  );

DROP POLICY IF EXISTS monitoring_igd_admisi_insert ON public.monitoring_igd;
CREATE POLICY monitoring_igd_admisi_insert ON public.monitoring_igd
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admisi'
    AND auth.jwt() -> 'app_metadata' ->> 'room' = 'IGD'
  );

DROP POLICY IF EXISTS monitoring_igd_admisi_update ON public.monitoring_igd;
CREATE POLICY monitoring_igd_admisi_update ON public.monitoring_igd
  FOR UPDATE TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admisi'
    AND auth.jwt() -> 'app_metadata' ->> 'room' = 'IGD'
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admisi'
    AND auth.jwt() -> 'app_metadata' ->> 'room' = 'IGD'
  );

CREATE OR REPLACE FUNCTION public.guard_monitoring_igd_admisi_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admisi' THEN
      RAISE EXCEPTION 'Admisi IGD tidak memiliki izin untuk menghapus data.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admisi' THEN
    RETURN NEW;
  END IF;

  IF (auth.jwt() -> 'app_metadata' ->> 'room') IS DISTINCT FROM 'IGD' THEN
    RAISE EXCEPTION 'Admisi IGD hanya dapat mengubah data melalui alur IGD.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status_bed IS DISTINCT FROM 'Menunggu Cleaning Service'
      OR NEW.bed_ready_at IS NOT NULL
      OR NEW.waktu_input IS DISTINCT FROM transaction_timestamp()
      OR EXISTS (
        SELECT 1
        FROM jsonb_each(to_jsonb(NEW) - ARRAY[
          'id', 'tanggal', 'no_rm', 'nama_pasien', 'informed_consent',
          'inden_bangsal', 'jam_inden', 'jaminan', 'jam_daftar',
          'status_bed', 'bed_ready_at', 'waktu_input'
        ]) AS column_value
        WHERE column_value.value <> 'null'::jsonb
      ) THEN
      RAISE EXCEPTION 'Admisi IGD hanya dapat mendaftarkan pasien pada tahap 1.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - ARRAY[
    'tanggal', 'no_rm', 'nama_pasien', 'informed_consent', 'inden_bangsal',
    'jam_inden', 'jaminan', 'jam_daftar', 'nomor_bed', 'nama_dpjp',
    'koordinasi_kepala_ruang', 'koordinasi_dpjp', 'koordinasi_ibs',
    'koordinasi_lab', 'koordinasi_radiologi', 'fasilitas', 'advokasi',
    'edukasi', 'akar_masalah', 'bangsal_tujuan', 'tanggal_pindah',
    'jam_pindah', 'waktu_tunggu'
  ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
    'tanggal', 'no_rm', 'nama_pasien', 'informed_consent', 'inden_bangsal',
    'jam_inden', 'jaminan', 'jam_daftar', 'nomor_bed', 'nama_dpjp',
    'koordinasi_kepala_ruang', 'koordinasi_dpjp', 'koordinasi_ibs',
    'koordinasi_lab', 'koordinasi_radiologi', 'fasilitas', 'advokasi',
    'edukasi', 'akar_masalah', 'bangsal_tujuan', 'tanggal_pindah',
    'jam_pindah', 'waktu_tunggu'
  ]) THEN
    RAISE EXCEPTION 'Admisi IGD hanya dapat mengubah kolom pada alur tahap 1 sampai 4.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monitoring_igd_admisi_write_guard ON public.monitoring_igd;
CREATE TRIGGER monitoring_igd_admisi_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.monitoring_igd
  FOR EACH ROW EXECUTE FUNCTION public.guard_monitoring_igd_admisi_write();

DROP POLICY IF EXISTS aktivasi_select_role ON public.aktivasi_mpp;
CREATE POLICY aktivasi_select_role ON public.aktivasi_mpp
  FOR SELECT TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'ppa'
      AND ruang = auth.jwt() -> 'app_metadata' ->> 'room'
    )
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
    )
  );

DROP POLICY IF EXISTS aktivasi_insert_ppa ON public.aktivasi_mpp;
CREATE POLICY aktivasi_insert_ppa ON public.aktivasi_mpp
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'ppa'
      AND ruang = auth.jwt() -> 'app_metadata' ->> 'room'
    )
  );

DROP POLICY IF EXISTS aktivasi_delete_pending_role ON public.aktivasi_mpp;
CREATE POLICY aktivasi_delete_pending_role ON public.aktivasi_mpp
  FOR DELETE TO authenticated
  USING (
    status = 'Menunggu'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      OR (
        auth.jwt() -> 'app_metadata' ->> 'role' = 'ppa'
        AND ruang = auth.jwt() -> 'app_metadata' ->> 'room'
      )
      OR (
        auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
        AND mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
      )
    )
  );

DROP POLICY IF EXISTS aktivasi_update_mpp ON public.aktivasi_mpp;
CREATE POLICY aktivasi_update_mpp ON public.aktivasi_mpp
  FOR UPDATE TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
    )
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
    )
  );

DROP POLICY IF EXISTS form_a_mpp_access ON public.form_a_mpp;
CREATE POLICY form_a_mpp_access ON public.form_a_mpp
  FOR ALL TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND EXISTS (
        SELECT 1 FROM public.aktivasi_mpp a
        WHERE a.id = aktivasi_mpp_id
          AND a.mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
      )
    )
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND EXISTS (
        SELECT 1 FROM public.aktivasi_mpp a
        WHERE a.id = aktivasi_mpp_id
          AND a.mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
      )
    )
  );

DROP POLICY IF EXISTS tindak_lanjut_mpp_access ON public.tindak_lanjut_mpp;
CREATE POLICY tindak_lanjut_mpp_access ON public.tindak_lanjut_mpp
  FOR ALL TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND EXISTS (
        SELECT 1 FROM public.aktivasi_mpp a
        WHERE a.id = aktivasi_mpp_id
          AND a.mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
      )
    )
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
      AND EXISTS (
        SELECT 1 FROM public.aktivasi_mpp a
        WHERE a.id = aktivasi_mpp_id
          AND a.mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
      )
    )
  );

DROP POLICY IF EXISTS tindak_lanjut_ppa_read ON public.tindak_lanjut_mpp;
CREATE POLICY tindak_lanjut_ppa_read ON public.tindak_lanjut_mpp
  FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' IN ('ppa', 'admin'));

CREATE OR REPLACE FUNCTION public.simpan_tindak_lanjut_mpp(
  p_aktivasi_mpp_id UUID,
  p_tanggal_tl DATE,
  p_nama_petugas_mpp VARCHAR,
  p_analisis_informasi TEXT[],
  p_plan_of_care TEXT,
  p_keterangan TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('mpp', 'admin') THEN
    RAISE EXCEPTION 'Akses hanya untuk petugas MPP.' USING ERRCODE = '42501';
  END IF;

  IF auth.jwt() -> 'app_metadata' ->> 'role' = 'mpp'
    AND NOT EXISTS (
      SELECT 1 FROM public.aktivasi_mpp a
      WHERE a.id = p_aktivasi_mpp_id
        AND a.mpp_tujuan = auth.jwt() -> 'app_metadata' ->> 'mpp_tujuan'
    ) THEN
    RAISE EXCEPTION 'Aktivasi ini tidak ditugaskan kepada akun MPP Anda.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.tindak_lanjut_mpp (
    aktivasi_mpp_id,
    tanggal_tl,
    nama_petugas_mpp,
    analisis_informasi,
    plan_of_care,
    keterangan,
    waktu_diperbarui
  ) VALUES (
    p_aktivasi_mpp_id,
    p_tanggal_tl,
    p_nama_petugas_mpp,
    COALESCE(p_analisis_informasi, '{}'),
    p_plan_of_care,
    p_keterangan,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (aktivasi_mpp_id) DO UPDATE SET
    tanggal_tl = EXCLUDED.tanggal_tl,
    nama_petugas_mpp = EXCLUDED.nama_petugas_mpp,
    analisis_informasi = EXCLUDED.analisis_informasi,
    plan_of_care = EXCLUDED.plan_of_care,
    keterangan = EXCLUDED.keterangan,
    waktu_diperbarui = CURRENT_TIMESTAMP
  RETURNING id INTO v_id;

  UPDATE public.aktivasi_mpp
  SET status = 'Selesai'
  WHERE id = p_aktivasi_mpp_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.simpan_tindak_lanjut_mpp(
  UUID, DATE, VARCHAR, TEXT[], TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.simpan_tindak_lanjut_mpp(
  UUID, DATE, VARCHAR, TEXT[], TEXT, TEXT
) TO authenticated;
