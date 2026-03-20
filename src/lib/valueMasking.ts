export const HIDDEN_VALUE = "***";

const NUMERIC_TOKEN_PATTERN = /[-+]?\$?\d[\d,]*(?:\.\d+)?/g;

export function maskDisplayValue(value: string, hideValues: boolean): string {
  return hideValues ? HIDDEN_VALUE : value;
}

export function maskInlineNumbers(text: string, hideValues: boolean): string {
  return hideValues ? text.replace(NUMERIC_TOKEN_PATTERN, HIDDEN_VALUE) : text;
}