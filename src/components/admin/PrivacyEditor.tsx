import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSiteContent, useUpdateSiteContent } from '@/hooks/useSiteContent';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

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
`;

export default function PrivacyEditor() {
  const { toast } = useToast();
  const { data: privacyContent, isLoading } = useSiteContent<PrivacyContent>('privacy');
  const updateContent = useUpdateSiteContent();
  
  const [content, setContent] = useState(defaultContent);

  useEffect(() => {
    if (privacyContent?.content) {
      setContent(privacyContent.content);
    }
  }, [privacyContent]);

  const handleSave = async () => {
    try {
      await updateContent.mutateAsync({
        section: 'privacy',
        content: { content }
      });
      toast({
        title: 'Success',
        description: 'Privacy Policy updated successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update Privacy Policy',
        variant: 'destructive'
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy Policy</CardTitle>
        <CardDescription>
          Edit the Privacy Policy page content. Use the rich text editor to format your content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="Enter Privacy Policy content..."
          className="min-h-[500px]"
        />
        <Button 
          onClick={handleSave} 
          disabled={updateContent.isPending}
          className="w-full"
        >
          {updateContent.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardContent>
    </Card>
  );
}
