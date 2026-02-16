-- Drop the trigger that automatically creates a user in public.users
-- preventing conflicts with our manual user creation logic in the backend.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
