import { supabase } from "./supabase";

export interface InvestmentAsset {
  id: string;
  symbol: string;
  name: string;
  targetPercentage: number;
  currentPrice: number;
  shareIncrement: number;
  quoteUpdatedAt: string | null;
  sortOrder: number;
}

interface InvestmentAssetRow {
  user_id: string;
  id: string;
  symbol: string;
  name: string;
  target_percentage: number;
  current_price: number;
  share_increment: number;
  quote_updated_at: string | null;
  sort_order: number;
  updated_at: string;
}

function mapRowToAsset(row: InvestmentAssetRow): InvestmentAsset {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    targetPercentage: Number(row.target_percentage),
    currentPrice: Number(row.current_price),
    shareIncrement: Number(row.share_increment),
    quoteUpdatedAt: row.quote_updated_at,
    sortOrder: row.sort_order,
  };
}

function mapAssetToRow(
  userId: string,
  asset: InvestmentAsset,
): InvestmentAssetRow {
  return {
    user_id: userId,
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    target_percentage: asset.targetPercentage,
    current_price: asset.currentPrice,
    share_increment: asset.shareIncrement,
    quote_updated_at: asset.quoteUpdatedAt,
    sort_order: asset.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

export async function loadInvestmentAssets(
  userId: string,
): Promise<InvestmentAsset[]> {
  const { data, error } = await supabase
    .from("investment_assets")
    .select(
      "user_id, id, symbol, name, target_percentage, current_price, share_increment, quote_updated_at, sort_order, updated_at",
    )
    .eq("user_id", userId)
    .order("sort_order");

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRowToAsset);
}

export async function replaceInvestmentAssets(
  userId: string,
  assets: InvestmentAsset[],
): Promise<void> {
  const nextRows = assets.map((asset, index) =>
    mapAssetToRow(userId, { ...asset, sortOrder: index }),
  );

  const { data: existingRows, error: readError } = await supabase
    .from("investment_assets")
    .select(
      "user_id, id, symbol, name, target_percentage, current_price, share_increment, quote_updated_at, sort_order, updated_at",
    )
    .eq("user_id", userId);

  if (readError) {
    throw readError;
  }

  const nextIds = new Set(nextRows.map((row) => row.id));
  const removedIds = (existingRows ?? [])
    .filter((row) => !nextIds.has(row.id))
    .map((row) => row.id);

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("investment_assets")
      .delete()
      .eq("user_id", userId)
      .in("id", removedIds);

    if (error) {
      throw error;
    }
  }

  if (nextRows.length > 0) {
    const { error } = await supabase
      .from("investment_assets")
      .upsert(nextRows, { onConflict: "user_id,id" });

    if (error) {
      throw error;
    }
  }
}
