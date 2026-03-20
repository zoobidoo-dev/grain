import * as Sentry from "@sentry/nextjs";
import {
  getDeploymentTags,
  getMonitoringDsn,
  getMonitoringEnvironment,
  getMonitoringRelease,
} from "@/lib/monitoring";

const dsn = getMonitoringDsn();
const deploymentTags = getDeploymentTags();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: getMonitoringEnvironment(),
  release: getMonitoringRelease(),
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
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
