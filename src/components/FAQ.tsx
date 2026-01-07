import { Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useFAQContent } from "@/hooks/useSiteContent";

interface FAQProps {
  onNavigate: (section: string) => void;
}

const FAQ = ({ onNavigate }: FAQProps) => {
  const { data, isLoading } = useFAQContent();

  // Default FAQs if no database content
  const defaultFaqs = [
    {
      question: "What is a crypto onramp?",
      answer:
        "A crypto onramp is a service that allows you to convert traditional currency (like USD) into cryptocurrency. It's the bridge that connects your bank account or credit card to the world of digital assets.",
    },
    {
      question: "How long does a transaction take?",
      answer:
        "Transaction times vary depending on the payment method and network conditions. Credit card purchases are typically instant, while bank transfers may take 1-3 business days to process.",
    },
    {
      question: "Is my personal information secure?",
      answer:
        "Yes, we take security seriously. All personal information is encrypted and stored securely. We comply with industry-standard security practices and regulations to protect your data.",
    },
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept major credit and debit cards, as well as bank transfers. Available payment methods may vary depending on your location and the specific onramp provider you choose.",
    },
    {
      question: "Are there any fees?",
      answer:
        "Fees vary by payment method and provider. Each onramp service displays its fees transparently before you complete a transaction. There are no hidden charges.",
    },
  ];

  const faqs = data?.items?.length ? data.items : defaultFaqs;

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-4 md:py-6 space-y-8">

      {/* Page Header - Matches Homepage/About styling */}
      <div className="space-y-2">
        <h1 className="text-lg md:text-2xl font-bold tracking-tight text-foreground">
          Frequently Asked Questions
        </h1>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* FAQ Container - Clean accordion without extra spacing */
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem 
              key={index} 
              value={`item-${index}`}
              className="border-b border-border"
            >
              <AccordionTrigger className="text-left text-sm md:text-base font-medium text-foreground hover:no-underline py-3 [&[data-state=open]>svg]:text-primary [&>svg]:text-muted-foreground [&>svg]:transition-colors">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-3 prose prose-sm max-w-none [&_a]:text-primary [&_a]:underline [&_u]:text-primary [&_u]:underline [&_u]:decoration-primary/60 [&_u]:underline-offset-2">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(faq.answer) }} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};

export default FAQ;
