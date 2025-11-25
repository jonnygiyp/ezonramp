import { useEffect, useState } from "react";
import { initOnRamp, CBPayInstanceType } from "@coinbase/cbpay-js";
import { Button } from "./ui/button";

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

  useEffect(() => {
    // Initialize Coinbase Onramp SDK
    if (apis.length > 0 && apis[0].appId) {
      initOnRamp({
        appId: apis[0].appId,
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
      });
    }

    return () => {
      onrampInstance?.destroy();
    };
  }, [apis]);

  const handleOpenOnramp = () => {
    onrampInstance?.open();
  };

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
    <div className="w-full min-h-[600px] flex items-center justify-center px-6 py-12">
      <div className="text-center space-y-8 max-w-2xl mx-auto">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Buy Crypto with {apis[0].name}</h1>
          <p className="text-xl text-muted-foreground">
            Purchase cryptocurrency quickly and securely using your preferred payment method
          </p>
        </div>
        
        <div className="space-y-6">
          <Button 
            onClick={handleOpenOnramp}
            size="lg"
            className="text-lg px-8 py-6 hover-scale"
            disabled={!onrampInstance}
          >
            {onrampInstance ? 'Buy Crypto Now' : 'Loading...'}
          </Button>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground pt-4">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl">⚡</span>
              </div>
              <p className="font-medium">Fast Transactions</p>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl">🔒</span>
              </div>
              <p className="font-medium">Secure Processing</p>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-2xl">🌐</span>
              </div>
              <p className="font-medium">Multiple Blockchains</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiIntegration;
