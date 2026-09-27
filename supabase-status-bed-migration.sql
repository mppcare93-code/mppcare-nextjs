BEGIN;

ALTER TABLE public.monitoring_igd
  ADD COLUMN IF NOT EXISTS status_bed TEXT NOT NULL DEFAULT 'Menunggu Cleaning Service',
  ADD COLUMN IF NOT EXISTS bed_ready_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'monitoring_igd_status_bed_check'
      AND conrelid = 'public.monitoring_igd'::regclass
  ) THEN
    ALTER TABLE public.monitoring_igd
      ADD CONSTRAINT monitoring_igd_status_bed_check
      CHECK (status_bed IN (
        'Menunggu Cleaning Service',
        'Menunggu Linen/Alat',
        'Kamar Siap - Menunggu Transpor'
      ));
  END IF;
END;
$$;

COMMIT;