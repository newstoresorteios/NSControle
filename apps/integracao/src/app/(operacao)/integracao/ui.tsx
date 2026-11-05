export function Notice({ ok, erro }: { ok?: string; erro?: string }) {
  return (
    <>
      {erro ? <p role="alert" className="card text-danger">{erro}</p> : null}
      {ok ? <p role="status" className="text-ok">Operação concluída.</p> : null}
    </>
  );
}

export function Field({ name, label, required = false, type = "text", value }: { name: string; label: string; required?: boolean; type?: string; value?: string }) {
  return (
    <label className="grid gap-1">
      {label}
      <input name={name} type={type} required={required} defaultValue={value} maxLength={type === "text" ? 500 : undefined} min={type === "number" ? 1 : undefined} step={type === "number" ? "any" : undefined} />
    </label>
  );
}

export const recipientFields = [
  ["name", "Destinatário"],
  ["address", "Rua"],
  ["number", "Número"],
  ["complement", "Complemento"],
  ["city", "Cidade"],
  ["state", "Estado"],
  ["postal_code", "CEP"],
  ["country", "País (ISO)"],
  ["phone", "Telefone"],
  ["tax_id", "CPF/CNPJ"],
] as const;
