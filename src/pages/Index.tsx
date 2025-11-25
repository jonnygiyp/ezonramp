import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Palette, Zap, Shield, Heart } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32 lg:py-40">
        <div className="container mx-auto max-w-6xl">
          <div className="animate-fade-up text-center">
            <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-6xl lg:text-7xl">
              Build Something
              <br />
              <span className="text-primary">Beautiful Today</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
              A modern platform for creators who value design, simplicity, and
              powerful functionality. Start your journey with elegance.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="group gap-2 text-base">
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button size="lg" variant="outline" className="text-base">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-secondary/50 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="animate-fade-up mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
              Why Choose Us
            </h2>
            <p className="animate-fade-up animation-delay-100 mx-auto max-w-2xl text-lg text-muted-foreground">
              Everything you need to create exceptional experiences
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card className="animate-fade-up animation-delay-100 border-0 shadow-lg transition-all hover:scale-105">
              <CardContent className="p-8 text-center">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Palette className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold">Beautiful Design</h3>
                <p className="text-muted-foreground">
                  Crafted with attention to every detail, ensuring your content
                  shines.
                </p>
              </CardContent>
            </Card>

            <Card className="animate-fade-up animation-delay-200 border-0 shadow-lg transition-all hover:scale-105">
              <CardContent className="p-8 text-center">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold">Lightning Fast</h3>
                <p className="text-muted-foreground">
                  Optimized performance that delivers exceptional speed and
                  efficiency.
                </p>
              </CardContent>
            </Card>

            <Card className="animate-fade-up animation-delay-300 border-0 shadow-lg transition-all hover:scale-105">
              <CardContent className="p-8 text-center">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold">Secure & Reliable</h3>
                <p className="text-muted-foreground">
                  Built with security in mind, protecting what matters most to
                  you.
                </p>
              </CardContent>
            </Card>

            <Card className="animate-fade-up animation-delay-400 border-0 shadow-lg transition-all hover:scale-105">
              <CardContent className="p-8 text-center">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Heart className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold">Made with Love</h3>
                <p className="text-muted-foreground">
                  Every element is carefully considered to create the best
                  experience.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-6 text-3xl font-bold md:text-4xl lg:text-5xl">
                Create Without Limits
              </h2>
              <p className="mb-6 text-lg leading-relaxed text-muted-foreground">
                Experience the freedom to build exactly what you envision. Our
                platform provides the tools and flexibility you need to bring
                your ideas to life, without compromise.
              </p>
              <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
                Whether you're building a personal project or a professional
                platform, we've got everything you need to succeed.
              </p>
              <Button className="group gap-2">
                Start Building
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary/20 via-accent/20 to-secondary"></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary px-6 py-20 text-primary-foreground md:py-28">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl lg:text-5xl">
            Ready to Get Started?
          </h2>
          <p className="mb-10 text-lg opacity-90 md:text-xl">
            Join thousands of creators who are already building amazing things.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              className="group gap-2 text-base"
            >
              Start Your Project
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground text-base text-primary-foreground hover:bg-primary-foreground hover:text-primary"
            >
              View Examples
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-12">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <h3 className="mb-4 text-2xl font-bold">Your Brand</h3>
              <p className="mb-4 text-muted-foreground">
                Building beautiful experiences for the modern web.
              </p>
            </div>
            <div>
              <h4 className="mb-4 font-semibold">Product</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Documentation
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-semibold">Company</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 Your Brand. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
