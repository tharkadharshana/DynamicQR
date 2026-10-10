-- Founder queries. Paste into the Supabase SQL editor; nothing here changes data.

-- 1. Activation funnel per account (who is stuck where).
select p.email,
       p.plan,
       p.is_trial,
       bool_or(e.name = 'qr_created')    as created,
       bool_or(e.name = 'print_opened')  as printed,
       bool_or(e.name = 'first_scan')    as scanned,
       bool_or(e.name = 'offer_changed') as changed_offer,
       bool_or(e.name = 'paid')          as paid,
       max(e.created_at)                 as last_event
from public.profiles p
left join public.events e on e.uid = p.id
group by p.id, p.email, p.plan, p.is_trial
order by last_event desc nulls last;

-- 2. Stuck accounts: created a code more than 3 days ago but never printed or got a scan.
select p.email, min(e.created_at) as first_code
from public.profiles p
join public.events e on e.uid = p.id and e.name = 'qr_created'
where not exists (select 1 from public.events x where x.uid = p.id and x.name in ('print_opened', 'first_scan'))
group by p.email
having min(e.created_at) < now() - interval '3 days'
order by first_code;

-- 3. Funnel totals (go/no-go tracking).
select name, count(distinct uid) as accounts
from public.events
group by name
order by accounts desc;

-- 4. Revenue by month and provider.
select date_trunc('month', created_at) as month, provider, currency,
       count(*) as payments, sum(amount::numeric) as total
from public.subscriptions
where status in ('active', 'cancelled')
group by 1, 2, 3
order by 1 desc;
