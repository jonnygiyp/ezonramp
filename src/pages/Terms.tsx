import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/hooks/useSiteContent";
import DOMPurify from "dompurify";

interface TermsContent {
  content: string;
}

const defaultContent = `
<h1>Terms of Service</h1>
<p><strong>Effective Date:</strong> December 22, 2025</p>
<p>Welcome to ezonramp.com ("ezonramp," "we," "us," or "our"). By accessing or using this website (the "Site"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not access or use the Site.</p>

<h2>1. Platform Role & No Financial Services</h2>
<p>ezonramp.com is a technology and informational platform only. We do not provide financial services, payment services, money transmission, custody, exchange, brokerage, or investment services.</p>
<p>All cryptocurrency on-ramp, payment, wallet, exchange, or related services are provided exclusively by independent third-party providers.</p>

<h2>2. Third-Party Providers</h2>
<p>By using the Site, you acknowledge and agree that:</p>
<ul>
<li>All transactions and services are conducted directly between you and third-party providers.</li>
<li>Your use of any third-party service is governed solely by that provider's terms, policies, and disclosures.</li>
<li>ezonramp.com is not a party to any transaction or agreement between you and a third party.</li>
</ul>
<p>We make no representations regarding third-party availability, pricing, compliance, security, or suitability.</p>

<h2>3. Eligibility & Compliance</h2>
<p>You represent and warrant that:</p>
<ul>
<li>You are legally permitted to use cryptocurrency-related services in your jurisdiction.</li>
<li>You will comply with all applicable laws, including financial, tax, anti-money-laundering (AML), counter-terrorist-financing (CTF), and sanctions laws.</li>
</ul>
<p>We do not perform KYC, AML, or transaction monitoring; such obligations are handled by third-party providers.</p>

<h2>4. No Payments, Shipping, Refunds, or Exchanges</h2>
<p>ezonramp.com does not process payments. There is no shipping of physical or digital goods. No refunds or exchanges are offered by ezonramp.com under any circumstances. Fees, refunds, reversals, or disputes are governed solely by third-party providers.</p>

<h2>5. No Investment Advice</h2>
<p>Content on the Site is provided for general informational purposes only and does not constitute financial, legal, tax, or investment advice. You are solely responsible for your decisions and risk assessment.</p>

<h2>6. Disclaimers</h2>
<p>The Site is provided on an "as-is" and "as-available" basis. We disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.</p>

<h2>7. Limitation of Liability</h2>
<p>To the fullest extent permitted by law, ezonramp.com shall not be liable for any indirect, incidental, consequential, special, or punitive damages arising from:</p>
<ul>
<li>Use of or reliance on the Site</li>
<li>Third-party services or transactions</li>
<li>Errors, interruptions, security incidents, or losses</li>
</ul>

<h2>8. Intellectual Property</h2>
<p>All Site content, branding, and materials are owned by or licensed to ezonramp.com and may not be used without prior written consent.</p>

<h2>9. Modifications</h2>
<p>We may modify these Terms at any time. Continued use of the Site constitutes acceptance of the revised Terms.</p>

<h2>10. Governing Law & Venue</h2>
<p>These Terms are governed by the laws of Quebec and the federal laws of Canada applicable therein. Any dispute shall be resolved exclusively in the courts located in Montreal, Quebec, Canada.</p>

<h2>11. Contact</h2>
<p>Email: <a href="mailto:hello@ezonramp.com">hello@ezonramp.com</a></p>
<p><em>Legal Notice: This document is for general informational purposes and does not constitute legal advice.</em></p>
`;

export default function Terms() {
  const { data: termsContent, isLoading } = useSiteContent<TermsContent>('terms');
  
  const content = termsContent?.content || defaultContent;
  const sanitizedContent = DOMPurify.sanitize(content);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div 
            className="prose prose-invert max-w-none
              [&>h1]:text-3xl [&>h1]:font-bold [&>h1]:mb-6 [&>h1]:text-foreground
              [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-4 [&>h2]:text-foreground
              [&>p]:text-muted-foreground [&>p]:mb-4 [&>p]:leading-relaxed
              [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul]:text-muted-foreground
              [&>ul>li]:mb-2
              [&_a]:text-primary [&_a]:hover:underline"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        )}
      </main>
    </div>
  );
}
