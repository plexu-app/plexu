// API pública do core. Canais (UI, API, import, automação) escrevem em cards só por aqui.
export { createCard, deleteCard, linkCards, moveCard, unlinkCards, updateFields } from "./cards";
export type { CreateCardInput, DeleteCardInput, LinkInput, MoveCardInput, UpdateFieldsInput } from "./cards";
export { emitirEvento } from "./events";
export type { EventoCard, TipoEvento } from "./events";
export { garantirIndiceExclusivo } from "./fields";
export { CoreError } from "./types";
export type { Actor, ActorType, CardRow, CodigoCore, OpcoesOp, Tx } from "./types";
