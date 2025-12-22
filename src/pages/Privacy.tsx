import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/hooks/useSiteContent";
import DOMPurify from "dompurify";

interface PrivacyContent {
  content: string;
}

const defaultContent = `
<h1>Privacy Policy</h1>
<p><strong>Effective Date:</strong> December 22, 2025</p>
<p>This Privacy Policy explains how ezonramp.com ("we," "us," or "our") collects, uses, discloses, and protects personal information when you use our website (the "Site").</p>

<h2>1. Scope</h2>
<p>This Policy applies only to information collected by ezonramp.com. Third-party service providers operate under their own privacy policies, and we are not responsible for their practices.</p>

<h2>2. Information We Collect</h2>
<p>We may collect:</p>
<ul>
<li>Contact information you voluntarily provide (e.g., email address)</li>
<li>Technical data (IP address, browser type, device information)</li>
<li>Usage data (pages viewed, referral sources)</li>
</ul>
<p>We do not collect or store:</p>
<ul>
<li>Payment credentials</li>
<li>Government ID</li>
<li>Wallet private keys</li>
</ul>

<h2>3. How We Use Information</h2>
<p>We use personal information to:</p>
<ul>
<li>Operate and maintain the Site</li>
<li>Respond to inquiries</li>
<li>Improve functionality and security</li>
<li>Comply with legal obligations</li>
</ul>

<h2>4. Legal Bases for Processing (GDPR)</h2>
<p>For users in the European Economic Area (EEA), we process personal data based on:</p>
<ul>
<li>Your consent</li>
<li>Legitimate interests (site operation and improvement)</li>
<li>Legal compliance</li>
</ul>

<h2>5. Data Sharing</h2>
<p>We may share information with:</p>
<ul>
<li>Infrastructure and analytics providers</li>
<li>Legal or regulatory authorities when required by law</li>
</ul>
<p>We do not sell personal information.</p>

<h2>6. International Data Transfers</h2>
<p>Information may be processed outside your jurisdiction, including Canada and the United States. Appropriate safeguards are applied where required by law.</p>

<h2>7. Your Privacy Rights</h2>
<h3>GDPR (EEA)</h3>
<p>You have the right to access, correct, delete, restrict, or object to processing, and to data portability.</p>
<h3>PIPEDA (Canada)</h3>
<p>You may request access to or correction of your personal information and withdraw consent where applicable.</p>
<h3>CCPA / CPRA (California)</h3>
<p>You have the right to know, delete, and opt-out of the sale of personal information (we do not sell data).</p>
<p>Requests may be submitted to <a href="mailto:hello@ezonramp.com">hello@ezonramp.com</a>.</p>

<h2>8. Cookies & Analytics</h2>
<p>We use cookies and similar technologies for functionality and analytics. You may control cookies through browser settings.</p>

<h2>9. Data Security</h2>
<p>We implement reasonable administrative and technical safeguards; however, no system is completely secure.</p>

<h2>10. Data Retention</h2>
<p>We retain personal information only as long as necessary for the purposes described or as required by law.</p>

<h2>11. Children's Privacy</h2>
<p>The Site is not intended for individuals under 13 years of age, and we do not knowingly collect data from children.</p>

<h2>12. Policy Updates</h2>
<p>We may update this Privacy Policy periodically. Changes take effect upon posting.</p>

<h2>13. Contact</h2>
<p>Email: <a href="mailto:hello@ezonramp.com">hello@ezonramp.com</a></p>
<p><em>Legal Notice: This Privacy Policy is provided for general informational purposes and does not constitute legal advice.</em></p>
`;

export default function Privacy() {
  const { data: privacyContent, isLoading } = useSiteContent<PrivacyContent>('privacy');
  
  const content = privacyContent?.content || defaultContent;
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
              [&>h3]:text-lg [&>h3]:font-medium [&>h3]:mt-6 [&>h3]:mb-3 [&>h3]:text-foreground
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
