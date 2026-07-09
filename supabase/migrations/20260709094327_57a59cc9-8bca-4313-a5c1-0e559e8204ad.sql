DROP POLICY IF EXISTS "Users can delete their own patients" ON public.patients;
DROP POLICY IF EXISTS "Users can insert their own patients" ON public.patients;
DROP POLICY IF EXISTS "Users can update their own patients" ON public.patients;
DROP POLICY IF EXISTS "Users can view their own patients" ON public.patients;
DROP POLICY IF EXISTS "Demo open access - patients" ON public.patients;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO anon, authenticated;
GRANT ALL ON public.patients TO service_role;

CREATE POLICY "Demo open access - patients"
ON public.patients
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can insert their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can update their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;
DROP POLICY IF EXISTS "Demo open access - reports" ON public.reports;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO anon, authenticated;
GRANT ALL ON public.reports TO service_role;

CREATE POLICY "Demo open access - reports"
ON public.reports
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);