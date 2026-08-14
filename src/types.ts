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

/** Creates a browser-safe local identifier, including in older webviews without randomUUID. */
export function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++)
      bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type Plan = {
  id: string;
  name: string;
  mainboard: Card[];
  sideboard: Card[];
};
