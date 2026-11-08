-- 137: Saved views no longer name the Visitors and Accounts screens, which 135 took out with visitor identification.
delete from public.saved_views where screen in ('visitors', 'accounts');
alter table public.saved_views drop constraint if exists saved_views_screen_check;
alter table public.saved_views add constraint saved_views_screen_check check (screen ~ '^(contacts|leads|companies|object:[a-z][a-z0-9_]{0,39})$');
