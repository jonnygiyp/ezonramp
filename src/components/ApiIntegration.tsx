import { useEffect, useState } from "react";
import { initOnRamp, CBPayInstanceType } from "@coinbase/cbpay-js";
import { Card } from "./ui/card";

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
    if (apis.length === 0 || !apis[0].appId) return;

    initOnRamp(
      {
        appId: apis[0].appId,
        target: '#coinbase-onramp-embedded',
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
      },
      (_, instance) => {
        setOnrampInstance(instance);
      }
    );

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
      <div className="max-w-4xl mx-auto space-y-6">
        <p className="text-center text-lg text-muted-foreground">
          Ready to buy? Try this simple on ramp below.
        </p>
        
        <Card className="overflow-hidden">
          <div 
            id="coinbase-onramp-embedded" 
            className="min-h-[600px] w-full"
          />
        </Card>
      </div>
    </div>
  );
};

export default ApiIntegration;
