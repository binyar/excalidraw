/**
 * Product builds intentionally do not collect editor usage analytics.
 *
 * The stable function boundary is retained because editor actions use it as an
 * optional notification hook. Keeping the hook local avoids coupling core
 * editor actions to any analytics provider.
 */
export const trackEvent = (
  _category: string,
  _action: string,
  _label?: string,
  _value?: number,
) => {};
