import { ArrowLeft } from "lucide-react";
import { useAboutContent } from "@/hooks/useSiteContent";
import { Loader2 } from "lucide-react";

interface AboutProps {
  onNavigate: (section: string) => void;
}

const About = ({ onNavigate }: AboutProps) => {
  const { data, isLoading } = useAboutContent();

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 md:py-12 space-y-8">
      {/* Back Button - Subtle, secondary styling */}
      <button
        onClick={() => onNavigate("home")}
        className="flex items-center gap-1.5 text-muted-foreground/70 hover:text-primary transition-colors group"
      >
        <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
        <span className="text-xs">Back to Onramp</span>
      </button>
      
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Page Header - Matches homepage hero weight */}
          <h1 className="text-lg md:text-2xl font-bold tracking-tight text-foreground">
            About EZOnRamp
          </h1>
          
          {/* Content Container - Card-like with spacing separation */}
          <div className="space-y-6">
            {data?.description && (
              <div className="text-sm md:text-base text-muted-foreground leading-relaxed space-y-4 [&_u]:text-primary [&_u]:no-underline [&_u]:underline [&_u]:decoration-primary/60 [&_u]:underline-offset-2">
                {data.description.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="[&_strong]:text-foreground [&_strong]:font-medium whitespace-pre-wrap">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
