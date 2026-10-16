// URLs do app num lugar só.

export const hrefBoard = (ws: string, board: string) => `/w/${ws}/b/${board}`;

/** Card aberto: modal por cima da tela atual (rota interceptada) ou página do card no link direto. */
export const hrefCard = (ws: string, cardId: string) => `/w/${ws}/c/${cardId}`;
