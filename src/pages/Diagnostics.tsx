import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Trash2, ChevronDown, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Link } from 'react-router-dom';
import Footer from '@/components/Footer';

interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'checking';
  message: string;
  details?: string;
}

interface ErrorLogEntry {
  timestamp: string;
  type?: string;
  message: string;
  stack?: string;
  componentStack?: string;
  filename?: string;
  lineno?: number;
}

const Diagnostics = () => {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [crashLogs, setCrashLogs] = useState<ErrorLogEntry[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);

  const loadLogs = () => {
    try {
      const crashes = JSON.parse(sessionStorage.getItem('crash_logs') || '[]');
      const errors = JSON.parse(sessionStorage.getItem('global_error_logs') || '[]');
      setCrashLogs(crashes);
      setErrorLogs(errors);
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  };

  const clearLogs = () => {
    sessionStorage.removeItem('crash_logs');
    sessionStorage.removeItem('global_error_logs');
    setCrashLogs([]);
    setErrorLogs([]);
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    const results: DiagnosticCheck[] = [];

    // Check 1: Buffer polyfill
    results.push({
      name: 'Buffer Polyfill',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const bufferIdx = results.length - 1;
    if (typeof window !== 'undefined' && (window as any).Buffer) {
      results[bufferIdx] = {
        name: 'Buffer Polyfill',
        status: 'pass',
        message: 'Buffer is available globally',
      };
    } else {
      results[bufferIdx] = {
        name: 'Buffer Polyfill',
        status: 'fail',
        message: 'Buffer polyfill missing',
        details: 'Required for Particle Network and Solana integrations',
      };
    }
    setChecks([...results]);

    // Check 2: Process polyfill
    results.push({
      name: 'Process Polyfill',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const processIdx = results.length - 1;
    if (typeof process !== 'undefined') {
      results[processIdx] = {
        name: 'Process Polyfill',
        status: 'pass',
        message: 'Process object is available',
      };
    } else {
      results[processIdx] = {
        name: 'Process Polyfill',
        status: 'warn',
        message: 'Process polyfill may be missing',
        details: 'Some libraries may require process.env',
      };
    }
    setChecks([...results]);

    // Check 3: Particle Network SDK
    results.push({
      name: 'Particle Network SDK',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 300));
    const particleIdx = results.length - 1;
    try {
      const connectkit = await import('@particle-network/connectkit');
      if (connectkit.useAccount && connectkit.useModal) {
        results[particleIdx] = {
          name: 'Particle Network SDK',
          status: 'pass',
          message: 'ConnectKit hooks available',
        };
      } else {
        results[particleIdx] = {
          name: 'Particle Network SDK',
          status: 'warn',
          message: 'SDK loaded but hooks may be incomplete',
        };
      }
    } catch (e) {
      results[particleIdx] = {
        name: 'Particle Network SDK',
        status: 'fail',
        message: 'Failed to load SDK',
        details: e instanceof Error ? e.message : String(e),
      };
    }
    setChecks([...results]);

    // Check 4: Coinbase SDK
    results.push({
      name: 'Coinbase Pay SDK',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const coinbaseIdx = results.length - 1;
    try {
      const cbpay = await import('@coinbase/cbpay-js');
      if (cbpay.initOnRamp) {
        results[coinbaseIdx] = {
          name: 'Coinbase Pay SDK',
          status: 'pass',
          message: 'initOnRamp function available',
        };
      } else {
        results[coinbaseIdx] = {
          name: 'Coinbase Pay SDK',
          status: 'warn',
          message: 'SDK loaded but initOnRamp missing',
        };
      }
    } catch (e) {
      results[coinbaseIdx] = {
        name: 'Coinbase Pay SDK',
        status: 'fail',
        message: 'Failed to load SDK',
        details: e instanceof Error ? e.message : String(e),
      };
    }
    setChecks([...results]);

    // Check 5: Stripe Crypto SDK
    results.push({
      name: 'Stripe Crypto SDK',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const stripeIdx = results.length - 1;
    try {
      const stripe = await import('@stripe/crypto');
      if (stripe.loadStripeOnramp) {
        results[stripeIdx] = {
          name: 'Stripe Crypto SDK',
          status: 'pass',
          message: 'loadStripeOnramp function available',
        };
      } else {
        results[stripeIdx] = {
          name: 'Stripe Crypto SDK',
          status: 'warn',
          message: 'SDK loaded but loadStripeOnramp missing',
        };
      }
    } catch (e) {
      results[stripeIdx] = {
        name: 'Stripe Crypto SDK',
        status: 'fail',
        message: 'Failed to load SDK',
        details: e instanceof Error ? e.message : String(e),
      };
    }
    setChecks([...results]);

    // Check 6: MoonPay SDK
    results.push({
      name: 'MoonPay SDK',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const moonpayIdx = results.length - 1;
    try {
      const moonpay = await import('@moonpay/moonpay-react');
      if (moonpay.MoonPayProvider) {
        results[moonpayIdx] = {
          name: 'MoonPay SDK',
          status: 'pass',
          message: 'MoonPayProvider available',
        };
      } else {
        results[moonpayIdx] = {
          name: 'MoonPay SDK',
          status: 'warn',
          message: 'SDK loaded but MoonPayProvider missing',
        };
      }
    } catch (e) {
      results[moonpayIdx] = {
        name: 'MoonPay SDK',
        status: 'fail',
        message: 'Failed to load SDK',
        details: e instanceof Error ? e.message : String(e),
      };
    }
    setChecks([...results]);

    // Check 7: WebAssembly support
    results.push({
      name: 'WebAssembly Support',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const wasmIdx = results.length - 1;
    if (typeof WebAssembly !== 'undefined') {
      results[wasmIdx] = {
        name: 'WebAssembly Support',
        status: 'pass',
        message: 'WebAssembly is supported',
      };
    } else {
      results[wasmIdx] = {
        name: 'WebAssembly Support',
        status: 'fail',
        message: 'WebAssembly not supported',
        details: 'Required for Particle Network threshold signatures',
      };
    }
    setChecks([...results]);

    // Check 8: Crypto API
    results.push({
      name: 'Web Crypto API',
      status: 'checking',
      message: 'Checking...',
    });
    setChecks([...results]);
    
    await new Promise(r => setTimeout(r, 200));
    const cryptoIdx = results.length - 1;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      results[cryptoIdx] = {
        name: 'Web Crypto API',
        status: 'pass',
        message: 'crypto.subtle is available',
      };
    } else {
      results[cryptoIdx] = {
        name: 'Web Crypto API',
        status: 'fail',
        message: 'Web Crypto API not available',
        details: 'Required for secure cryptographic operations',
      };
    }
    setChecks([...results]);

    setIsRunning(false);
  };

  useEffect(() => {
    loadLogs();
    runDiagnostics();
  }, []);

  const getStatusIcon = (status: DiagnosticCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'fail':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warn':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'checking':
        return <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: DiagnosticCheck['status']) => {
    switch (status) {
      case 'pass':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Pass</Badge>;
      case 'fail':
        return <Badge variant="destructive">Fail</Badge>;
      case 'warn':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Warning</Badge>;
      case 'checking':
        return <Badge variant="secondary">Checking...</Badge>;
    }
  };

  const allLogs = [...crashLogs, ...errorLogs].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Provider Diagnostics</h1>
          <p className="text-muted-foreground">
            Check the status of all onramp providers and system requirements
          </p>
        </div>

        <div className="space-y-6">
          {/* Diagnostic Checks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>System Checks</CardTitle>
                <CardDescription>Verify all required dependencies are working</CardDescription>
              </div>
              <Button 
                onClick={runDiagnostics} 
                disabled={isRunning}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
                Re-run
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {checks.map((check, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    {getStatusIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{check.name}</span>
                        {getStatusBadge(check.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{check.message}</p>
                      {check.details && (
                        <p className="text-xs text-muted-foreground/80 mt-1 font-mono">
                          {check.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Error Logs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Error Logs</CardTitle>
                <CardDescription>
                  {allLogs.length} error{allLogs.length !== 1 ? 's' : ''} recorded this session
                </CardDescription>
              </div>
              <Button 
                onClick={clearLogs} 
                variant="outline"
                size="sm"
                disabled={allLogs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </CardHeader>
            <CardContent>
              {allLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No errors recorded. This is good! 🎉
                </p>
              ) : (
                <div className="space-y-2">
                  {allLogs.map((log, idx) => (
                    <Collapsible key={idx}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 hover:bg-destructive/10 transition-colors text-left">
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{log.message}</span>
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.timestamp).toLocaleString()}
                              {log.type && ` • ${log.type}`}
                            </p>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-48">
                          {log.stack || log.componentStack || 'No stack trace available'}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle>Environment Info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">User Agent</dt>
                <dd className="font-mono text-xs truncate">{navigator.userAgent}</dd>
                <dt className="text-muted-foreground">Platform</dt>
                <dd className="font-mono text-xs">{navigator.platform}</dd>
                <dt className="text-muted-foreground">Language</dt>
                <dd className="font-mono text-xs">{navigator.language}</dd>
                <dt className="text-muted-foreground">Online</dt>
                <dd className="font-mono text-xs">{navigator.onLine ? 'Yes' : 'No'}</dd>
              </dl>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Diagnostics;
