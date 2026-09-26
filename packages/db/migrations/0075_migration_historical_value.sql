-- Estimated historical value is operational analytics, never payment/accounting truth.
alter table public.migration_records add column if not exists estimated_value_cents integer check(estimated_value_cents is null or estimated_value_cents>=0);
alter table public.migration_records add column if not exists valuation_basis text check(valuation_basis is null or valuation_basis in ('historical_session_estimate'));
alter table public.migration_records add column if not exists valuation_rate_cents integer check(valuation_rate_cents is null or valuation_rate_cents>0);
comment on column public.migration_records.estimated_value_cents is 'Estimated operational value only; never proof of payment, receivable, cash, revenue, package ownership or settlement.';
