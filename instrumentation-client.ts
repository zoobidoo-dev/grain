import * as Sentry from "@sentry/nextjs";
import {
  getClientMonitoringTags,
  getMonitoringDsn,
  getMonitoringEnvironment,
  getMonitoringRelease,
} from "@/lib/monitoring";

const dsn = getMonitoringDsn();
const deploymentTags = getClientMonitoringTags();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: getMonitoringEnvironment(),
  release: getMonitoringRelease(),
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysSessionSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.05,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  initialScope: {
    tags: deploymentTags,
  },
  beforeSend(event) {
    event.tags = {
      ...deploymentTags,
      ...event.tags,
    };
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
