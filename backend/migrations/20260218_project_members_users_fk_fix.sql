-- Ensure project assignment FKs reference public.users (not legacy profiles)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'project_members'
  ) THEN
    ALTER TABLE public.project_members
      DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;

    ALTER TABLE public.project_members
      DROP CONSTRAINT IF EXISTS project_members_assigned_by_fkey;

    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_assigned_by_fkey
      FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
