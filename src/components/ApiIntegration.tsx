import { useState } from "react";

interface ApiConfig {
  id: string;
  name: string;
  embedUrl: string;
}

interface ApiIntegrationProps {
  apis: ApiConfig[];
}

const ApiIntegration = ({ apis }: ApiIntegrationProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (apis.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[500px] px-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">No Onramp Configured</h2>
          <p className="text-muted-foreground max-w-md">
            Configure your API integrations to display onramp services here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Navigation dots - only show if multiple APIs */}
      {apis.length > 1 && (
        <div className="flex justify-center gap-2 py-6">
          {apis.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex
                  ? "w-8 bg-foreground"
                  : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
              aria-label={`View ${apis[index].name}`}
            />
          ))}
        </div>
      )}

      {/* API Integration Container */}
      <div className="w-full px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
            <iframe
              src={apis[currentIndex].embedUrl}
              title={apis[currentIndex].name}
              className="w-full h-[600px]"
              allow="payment"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiIntegration;
