import { ArrowLeft } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQProps {
  onNavigate: (section: string) => void;
}

const FAQ = ({ onNavigate }: FAQProps) => {
  const faqs = [
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

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <button
        onClick={() => onNavigate("home")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back to Onramp</span>
      </button>
      <h1 className="text-4xl font-semibold mb-8">Frequently Asked Questions</h1>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left text-base">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FAQ;
