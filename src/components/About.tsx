import { ArrowLeft } from "lucide-react";
import { useAboutContent } from "@/hooks/useSiteContent";
import { Loader2 } from "lucide-react";

interface AboutProps {
  onNavigate: (section: string) => void;
}

const About = ({ onNavigate }: AboutProps) => {
  const { data, isLoading } = useAboutContent();

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <button
        onClick={() => onNavigate("home")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back to Onramp</span>
      </button>
      
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <h1 className="text-4xl font-semibold mb-8">{data?.title || "About Us"}</h1>
          {data?.description && (
            <div className="space-y-4 text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {data.description}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default About;
