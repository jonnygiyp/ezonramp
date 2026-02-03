-- Add RLS policy for users to view their own transactions based on wallet_address
-- Users can view transactions where the wallet_address matches their profile's wallet_address
CREATE POLICY "Users can view own transactions by wallet"
ON public.transaction_audit_log
FOR SELECT
USING (
  wallet_address IN (
    SELECT wallet_address 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND wallet_address IS NOT NULL
  )
);