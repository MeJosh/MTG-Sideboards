export type Card = {
  name: string;
  quantity: number;
  image?: string;
  scryfallId?: string;
};

export type Plan = {
  id: string;
  name: string;
  mainboard: Card[];
  sideboard: Card[];
};
