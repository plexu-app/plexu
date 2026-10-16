// URLs do app num lugar só.

export const hrefBoard = (ws: string, board: string) => `/w/${ws}/b/${board}`;

/** Card aberto por cima do board de origem. */
export const hrefCard = (ws: string, board: string, cardId: string) => `/w/${ws}/b/${board}/c/${cardId}`;
