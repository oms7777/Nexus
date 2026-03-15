import { type IntegrationId, WIDGET_SCRIPT } from "./constants";

export const createScript = (integrationId: IntegrationId, organizationId: string) => {
  return WIDGET_SCRIPT.replace(/{{ORGANIZATION_ID}}/g, organizationId);
};