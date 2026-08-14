export type Card = {
  name: string;
  quantity: number;
  image?: string;
  scryfallId?: string;
  /** Scryfall's printing release date, used when choosing an art for grouped cards. */
  releasedAt?: string;
  /** Set and collector number from a pasted decklist, used to find its exact printing. */
  setCode?: string;
  collectorNumber?: string;
};

export function cardIdentity(card: Card) {
  return [card.name, card.scryfallId ?? "", card.setCode ?? "", card.collectorNumber ?? ""].join(
    "|",
  );
}

export type Plan = {
  id: string;
  name: string;
  mainboard: Card[];
  sideboard: Card[];
};
