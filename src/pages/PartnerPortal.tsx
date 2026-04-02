import { useState, useEffect } from "react";
import "@/styles/partner-portal.css";
import { Link } from "react-router-dom";
import { Shield, Zap, Lock, CheckCircle } from "lucide-react";
import ppLogo from "@/assets/ezonramp-pp-logo.png";
import CustomConnectButton from "@/components/CustomConnectButton";
import { CoinbaseHeadlessOnramp } from "@/components/CoinbaseHeadlessOnramp";
import { CoinbaseOnrampWidget } from "@/components/CoinbaseOnrampWidget";
import { StripeOnramp } from "@/components/StripeOnramp";
import { useOnrampProviders } from "@/hooks/useOnrampProviders";
import { Loader2, CreditCard, Wallet, Globe, DollarSign } from "lucide-react";

const getTabIcon = (name: string) => {
  switch (name) {
    case 'coinbase': return Wallet;
    case 'coinbase_global': return Globe;
    case 'stripe': return DollarSign;
    default: return CreditCard;
  }
};

const PartnerPortal = () => {
  const { data: providers, isLoading: providersLoading } = useOnrampProviders();
  const [activeTab, setActiveTab] = useState<string>('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (providers && providers.length > 0 && !activeTab) {
      setActiveTab(providers[0].name);
    }
  }, [providers, activeTab]);

  // Filter to only supported partner portal providers
  const supportedProviders = providers?.filter(p =>
    ['stripe', 'coinbase', 'coinbase_global'].includes(p.name)
  ) || [];

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div
        className={`pp-root min-h-screen flex flex-col transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Radial glow background */}
        <div className="pp-glow" />

        {/* Top strip */}
        <header className="pp-header">
          <div className="pp-header-inner">
            <div className="flex items-center gap-2">
              <img src={ppLogo} alt="EZOnRamp" className="h-[1.875rem] w-auto" />
            </div>
            <div className="[&_button]:!bg-[#1C1C1C] [&_button]:!text-white [&_button]:!border-white/10 [&_button]:hover:!bg-[#2E9484] [&_button]:hover:!border-[#3AAD9A]/50">
              <CustomConnectButton />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center px-4 pt-6 pb-24">
          <div className="pp-container w-full">
            {/* Headline */}
            <div className="text-center mb-6">
              <h1 className="text-2xl md:text-3xl font-bold pp-text-white mb-2">
                Add Funds to Your Wallet
              </h1>
            </div>

            {/* Context message */}
            <div className="pp-context-msg mb-4">
              <p className="text-xs pp-text-secondary text-center">
                If you already purchased USDC, return to your wallet and complete your deposit.
              </p>
            </div>

            {/* Tab selector */}
            {providersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin pp-text-secondary" />
              </div>
            ) : supportedProviders.length > 1 ? (
              <div className="flex justify-center mb-4">
                <div className="pp-tab-bar">
                  {supportedProviders.map((provider) => {
                    const Icon = getTabIcon(provider.name);
                    const isActive = activeTab === provider.name;
                    return (
                      <button
                        key={provider.id}
                        onClick={() => setActiveTab(provider.name)}
                        className={`pp-tab ${isActive ? 'pp-tab-active' : 'pp-tab-inactive'}`}
                      >
                        <Icon className="h-4 w-4 hidden md:block" />
                        <span className="text-xs md:text-sm font-medium">{provider.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Onramp card */}
            <div className="pp-card">
              {/* Provider label */}
              <div className="pp-provider-label">
                Powered by{' '}
                {activeTab === 'stripe' ? 'Stripe' : activeTab === 'coinbase' ? 'Coinbase' : activeTab === 'coinbase_global' ? 'Coinbase' : '—'}
              </div>

              {/* Widget content */}
              <div className="pp-widget-content">
                {activeTab === 'coinbase' && (
                  <CoinbaseHeadlessOnramp defaultAsset="USDC" defaultNetwork="solana" />
                )}
                {activeTab === 'coinbase_global' && (
                  <CoinbaseOnrampWidget defaultAsset="USDC" defaultNetwork="solana" subtitle="Requires Coinbase account. May require KYC." />
                )}
                {activeTab === 'stripe' && (
                  <StripeOnramp defaultAsset="USDC" defaultNetwork="solana" theme="dark" />
                )}
              </div>
            </div>

            {/* Trust line */}
            <div className="pp-trust-line mt-5">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <span className="pp-trust-badge">
                  <Lock className="h-3 w-3" /> Secure
                </span>
                <span className="pp-trust-badge">
                  <Zap className="h-3 w-3" /> Fast
                </span>
                <span className="pp-trust-badge">
                  <Shield className="h-3 w-3" /> Non-custodial
                </span>
              </div>
              <p className="text-xs pp-text-secondary text-center mt-2 flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3 pp-text-success" />
                Your funds are sent directly to your wallet
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="pp-footer">
          <div className="flex items-center justify-center gap-4 text-xs pp-text-secondary">
            <Link to="/terms" className="hover:pp-text-white transition-colors">ToS</Link>
            <span>·</span>
            <Link to="/privacy" className="hover:pp-text-white transition-colors">Privacy</Link>
          </div>
        </footer>
      </div>
    </>
  );
};

export default PartnerPortal;
