// API pública do core. Canais (UI, API, import, automação) escrevem em cards só por aqui.
export { createCard, deleteCard, linkCards, moveCard, restoreCard, unlinkCards, updateFields } from "./cards";
export type { CreateCardInput, DeleteCardInput, LinkInput, MoveCardInput, RestoreCardInput, UpdateFieldsInput } from "./cards";
export { addComment, LIMITE_COMENTARIO } from "./comments";
export type { AddCommentInput } from "./comments";
export { emitirEvento, emitirEventoConfig } from "./events";
export type { EntidadeConfig, EventoCard, EventoConfig, TipoEvento } from "./events";
export { garantirIndiceExclusivo } from "./fields";
export { estadoDosCampos } from "./vistas";
export type { EstadoCampo } from "./vistas";
export { CoreError } from "./types";
export type { Actor, ActorType, CardRow, CodigoCore, OpcoesOp, Tx } from "./types";
