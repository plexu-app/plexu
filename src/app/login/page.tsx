import { redirect } from "next/navigation";
import { FormAuth } from "@/components/form-auth";
import { Marca } from "@/components/marca";
import { Card, CardContent } from "@/components/ui/misc";
import { entrar } from "@/app/auth-actions";
import { usuarioAtual } from "@/server/auth/sessao";
import { haUsuarios } from "@/server/consultas";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (!(await haUsuarios())) redirect("/setup");
  if (await usuarioAtual()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-2">
            <Marca />
            <h1 className="text-lg font-semibold">Entrar no Plexu</h1>
          </div>
          <FormAuth
            acao={entrar}
            botao="Entrar"
            campos={[
              { nome: "email", rotulo: "E-mail", tipo: "email", autoComplete: "email" },
              { nome: "senha", rotulo: "Senha", tipo: "password", autoComplete: "current-password" },
            ]}
          />
        </CardContent>
      </Card>
    </main>
  );
}
