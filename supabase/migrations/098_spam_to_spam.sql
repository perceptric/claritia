-- Spam goes to Spam (docs/on-submission.md). A form lead the routing spam check catches lands in that form's Spam
-- list (Form › Submissions › Spam, reason "routing"), the same list as fills the form's own checks catch. Its review
-- item is still written, dismissed, so "Not spam" can route the lead through the review machinery
-- (src/lib/routing/spamRelease.ts) with the spam check skipped. Leads from anywhere else (the handoff, the API) keep
-- their review item as before.

create or replace function public.routing_reviews_spam() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reason <> 'spam' or new.submission_id is null then return new; end if;
  if not exists (select 1 from submissions where id = new.submission_id and workspace_id = new.workspace_id and not test) then return new; end if;
  update submissions set spam = true, spam_reason = 'routing' where id = new.submission_id and workspace_id = new.workspace_id and not spam;
  new.state := 'dismissed';
  new.latest_action := jsonb_build_object('action', 'spam', 'at', now());
  -- The contact isn't waiting on anyone: clear its mark unless another item is open.
  if new.contact_id is not null then
    update contacts set route_status = null
    where id = new.contact_id and workspace_id = new.workspace_id and route_status = 'held'
      and not exists (select 1 from routing_reviews o where o.contact_id = new.contact_id and o.state not in ('resolved', 'dismissed'));
  end if;
  return new;
end;
$$;
-- Runs after routing_reviews_child (triggers fire by name): a child attempt folded into its parent's item never gets here.
drop trigger if exists routing_reviews_spam on public.routing_reviews;
create trigger routing_reviews_spam before insert on public.routing_reviews for each row execute function public.routing_reviews_spam();

-- Spam items already open move to Spam the same way.
update submissions s set spam = true, spam_reason = 'routing'
from routing_reviews r
where r.reason = 'spam' and r.submission_id = s.id and r.workspace_id = s.workspace_id and r.state = 'open' and not s.spam and not s.test;

update routing_reviews r set state = 'dismissed', revision = revision + 1, updated_at = now(), latest_action = jsonb_build_object('action', 'spam', 'at', now())
where r.reason = 'spam' and r.state = 'open'
  and exists (select 1 from submissions s where s.id = r.submission_id and s.workspace_id = r.workspace_id and s.spam_reason = 'routing');

update contacts c set route_status = null
where c.route_status = 'held'
  and exists (select 1 from routing_reviews r where r.contact_id = c.id and r.reason = 'spam' and r.latest_action->>'action' = 'spam')
  and not exists (select 1 from routing_reviews o where o.contact_id = c.id and o.state not in ('resolved', 'dismissed'));
