import { useEffect, useState, useRef } from "react";
import { initOnRamp, CBPayInstanceType } from "@coinbase/cbpay-js";

interface ApiConfig {
  id: string;
  name: string;
  appId: string;
}

interface ApiIntegrationProps {
  apis: ApiConfig[];
}

const ApiIntegration = ({ apis }: ApiIntegrationProps) => {
  const [onrampInstance, setOnrampInstance] = useState<CBPayInstanceType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize Coinbase Onramp SDK
    if (apis.length > 0 && apis[0].appId && containerRef.current) {
      initOnRamp({
        appId: apis[0].appId,
        target: '#coinbase-onramp-container',
        widgetParameters: {
          addresses: { 
            '0x0000000000000000000000000000000000000000': ['ethereum', 'base', 'polygon'] 
          },
          assets: ['ETH', 'USDC', 'BTC'],
        },
        onSuccess: () => {
          console.log('Onramp purchase successful');
        },
        onExit: () => {
          console.log('Onramp closed');
        },
        onEvent: (event) => {
          console.log('Onramp event:', event);
        },
        experienceLoggedIn: 'embedded',
        experienceLoggedOut: 'embedded',
      }, (_, instance) => {
        setOnrampInstance(instance);
        instance?.open();
      });
    }

    return () => {
      onrampInstance?.destroy();
    };
  }, [apis]);

  if (apis.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[500px] px-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">No Onramp Configured</h2>
          <p className="text-muted-foreground max-w-md">
            Configure your API integrations to display onramp services here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Buy Crypto with {apis[0].name}</h1>
          <p className="text-muted-foreground">
            Purchase cryptocurrency quickly and securely using your preferred payment method
          </p>
        </div>
        
        <div 
          id="coinbase-onramp-container"
          ref={containerRef}
          className="w-full min-h-[600px] bg-card border border-border rounded-lg overflow-hidden shadow-sm"
        >
          {!onrampInstance && (
            <div className="flex items-center justify-center h-[600px]">
              <div className="text-center space-y-4">
                <div className="animate-pulse text-muted-foreground">Loading Coinbase Onramp...</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiIntegration;
