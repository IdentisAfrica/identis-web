import * as Sentry from "@sentry/react";

export function initSentry() {
  // Only initialize in production
  if (import.meta.env.MODE === 'production') {
    Sentry.init({
      dsn: "https://d0591c405c6d2bcf77678d486dccfb3b@o4510835630145536.ingest.de.sentry.io/4510835635257424",
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      environment: import.meta.env.MODE,
      beforeSend(event) {
        // Don't send errors in development
        if (import.meta.env.MODE === 'development') {
          return null;
        }
        return event;
      },
    });
  }
}
