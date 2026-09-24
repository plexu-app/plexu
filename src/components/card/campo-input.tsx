"use client";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { formatarValor } from "@/lib/formatar";
import { nomeInput } from "@/lib/form-campos";

export interface CampoInputProps {
  campo: { id: string; name: string; type: string; config: Record<string, unknown> };
  valor: unknown;
  pessoas: Record<string, string>;
  id?: string;
  obrigatorio?: boolean;
  compacto?: boolean;
  /** id do <form> dono dos inputs, quando eles ficam fora dele (atributo HTML form). */
  form?: string;
}

type Opcao = string | { value?: string; id?: string; label?: string };
export function opcoesDe(config: Record<string, unknown>): { valor: string; rotulo: string }[] {
  const o = config.options;
  if (!Array.isArray(o)) return [];
  return (o as Opcao[]).map((x) =>
    typeof x === "string" ? { valor: x, rotulo: x } : { valor: x.value ?? x.id ?? x.label ?? "", rotulo: x.label ?? x.value ?? x.id ?? "" },
  );
}

function paraDatetimeLocal(v: unknown): string {
  if (typeof v !== "string") return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Input HTML adequado ao tipo do campo, com name = f:<field_id>. */
export function CampoInput({ campo, valor, pessoas, id, obrigatorio, compacto, form }: CampoInputProps) {
  const name = nomeInput(campo.id);
  const comum = { id, name, form, "aria-label": campo.name, "aria-required": obrigatorio || undefined };
  const texto = valor === null || valor === undefined ? "" : String(valor);
  switch (campo.type) {
    case "long_text":
      return <Textarea {...comum} defaultValue={texto} rows={compacto ? 1 : 3} />;
    case "number":
    case "currency":
      return <Input {...comum} inputMode="decimal" defaultValue={texto} placeholder={campo.type === "currency" ? "0,00" : undefined} />;
    case "date":
      return <Input {...comum} type="date" defaultValue={texto} />;
    case "datetime":
      return <Input {...comum} type="datetime-local" defaultValue={paraDatetimeLocal(valor)} />;
    case "boolean":
      return <input {...comum} type="checkbox" defaultChecked={valor === true} className="size-4 accent-[var(--primary)]" />;
    case "select":
      return (
        <NativeSelect {...comum} defaultValue={texto}>
          <option value="">—</option>
          {opcoesDe(campo.config).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </NativeSelect>
      );
    case "multi_select": {
      const marcados = new Set(Array.isArray(valor) ? valor.map(String) : []);
      return (
        <div className="flex flex-wrap gap-3" role="group" aria-label={campo.name}>
          {opcoesDe(campo.config).map((o) => (
            <label key={o.valor} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={name} form={form} value={o.valor} defaultChecked={marcados.has(o.valor)} className="size-4" />
              {o.rotulo}
            </label>
          ))}
        </div>
      );
    }
    case "person":
      return (
        <NativeSelect {...comum} defaultValue={Array.isArray(valor) ? String(valor[0] ?? "") : texto}>
          <option value="">—</option>
          {Object.entries(pessoas).map(([uid, nome]) => (
            <option key={uid} value={uid}>
              {nome}
            </option>
          ))}
        </NativeSelect>
      );
    case "cpf":
    case "cnpj":
      return <Input {...comum} defaultValue={formatarValor(campo, valor)} />;
    default:
      return <Input {...comum} defaultValue={Array.isArray(valor) ? valor.join(", ") : texto} />;
  }
}
