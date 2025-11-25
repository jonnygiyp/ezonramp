import { useEffect, useState } from "react";
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
  const [onrampUrl, setOnrampUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeOnramp = async () => {
      if (apis.length === 0 || !apis[0].appId) {
        setIsLoading(false);
        return;
      }

      try {
        // Generate session token from backend
        const response = await fetch(
          'https://aryusbuyyoxkeigzsnko.supabase.co/functions/v1/generate-coinbase-token',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              addresses: [
                {
                  address: '0x0000000000000000000000000000000000000000',
                  blockchains: ['ethereum', 'base', 'polygon']
                }
              ],
              assets: ['ETH', 'USDC', 'BTC'],
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to generate session token');
        }

        const { token } = await response.json();
        console.log('Session token received');

        // Build the onramp URL with session token
        const url = new URL('https://pay.coinbase.com/buy/select-asset');
        url.searchParams.set('appId', apis[0].appId);
        url.searchParams.set('sessionToken', token);
        url.searchParams.set('addresses', JSON.stringify({
          '0x0000000000000000000000000000000000000000': ['ethereum', 'base', 'polygon']
        }));
        url.searchParams.set('assets', JSON.stringify(['ETH', 'USDC', 'BTC']));

        setOnrampUrl(url.toString());
      } catch (error) {
        console.error('Error initializing onramp:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeOnramp();
  }, [apis]);

  const handleOpenOnramp = () => {
    if (onrampUrl) {
      window.open(onrampUrl, 'coinbase-onramp', 'width=500,height=700');
    }
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
            disabled={isLoading || !onrampUrl}
          >
            {isLoading ? 'Loading...' : 'Buy Crypto Now'}
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
