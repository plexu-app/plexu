// Ícone de cada tipo de campo (kanban, card aberto, paleta de tipos). Um lugar só, para os três
// lugares mostrarem o mesmo desenho.
import {
  AlignLeft,
  Binary,
  Building2,
  Calendar,
  CalendarClock,
  CircleDollarSign,
  CircleDot,
  Hash,
  IdCard,
  Link2,
  ListChecks,
  ListOrdered,
  Paperclip,
  Search,
  Sigma,
  TextQuote,
  ToggleLeft,
  Type,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONES: Record<string, LucideIcon> = {
  text: Type,
  long_text: AlignLeft,
  number: Hash,
  currency: CircleDollarSign,
  date: Calendar,
  datetime: CalendarClock,
  boolean: ToggleLeft,
  select: CircleDot,
  multi_select: ListChecks,
  person: User,
  attachment: Paperclip,
  cpf: IdCard,
  cnpj: Building2,
  relation: Link2,
  lookup: Search,
  sequence: ListOrdered,
  rollup: Sigma,
  formula: Binary,
  dynamic_text: TextQuote,
};

export const iconeDoTipo = (tipo: string): LucideIcon => ICONES[tipo] ?? Type;

export function IconeTipo({ tipo, className }: { tipo: string; className?: string }) {
  const Icone = iconeDoTipo(tipo);
  return <Icone className={cn("size-4 shrink-0", className)} aria-hidden />;
}
