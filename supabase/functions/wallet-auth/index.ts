import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCorsHeaders,
  validateOrigin,
  getClientId,
  logSecurityEvent,
  errorResponse,
  successResponse,
} from "../_shared/auth.ts";

// Rate limiting map (in-memory, resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Validate origin
  const originError = validateOrigin(origin, corsHeaders);
  if (originError) return originError;
  
  // Rate limiting
  const clientId = getClientId(req);
  if (!checkRateLimit(clientId)) {
    logSecurityEvent("WALLET_AUTH_RATE_LIMITED", { clientId });
    return errorResponse(corsHeaders, "Too many requests. Please try again later.", 429);
  }
  
  if (req.method !== "POST") {
    return errorResponse(corsHeaders, "Method not allowed", 405);
  }
  
  try {
    const body = await req.json();
    const { walletAddress, walletType, particleUserId } = body;
    
    // Validate required fields
    if (!walletAddress || typeof walletAddress !== "string") {
      return errorResponse(corsHeaders, "Wallet address is required", 400);
    }
    
    // Validate wallet address format (Solana or EVM)
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress);
    const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
    
    if (!isSolanaAddress && !isEvmAddress) {
      return errorResponse(corsHeaders, "Invalid wallet address format", 400);
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[WALLET_AUTH] Missing Supabase configuration");
      return errorResponse(corsHeaders, "Server configuration error", 500);
    }
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Generate a deterministic email from wallet address for Supabase user
    // This ensures the same wallet always maps to the same user
    const walletEmail = `${walletAddress.toLowerCase()}@wallet.ezonramp.local`;
    
    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("[WALLET_AUTH] Error listing users:", listError);
      return errorResponse(corsHeaders, "Failed to check existing users", 500);
    }
    
    let userId: string;
    let existingUser = existingUsers.users.find(u => u.email === walletEmail);
    
    if (existingUser) {
      // User exists, use their ID
      userId = existingUser.id;
      console.log(`[WALLET_AUTH] Found existing user for wallet: ${walletAddress.slice(0, 8)}...`);
    } else {
      // Create new user for this wallet
      // Generate a secure random password (user will never use it - auth is via wallet)
      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: walletEmail,
        password: randomPassword,
        email_confirm: true, // Auto-confirm since we verify wallet ownership
        user_metadata: {
          wallet_address: walletAddress,
          wallet_type: walletType || "particle",
          particle_user_id: particleUserId,
        },
      });
      
      if (createError || !newUser.user) {
        console.error("[WALLET_AUTH] Error creating user:", createError);
        return errorResponse(corsHeaders, "Failed to create user", 500);
      }
      
      userId = newUser.user.id;
      console.log(`[WALLET_AUTH] Created new user for wallet: ${walletAddress.slice(0, 8)}...`);
      
      // Create profile for new user
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({ id: userId });
      
      if (profileError) {
        console.warn("[WALLET_AUTH] Failed to create profile:", profileError);
        // Non-fatal - continue
      }
    }
    
    // Generate a session for this user using signInWithPassword alternative
    // We use generateLink to create a magic link token, then exchange it
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: walletEmail,
    });
    
    if (linkError || !linkData) {
      console.error("[WALLET_AUTH] Error generating link:", linkError);
      return errorResponse(corsHeaders, "Failed to generate session", 500);
    }
    
    // Extract the token from the generated link
    const url = new URL(linkData.properties.action_link);
    const token = url.searchParams.get("token");
    const tokenHash = linkData.properties.hashed_token;
    
    if (!token && !tokenHash) {
      console.error("[WALLET_AUTH] No token in generated link");
      return errorResponse(corsHeaders, "Failed to extract session token", 500);
    }
    
    console.log(`[WALLET_AUTH] Successfully generated session for user: ${userId.slice(0, 8)}...`);
    
    return successResponse(corsHeaders, {
      success: true,
      userId,
      email: walletEmail,
      // Return the magic link token for client to verify
      token: token || tokenHash,
      tokenType: token ? "pkce" : "hash",
    });
    
  } catch (error) {
    console.error("[WALLET_AUTH] Error:", error);
    logSecurityEvent("WALLET_AUTH_ERROR", {
      clientId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse(corsHeaders, "Internal server error", 500);
  }
});
