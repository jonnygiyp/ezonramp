import { useState, useEffect } from "react";
import "@/styles/dark-portal.css";
import { Link } from "react-router-dom";
import { Shield, Zap, Lock, CheckCircle } from "lucide-react";
import CustomConnectButton from "@/components/CustomConnectButton";
import { CoinbaseHeadlessOnramp } from "@/components/CoinbaseHeadlessOnramp";
import { CoinbaseOnrampWidget } from "@/components/CoinbaseOnrampWidget";
import { StripeOnramp } from "@/components/StripeOnramp";
import { useOnrampProviders } from "@/hooks/useOnrampProviders";
import { useGeoLocation } from "@/hooks/useGeoLocation";
import { resolveInitialRamp, writeManualRamp } from "@/lib/rampSelection";
import { Loader2, CreditCard, Wallet, Globe, DollarSign } from "lucide-react";
import ezorLogo from "@/assets/ezor-crimson.png";

const getTabIcon = (name: string) => {
  switch (name) {
    case 'coinbase': return Wallet;
    case 'coinbase_global': return Globe;
    case 'stripe': return DollarSign;
    default: return CreditCard;
  }
};

const DarkPortal = () => {
  const { data: providers, isLoading: providersLoading } = useOnrampProviders();
  const { data: geo, isLoading: geoLoading } = useGeoLocation();
  const [activeTab, setActiveTab] = useState<string>('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const supportedProviders = providers?.filter(p =>
    ['stripe', 'coinbase', 'coinbase_global'].includes(p.name)
  ) || [];

  // Region-based default ramp resolution (Stripe for US, Coinbase Global elsewhere).
  // Manual choices stored in localStorage win over the geo default.
  useEffect(() => {
    if (activeTab) return;
    if (!supportedProviders.length) return;
    if (geoLoading) return;
    const available = supportedProviders.map(p => p.name);
    const chosen = resolveInitialRamp({ isUs: !!geo?.is_us, available });
    if (chosen) {
      console.log('[DarkPortal] initial ramp resolved', {
        country: geo?.country_code,
        is_us: geo?.is_us,
        chosen,
        available,
      });
      setActiveTab(chosen);
    }
  }, [supportedProviders, geo, geoLoading, activeTab]);

  const handleTabChange = (name: string) => {
    if (name === activeTab) return;
    console.log('[DarkPortal] manual ramp override', { from: activeTab, to: name });
    writeManualRamp(name);
    setActiveTab(name);
  };

  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <div
        className={`dp-root min-h-screen flex flex-col transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Radial glow background */}
        <div className="dp-glow" />

        {/* Header with logo + nav */}
        <header className="dp-header">
          <div className="dp-header-inner">
            {/* Left: Logo */}
            <img src={ezorLogo} alt="EZOR" className="dp-header-logo" />

            {/* Right: Nav + Connect */}
            <div className="dp-header-right">
              <nav className="dp-header-nav hidden sm:flex">
                <a href="/#home">Home</a>
                <a href="/#about">About</a>
                <a href="/#faq">FAQ</a>
                <a href="/#contact">Contact</a>
              </nav>
              <div className="[&_button]:!bg-[#1C1C1C] [&_button]:!text-white [&_button]:!border-white/10 [&_button]:hover:!bg-[#420010] [&_button]:hover:!border-[#E0004C]/50">
                <CustomConnectButton />
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center px-4 pt-6 pb-24">
          <div className="dp-container w-full">
            {/* Headline */}
            <div className="text-center mb-6">
              <h1 className="text-2xl md:text-3xl font-bold dp-text-white">
                Add Funds to Your Wallet
              </h1>
            </div>

            {/* Context message */}
            <div className="dp-context-msg mb-4">
              <p className="text-[11px] dp-text-secondary text-center">
                If you already purchased USDC, return to your wallet and complete your deposit.
              </p>
            </div>

            {/* Tab selector — wait for geo to avoid flicker on first paint */}
            {providersLoading || (geoLoading && !activeTab) ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin dp-text-secondary" />
              </div>
            ) : supportedProviders.length > 1 ? (
              <>
                <div className="flex justify-center mb-2">
                  <div className="dp-tab-bar">
                    {supportedProviders.map((provider) => {
                      const Icon = getTabIcon(provider.name);
                      const isActive = activeTab === provider.name;
                      return (
                        <button
                          key={provider.id}
                          onClick={() => handleTabChange(provider.name)}
                          className={`dp-tab ${isActive ? 'dp-tab-active' : 'dp-tab-inactive'}`}
                        >
                          <Icon className="h-4 w-4 hidden md:block" />
                          <span className="text-xs md:text-sm font-medium">{provider.display_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[11px] dp-text-secondary text-center mb-4">
                  Payment options are selected based on your region and availability
                </p>
              </>
            ) : null}

            {/* Onramp card */}
            <div className="dp-card">
              <div className="dp-provider-label">
                Powered by{' '}
                {activeTab === 'stripe' ? 'Stripe' : activeTab === 'coinbase' ? 'Coinbase' : activeTab === 'coinbase_global' ? 'Coinbase' : '—'}
              </div>

              <div className="dp-widget-content">
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
            <div className="dp-trust-line mt-5">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <span className="dp-trust-badge">
                  <Lock className="h-3 w-3" /> Secure
                </span>
                <span className="dp-trust-badge">
                  <Zap className="h-3 w-3" /> Fast
                </span>
                <span className="dp-trust-badge">
                  <Shield className="h-3 w-3" /> Non-custodial
                </span>
              </div>
              <p className="text-xs dp-text-secondary text-center mt-2 flex items-center justify-center gap-1">
                <CheckCircle className="h-3 w-3 dp-text-success" />
                Your funds are sent directly to your wallet
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="dp-footer">
          <div className="flex items-center justify-center gap-4 text-[11px] dp-text-secondary">
            <Link to="/terms" className="hover:dp-text-white transition-colors">ToS</Link>
            <span>·</span>
            <Link to="/privacy" className="hover:dp-text-white transition-colors">Privacy</Link>
          </div>
        </footer>
      </div>
    </>
  );
};

export default DarkPortal;
