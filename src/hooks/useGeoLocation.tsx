import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GeoLocation {
  country_code: string | null;
  country_name: string | null;
  is_us: boolean;
  source: string;
}

/**
 * Resolve the visitor's country via the `geo-detect` edge function.
 *
 * - Cached for the browser session via React Query (24h staleTime).
 * - Fails open: on any error returns a neutral location so callers can
 *   fall back to the safe default ramp without blocking the UI.
 * - Used ONLY to choose the initial default ramp — never as a hard gate.
 */
export function useGeoLocation() {
  return useQuery<GeoLocation>({
    queryKey: ["geo-location"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke("geo-detect", {
          method: "POST",
        });
        if (error) throw error;
        if (!data) throw new Error("Empty geo response");
        return data as GeoLocation;
      } catch (err) {
        console.warn("[useGeoLocation] geo-detect failed, falling back to neutral:", err);
        return {
          country_code: null,
          country_name: null,
          is_us: false,
          source: "client-fallback",
        };
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24h — country rarely changes mid-session
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}
