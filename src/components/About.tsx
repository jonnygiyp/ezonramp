import { Loader2 } from "lucide-react";
import { useAboutContent } from "@/hooks/useSiteContent";
import DOMPurify from "dompurify";

interface AboutProps {
  onNavigate: (section: string) => void;
}

const About = ({ onNavigate }: AboutProps) => {
  const { data, isLoading } = useAboutContent();

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-4 md:py-6 space-y-8">
      
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
              <div 
                className="text-sm md:text-base text-muted-foreground leading-relaxed prose prose-sm max-w-none [&_a]:text-primary [&_a]:underline [&_u]:text-primary [&_u]:underline [&_u]:decoration-primary/60 [&_u]:underline-offset-2 [&_strong]:text-foreground [&_strong]:font-medium [&_p]:mb-4"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.description) }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
