# Accounts and Plus: plan

Status: not built. There is no sign-in today. Everything is saved on the device
through `assets/store.js`, and the Profile tab says so ("Accounts coming soon:
your progress is saved on this device").

## What is stored now

All keys go through `PhysioStore` and are saved in localStorage as
`physiolab:v1:<key>`, with the schema version in `physiolab:schema` (currently 1).

| Key | What | Shape |
| --- | --- | --- |
| `prefs.theme` | Light, dark or follow the device | `"light" \| "dark" \| "system"` |
| `tools.saved` | Starred tools | `["PV_Loop", ...]` (page slugs) |
| `tools.recent` | Last 8 tools opened | `[{ slug, at }]` |
| `resus.attempts` | Every Resus case finished or ended (max 500) | `[{ id, title, n, pts, of, pct, simSec, completed, outcome, random, solution, challenge, at }]` |
| `account.plus` | Entitlement flag (unused, always false) | `true \| false` |

Older keys still read directly by legacy code: `anaesthetic-physiology-colour-blind`
(colour-blind palette, theme.js) and `anaesthetic-physiology-scn-guide` (Resus guide
open state). The Challenge mode best score is kept by ecg-app.js itself.
Phase 1 keys `physiolab-saved` and `physiolab-recent` are migrated into the store
on first load and removed.

## Adapter point

`PhysioStore.setAdapter({ read(key), write(key, raw), remove(key), list() })`
swaps the storage backend. Values are passed as JSON strings. Nothing else on
the site needs to change, because every feature reads and writes through the store.

## Supabase plan (when Ed decides to add accounts)

1. **Auth**: Supabase Auth with email magic link (and optionally Google). The
   site stays static; the Supabase JS client is loaded only on Profile and when
   signed in.
2. **Table** `user_data`:
   - `user_id uuid references auth.users not null`
   - `key text not null` (the store key, e.g. `resus.attempts`)
   - `value jsonb not null`
   - `updated_at timestamptz not null default now()`
   - primary key `(user_id, key)`
   - Row level security: a user can select, insert, update and delete only rows
     where `user_id = auth.uid()`.
3. **Adapter**: a `SupabaseAdapter` that keeps localStorage as the fast local
   copy (reads are always local and synchronous), queues writes, and upserts
   them to `user_data` in the background. On sign-in it pulls every row and
   merges with what is on the device:
   - `resus.attempts`: union by `(id, at)`, then sort by `at` and keep the last 500.
   - `tools.saved`: union.
   - `tools.recent`, `prefs.*`: the newest `updated_at` wins.
4. **Plus**: `account.plus` would come from a server-side `entitlements` table
   (written by the payment webhook), never from the client. `PhysioPlus.isPlus()`
   already reads `account.plus`, and `PhysioPlus.canUse(feature)` checks the
   `FLAGS` list in store.js. Today every flag is free (`true`) except
   `progress.sync`, which is off until accounts exist. `PhysioPlus.badge()`
   renders a Plus badge but nothing shows it yet.
5. **Privacy**: update privacy.html before launch (what is stored, where, how to
   delete it). Profile already has "Clear data on this device"; add "Delete my
   account and data" that removes the user's rows.

## Decisions for Ed

- Which sign-in methods (magic link only, or Google as well).
- Which features become Plus, if any (the flags are ready, all free for now).
- Whether attempts history syncs for free users or only for Plus.
