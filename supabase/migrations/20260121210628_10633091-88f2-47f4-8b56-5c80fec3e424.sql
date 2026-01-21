-- Add wallet_address column to profiles to store user's linked Particle wallet
ALTER TABLE public.profiles 
ADD COLUMN wallet_address text,
ADD COLUMN wallet_network text DEFAULT 'solana';

-- Create index for faster wallet lookups
CREATE INDEX idx_profiles_wallet_address ON public.profiles(wallet_address);

-- Add constraint to ensure wallet addresses are unique (one wallet per user, one user per wallet)
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_wallet_address_unique UNIQUE (wallet_address);

-- Update RLS policy to allow users to update their own wallet address
-- The existing "Users can update own profile" policy already allows this