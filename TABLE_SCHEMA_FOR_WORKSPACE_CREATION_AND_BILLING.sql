create table public.workspaces (
  id uuid not null default gen_random_uuid (),
  name text not null,
  type text not null,
  owner_id uuid null,
  created_at timestamp with time zone null default now(),
  plan text not null default 'free'::text,
  slug text not null,
  settings jsonb not null default '{}'::jsonb,
  team_id uuid null,
  updated_at timestamp with time zone null,
  constraint workspaces_pkey primary key (id),
  constraint workspaces_slug_key unique (slug),
  constraint workspaces_owner_id_fkey foreign KEY (owner_id) references users (id) on delete CASCADE,
  constraint workspaces_plan_check check (
    (
      plan = any (
        array[
          'Free'::text,
          'Dev'::text,
          'Team'::text,
          'Enterprise'::text
        ]
      )
    )
  ),
  constraint workspaces_type_check check (
    (
      type = any (array['personal'::text, 'team'::text])
    )
  )
) TABLESPACE pg_default;

create trigger update_workspaces_updated_at BEFORE
update on workspaces for EACH row
execute FUNCTION update_updated_at ();



create table public.subscriptions (
  id uuid not null default gen_random_uuid (),
  provider text null,
  provider_subscription_id text null,
  plan text null,
  status text null,
  current_period_end timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  workspace_id uuid null,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_workspace_id_fkey foreign KEY (workspace_id) references workspaces (id)
) TABLESPACE pg_default;

create index IF not exists idx_subscriptions_workspace_id on public.subscriptions using btree (workspace_id) TABLESPACE pg_default;



create table public.workspace_members (
  id uuid not null default gen_random_uuid (),
  workspace_id uuid null,
  user_id uuid null,
  role text not null,
  status text not null default 'active'::text,
  joined_at timestamp with time zone null default now(),
  constraint workspace_members_pkey primary key (id),
  constraint workspace_members_workspace_id_user_id_key unique (workspace_id, user_id),
  constraint workspace_members_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint workspace_members_workspace_id_fkey foreign KEY (workspace_id) references workspaces (id) on delete CASCADE,
  constraint workspace_members_role_check check (
    (
      role = any (
        array[
          'owner'::text,
          'admin'::text,
          'developer'::text,
          'viewer'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_workspace_members_workspace_id on public.workspace_members using btree (workspace_id) TABLESPACE pg_default;

create index IF not exists idx_workspace_members_user_id on public.workspace_members using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_workspace_members_status on public.workspace_members using btree (workspace_id, status) TABLESPACE pg_default;


create table public.workspace_invitations (
  id uuid not null default gen_random_uuid (),
  workspace_id uuid not null,
  email text not null,
  role text not null,
  invited_by uuid not null,
  token text not null default encode(extensions.gen_random_bytes (32), 'hex'::text),
  status text not null default 'pending'::text,
  expires_at timestamp with time zone not null default (now() + '7 days'::interval),
  accepted_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  constraint workspace_invitations_pkey primary key (id),
  constraint workspace_invitations_workspace_id_email_status_key unique (workspace_id, email, status),
  constraint workspace_invitations_token_key unique (token),
  constraint workspace_invitations_workspace_id_fkey foreign KEY (workspace_id) references workspaces (id) on delete CASCADE,
  constraint workspace_invitations_invited_by_fkey foreign KEY (invited_by) references users (id) on delete CASCADE,
  constraint workspace_invitations_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'accepted'::text,
          'revoked'::text,
          'expired'::text
        ]
      )
    )
  ),
  constraint workspace_invitations_role_check check (
    (
      role = any (
        array[
          'owner'::text,
          'admin'::text,
          'developer'::text,
          'viewer'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_workspace_invitations_workspace on public.workspace_invitations using btree (workspace_id) TABLESPACE pg_default;

create index IF not exists idx_workspace_invitations_token on public.workspace_invitations using btree (token) TABLESPACE pg_default;

create index IF not exists idx_workspace_invitations_status on public.workspace_invitations using btree (workspace_id, status) TABLESPACE pg_default;





create table public.users (
  id uuid not null,
  email text null,
  full_name text null,
  avatar_url text null,
  onboarding_completed boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  onboarding_state jsonb null default '{"completed_at": null, "last_updated": null, "steps_skipped": [], "repos_imported": false, "steps_completed": [], "banner_dismissed": false, "github_connected": false, "workspace_created": false}'::jsonb,
  constraint users_pkey primary key (id),
  constraint users_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_users_email on public.users using btree (email) TABLESPACE pg_default;

create index IF not exists idx_users_onboarding_state on public.users using gin (onboarding_state) TABLESPACE pg_default;

create trigger set_users_updated_at BEFORE
update on users for EACH row
execute FUNCTION handle_updated_at ();

create trigger update_users_updated_at BEFORE
update on users for EACH row
execute FUNCTION update_updated_at_column ();