BEGIN;

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
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - ARRAY[
    'tanggal', 'no_rm', 'nama_pasien', 'informed_consent', 'inden_bangsal',
    'jam_inden', 'jaminan', 'jam_daftar', 'nomor_bed', 'nama_dpjp',
    'koordinasi_kepala_ruang', 'koordinasi_dpjp', 'koordinasi_ibs',
    'koordinasi_lab', 'koordinasi_radiologi', 'fasilitas', 'advokasi',
    'edukasi', 'akar_masalah', 'bangsal_tujuan', 'tanggal_pindah',
    'jam_pindah', 'waktu_tunggu', 'lab_status', 'radiologi_status',
    'akomodasi_status', 'visit_dpjp_status', 'koordinasi', 'komunikasi',
    'kolaborasi', 'fasilitasi'
  ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
    'tanggal', 'no_rm', 'nama_pasien', 'informed_consent', 'inden_bangsal',
    'jam_inden', 'jaminan', 'jam_daftar', 'nomor_bed', 'nama_dpjp',
    'koordinasi_kepala_ruang', 'koordinasi_dpjp', 'koordinasi_ibs',
    'koordinasi_lab', 'koordinasi_radiologi', 'fasilitas', 'advokasi',
    'edukasi', 'akar_masalah', 'bangsal_tujuan', 'tanggal_pindah',
    'jam_pindah', 'waktu_tunggu', 'lab_status', 'radiologi_status',
    'akomodasi_status', 'visit_dpjp_status', 'koordinasi', 'komunikasi',
    'kolaborasi', 'fasilitasi'
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

COMMIT;
