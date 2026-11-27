-- Plus waitlist table for The Physio Lab.
-- created_at records when consent was given; consent_version records which
-- consent wording and privacy notice were shown (see assets/waitlist.js).
-- Project region must be London (eu-west-2) to match the privacy notice.
-- Run once in the Supabase SQL editor (or as a migration) on the project that
-- will hold sign-ups. The public (anon) key can INSERT only: no select, update
-- or delete, so the list of emails cannot be read from the website.

create table if not exists public.waitlist (
  id         bigint generated always as identity primary key,
  email      text not null,
  role       text,
  consent_version text,
  source     text,
  created_at timestamptz not null default now(),
  constraint waitlist_email_len check (char_length(email) between 5 and 254),
  constraint waitlist_email_fmt check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_role_ok check (
    role is null or role in (
      'medical student (preclinical)', 'medical student (clinical)',
      'foundation doctor', 'other'
    )
  ),
  constraint waitlist_meta_len check (
    char_length(coalesce(consent_version, '')) <= 60 and char_length(coalesce(source, '')) <= 60
  )
);

-- One row per email address, ignoring case.
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

revoke all on public.waitlist from anon, authenticated;
grant insert (email, role, consent_version, source) on public.waitlist to anon;

drop policy if exists "anon can join the waitlist" on public.waitlist;
create policy "anon can join the waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);
