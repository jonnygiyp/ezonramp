import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { loadStripeOnramp } from "@stripe/crypto";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle, XCircle } from "lucide-react";

export default function StripeOnrampPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const onrampContainerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'mounted' | 'complete' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const mountedRef = useRef(false);

  const clientSecret = searchParams.get('client_secret');
  const publishableKey = searchParams.get('pk');

  useEffect(() => {
    if (!clientSecret || !publishableKey || mountedRef.current) return;

    const initOnramp = async () => {
      try {
        console.log("[StripeOnrampPage] Loading Stripe Onramp...");
        const stripeOnramp = await loadStripeOnramp(publishableKey);
        
        if (!stripeOnramp) {
          throw new Error("Stripe Onramp SDK returned null");
        }

        if (onrampContainerRef.current && !mountedRef.current) {
          mountedRef.current = true;
          const session = stripeOnramp.createSession({ clientSecret });
          
          session.addEventListener('onramp_session_updated', (event) => {
            console.log('[StripeOnrampPage] Session updated:', event.payload);
            if (event.payload.session.status === 'fulfillment_complete') {
              setStatus('complete');
            }
          });

          session.mount(onrampContainerRef.current);
          setStatus('mounted');
        }
      } catch (err) {
        console.error("[StripeOnrampPage] Error:", err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load onramp');
        setStatus('error');
      }
    };

    initOnramp();
  }, [clientSecret, publishableKey]);

  if (!clientSecret || !publishableKey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <XCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Invalid Session</h1>
          <p className="text-muted-foreground">Missing required parameters</p>
          <Button onClick={() => window.close()}>Close Window</Button>
        </div>
      </div>
    );
  }

  if (status === 'complete') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold">Purchase Complete!</h1>
          <p className="text-muted-foreground">Your crypto has been sent to your wallet</p>
          <Button onClick={() => window.close()}>Close Window</Button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <XCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Error</h1>
          <p className="text-muted-foreground">{errorMessage}</p>
          <Button onClick={() => window.close()}>Close Window</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.close()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Buy Crypto with Stripe</h1>
        </div>
      </header>
      
      <main className="max-w-4xl mx-auto p-4">
        {status === 'loading' && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading Stripe Onramp...</span>
          </div>
        )}
        
        <div 
          ref={onrampContainerRef} 
          className="min-h-[600px] rounded-xl overflow-hidden"
          style={{ display: status === 'mounted' ? 'block' : 'none' }}
        />
      </main>
    </div>
  );
}
