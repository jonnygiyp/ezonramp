import { useState, useEffect } from "react";
import "@/styles/partner-portal.css";
import { Link } from "react-router-dom";
import { Shield, Zap, Lock, CheckCircle, HelpCircle, X, User } from "lucide-react";
import ppLogo from "@/assets/ezonramp-pp-logo.png";
import { CoinbaseHeadlessOnramp } from "@/components/CoinbaseHeadlessOnramp";
import { CoinbaseOnrampWidget } from "@/components/CoinbaseOnrampWidget";
import { StripeOnramp } from "@/components/StripeOnramp";
import { useOnrampProviders } from "@/hooks/useOnrampProviders";
import { Loader2, CreditCard, Wallet, Globe, DollarSign } from "lucide-react";
import { useFAQContent } from "@/hooks/useSiteContent";
import DOMPurify from "dompurify";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAccount } from "@/hooks/useParticle";
import { useGeoLocation } from "@/hooks/useGeoLocation";
import { resolveInitialRamp, writeManualRamp } from "@/lib/rampSelection";
import AccountModal from "@/components/AccountModal";
import PartnerPortalTutorial from "@/components/PartnerPortalTutorial";

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
  const { data: geo, isLoading: geoLoading } = useGeoLocation();
  const [activeTab, setActiveTab] = useState<string>('');
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const { data: faqData } = useFAQContent();
  const { isConnected } = useAccount();

  const defaultFaqs = [
    { question: "What is a crypto onramp?", answer: "A crypto onramp is a service that allows you to convert traditional currency (like USD) into cryptocurrency." },
    { question: "How long does a transaction take?", answer: "Transaction times vary depending on the payment method and network conditions. Credit card purchases are typically instant, while bank transfers may take 1-3 business days." },
    { question: "Is my personal information secure?", answer: "Yes, all personal information is encrypted and stored securely. We comply with industry-standard security practices." },
    { question: "What payment methods do you accept?", answer: "We accept major credit and debit cards, as well as bank transfers. Available methods may vary by location." },
    { question: "Are there any fees?", answer: "Fees vary by payment method and provider. Each service displays its fees transparently before you complete a transaction." },
  ];
  const faqs = faqData?.items?.length ? faqData.items : defaultFaqs;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Filter to only supported partner portal providers
  const supportedProviders = providers?.filter(p =>
    ['stripe', 'coinbase', 'coinbase_global'].includes(p.name)
  ) || [];

  // Resolve initial ramp once providers and geo have both loaded.
  // Manual choices stored in localStorage win; otherwise we route US -> Stripe,
  // non-US -> Coinbase Global. Geolocation is informational, never a hard gate.
  useEffect(() => {
    if (activeTab) return;
    if (!supportedProviders.length) return;
    if (geoLoading) return; // wait so we don't flicker provider on first paint
    const available = supportedProviders.map(p => p.name);
    const chosen = resolveInitialRamp({ isUs: !!geo?.is_us, available });
    if (chosen) {
      console.log('[PartnerPortal] initial ramp resolved', {
        country: geo?.country_code,
        is_us: geo?.is_us,
        chosen,
        available,
      });
      setActiveTab(chosen);
    }
  }, [supportedProviders, geo, geoLoading, activeTab]);

  // Persist manual ramp choice so the user is not bounced back by geo on reload.
  const handleTabChange = (name: string) => {
    if (name === activeTab) return;
    console.log('[PartnerPortal] manual ramp override', { from: activeTab, to: name });
    writeManualRamp(name);
    setActiveTab(name);
  };

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
            <div className="flex items-center gap-2">
              {isConnected && (
                <button
                  data-pp-tut="account"
                  onClick={() => setAccountModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#BABABA] bg-[#1C1C1C] border border-white/10 hover:bg-[#2E9484] hover:text-white hover:border-[#3AAD9A]/50 transition-all duration-200"
                >
                  <User className="h-3.5 w-3.5" />
                  My Account
                </button>
              )}
              <button
                data-pp-tut="help"
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#BABABA] bg-[#1C1C1C] border border-white/10 hover:bg-[#2E9484] hover:text-white hover:border-[#3AAD9A]/50 transition-all duration-200"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Help
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center px-4 pt-6 pb-24">
          <div className="pp-container w-full">
            {/* Headline */}
            <div className="text-center mb-6" data-pp-tut="headline">
              <h1 className="text-xl md:text-2xl font-bold pp-text-white mb-2">
                Add Funds to Your Wallet
              </h1>
            </div>

            {/* Tab selector — wait on geo so we don't flicker the wrong default */}
            {providersLoading || (geoLoading && !activeTab) ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin pp-text-secondary" />
              </div>
            ) : supportedProviders.length > 1 ? (
              <>
                <div className="flex justify-center mb-2" data-pp-tut="tabs">
                  <div className="pp-tab-bar">
                    {supportedProviders.map((provider) => {
                      const Icon = getTabIcon(provider.name);
                      const isActive = activeTab === provider.name;
                      return (
                        <button
                          key={provider.id}
                          onClick={() => handleTabChange(provider.name)}
                          className={`pp-tab ${isActive ? 'pp-tab-active' : 'pp-tab-inactive'}`}
                        >
                          <Icon className="h-4 w-4 hidden md:block" />
                          <span className="text-xs md:text-sm font-medium">{provider.display_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}

            {/* Onramp card */}
            <div className="pp-card" data-pp-tut="widget">
              {/* Debit success tip */}
              <div
                className="pp-provider-label pp-text-primary font-semibold"
                data-pp-tut="debit-tip"
              >
                Debit is more likely to succeed when purchasing
              </div>

              {/* Provider label */}
              <div className="pp-provider-label">
                Powered by{' '}
                {activeTab === 'stripe' ? 'Stripe' : activeTab === 'coinbase' ? 'Coinbase' : activeTab === 'coinbase_global' ? 'Coinbase' : '—'}
              </div>

              {/* Widget content */}
              <div className="pp-widget-content">
                {activeTab === 'coinbase' && (
                  <CoinbaseHeadlessOnramp defaultAsset="USDC" defaultNetwork="solana" presetAmounts={['5', '10', '20', '50']} defaultAmount="0" hideHeader />
                )}
                {activeTab === 'coinbase_global' && (
                  <CoinbaseOnrampWidget defaultAsset="USDC" defaultNetwork="solana" subtitle="Requires Coinbase account. May require KYC." defaultAmount="0" hideHeader checkoutDescription="A new page will open to complete purchase." />
                )}
                {activeTab === 'stripe' && (
                  <StripeOnramp defaultAsset="USDC" defaultNetwork="solana" theme="dark" hideHeader />
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

      {/* Help / FAQ slide-in panel */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-300 ${showHelp ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setShowHelp(false)}
      >
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md z-[101] bg-[#111111] border-l border-white/8 transform transition-transform duration-300 ease-out ${showHelp ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-lg font-semibold text-white">Help <span className="text-primary">&</span> FAQ</h2>
          <button
            onClick={() => setShowHelp(false)}
            className="p-1.5 rounded-full text-[#BABABA] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-57px)] px-5 py-4">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border-b border-white/8"
              >
                <AccordionTrigger className="text-left text-sm font-normal text-muted-foreground hover:no-underline py-3 [&[data-state=open]]:text-primary [&[data-state=open]>svg]:text-primary [&>svg]:text-[#BABABA] [&>svg]:transition-colors">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-[#BABABA] leading-relaxed pb-3">
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(faq.answer) }} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
      <AccountModal open={accountModalOpen} onOpenChange={setAccountModalOpen} variant="dark" />
      <PartnerPortalTutorial selectedProvider={activeTab} />
    </>
  );
};

export default PartnerPortal;
