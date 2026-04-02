const DARK_PORTAL_ROUTE_PATTERN = /^\/(express|dark)(?:\/|$)/i;

export const isDarkPortalPath = (pathname?: string | null) =>
  Boolean(pathname && DARK_PORTAL_ROUTE_PATTERN.test(pathname));

export const isCurrentDarkPortalRoute = () =>
  typeof window !== "undefined" && isDarkPortalPath(window.location.pathname);