
UPDATE public.onramp_providers
SET enabled = true,
    display_name = 'MoonPay',
    updated_at = now()
WHERE name = 'moonpay';
