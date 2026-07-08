
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  input_text TEXT NOT NULL,
  user_id UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO anon, authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Demo open access - patients" ON public.patients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  structured_data JSONB,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO anon, authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Demo open access - reports" ON public.reports FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX reports_patient_id_idx ON public.reports(patient_id);
CREATE INDEX reports_created_at_idx ON public.reports(created_at DESC);
