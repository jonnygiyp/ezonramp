import { useState, useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ContactProps {
  onNavigate: (section: string) => void;
}

const Contact = ({ onNavigate }: ContactProps) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  useEffect(() => {
    if (isSubmitted) {
      const timer = setTimeout(() => {
        onNavigate("home");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isSubmitted, onNavigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.message) {
      return;
    }

    if (formData.message.length > 500) {
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return;
    }

    // TODO: Implement actual email sending via API
    console.log("Form submitted:", formData);
    
    setIsSubmitted(true);
    setFormData({ name: "", email: "", phone: "", message: "" });
  };

  if (isSubmitted) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-4 md:py-6">
        <div className="flex flex-col items-center justify-center min-h-[300px] animate-fade-in">
          <CheckCircle className="h-16 w-16 text-primary mb-4 animate-scale-in" />
          <h2 className="text-lg md:text-2xl font-bold tracking-tight text-foreground mb-2">Message sent!</h2>
          <p className="text-sm text-muted-foreground">We'll be in touch soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-4 md:py-6 space-y-8">

      {/* Page Header - Matches homepage hero / About page header */}
      <h1 className="text-lg md:text-2xl font-bold tracking-tight text-foreground">Contact Us</h1>
      {/* Form Container */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium text-foreground">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Your name"
            required
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-foreground">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="your@email.com"
            required
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-sm font-medium text-foreground">
            Phone Number
          </Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="(123) 456-7890"
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="message" className="text-sm font-medium text-foreground">
            Message <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="message"
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Your message..."
            maxLength={500}
            rows={5}
            required
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground text-right">
            {formData.message.length}/500 characters
          </p>
        </div>

        <Button type="submit" className="w-full">
          Send Message
        </Button>
      </form>
    </div>
  );
};

export default Contact;
