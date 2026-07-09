
-- Clean up orphaned demo rows so we can enforce ownership
DELETE FROM public.reports WHERE patient_id IN (SELECT id FROM public.patients WHERE user_id IS NULL);
DELETE FROM public.patients WHERE user_id IS NULL;

ALTER TABLE public.patients
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;

DROP POLICY IF EXISTS "Demo open access - patients" ON public.patients;

CREATE POLICY "Users can view their own patients"
  ON public.patients FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own patients"
  ON public.patients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own patients"
  ON public.patients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own patients"
  ON public.patients FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Demo open access - reports" ON public.reports;

CREATE POLICY "Users can view their own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reports"
  ON public.reports FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
