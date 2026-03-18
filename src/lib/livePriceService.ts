export interface LiveQuote {
  symbol: string;
  price: number;
  currency: string | null;
}

interface FinnhubQuoteResponse {
  c?: number;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function getFinnhubApiKey(): string {
  const apiKey =
    import.meta.env.VITE_FINNHUB_API_KEY ?? import.meta.env.VITE_FINHUB_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing Finnhub API key. Set VITE_FINNHUB_API_KEY in your environment.",
    );
  }

  return apiKey;
}

async function fetchLiveQuote(
  symbol: string,
  apiKey: string,
): Promise<LiveQuote | null> {
  const endpoint = new URL("https://finnhub.io/api/v1/quote");
  endpoint.searchParams.set("symbol", symbol);
  endpoint.searchParams.set("token", apiKey);

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Unable to fetch live prices right now.");
  }

  const payload = (await response.json()) as FinnhubQuoteResponse;
  const price = payload.c;

  if (typeof price !== "number" || Number.isNaN(price) || price <= 0) {
    return null;
  }

  return {
    symbol,
    price,
    currency: null,
  };
}

export async function fetchLiveQuotes(
  symbols: string[],
): Promise<Map<string, LiveQuote>> {
  const normalizedSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol).filter((symbol) => symbol.length > 0)),
  );

  if (normalizedSymbols.length === 0) {
    return new Map();
  }

  const apiKey = getFinnhubApiKey();
  const results = await Promise.all(
    normalizedSymbols.map((symbol) => fetchLiveQuote(symbol, apiKey)),
  );
  const quotes = new Map<string, LiveQuote>();

  results.forEach((quote) => {
    if (!quote) {
      return;
    }

    quotes.set(quote.symbol, quote);
  });

  return quotes;
}
