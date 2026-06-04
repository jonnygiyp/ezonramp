/// <reference types="vite/client" />

// MoonPay Web SDK (loaded via <script> tag in index.html)
// https://dev.moonpay.com/widget/on-ramp-web-sdk
declare global {
  interface MoonPayWebSdkInstance {
    show: () => void;
    close: () => void;
    generateUrlForSigning: () => string;
    updateSignature: (signature: string) => void;
  }

  interface MoonPayWebSdkConfig {
    flow: "buy" | "sell" | "swap" | "swapsCustomerSetup";
    environment: "sandbox" | "production";
    variant: "embedded" | "overlay" | "newTab" | "newWindow";
    containerNodeSelector?: string;
    useWarnBeforeRefresh?: boolean;
    params: Record<string, unknown> & { apiKey: string };
    handlers?: {
      onUrlSignatureRequested?: (url: string) => Promise<string> | string;
      onTransactionCompleted?: (props: unknown) => void | Promise<void>;
      onTransactionCreated?: (props: unknown) => void | Promise<void>;
      onCloseOverlay?: () => void;
    };
  }

  interface Window {
    MoonPayWebSdk?: {
      init: (config: MoonPayWebSdkConfig) => MoonPayWebSdkInstance;
    };
  }
}

export {};
