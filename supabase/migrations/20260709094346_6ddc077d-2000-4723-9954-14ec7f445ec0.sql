DROP POLICY IF EXISTS "Demo open access - patients" ON public.patients;
DROP POLICY IF EXISTS "Demo open access - reports" ON public.reports;

CREATE POLICY "Demo patients can be created"
ON public.patients
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL);

CREATE POLICY "Demo patients can be viewed"
ON public.patients
FOR SELECT
TO anon, authenticated
USING (user_id IS NULL);

CREATE POLICY "Demo patients can be updated"
ON public.patients
FOR UPDATE
TO anon, authenticated
USING (user_id IS NULL)
WITH CHECK (user_id IS NULL);

CREATE POLICY "Demo patients can be deleted"
ON public.patients
FOR DELETE
TO anon, authenticated
USING (user_id IS NULL);

CREATE POLICY "Demo reports can be created"
ON public.reports
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL);

CREATE POLICY "Demo reports can be viewed"
ON public.reports
FOR SELECT
TO anon, authenticated
USING (user_id IS NULL);

CREATE POLICY "Demo reports can be updated"
ON public.reports
FOR UPDATE
TO anon, authenticated
USING (user_id IS NULL)
WITH CHECK (user_id IS NULL);

CREATE POLICY "Demo reports can be deleted"
ON public.reports
FOR DELETE
TO anon, authenticated
USING (user_id IS NULL);