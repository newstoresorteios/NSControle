import { createAddress, updateAddress } from "@/app/(painel)/enderecos/actions";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADDRESS_USES, withCurrent } from "@/lib/lists";

type Address = {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  use_us: string | null;
  use_eu: string | null;
  use_jp: string | null;
};

export default async function EnderecosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const params = await searchParams;
  await requireTeam();
  const rows = await db()<Address[]>`
    select id, name, cpf, phone, email, street, street_number, complement, district, city, state, zip_code, use_us, use_eu, use_jp
    from ctl_redirect_addresses
    order by name
  `;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Endereços</h1>
        <p className="text-muted">Nomes e CPFs usados nos redirecionadores, com o uso em cada destino.</p>
      </div>
      {params.erro ? <p className="text-sm text-danger">Não foi possível salvar o endereço.</p> : null}
      {params.ok ? <p className="text-sm text-ok">Endereço atualizado.</p> : null}
      <details className="card">
        <summary className="section-title">Novo endereço</summary>
        <AddressForm action={createAddress} />
      </details>
      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Cidade</th>
              <th>Estados Unidos</th>
              <th>Europa</th>
              <th>Japão</th>
              <th>Ficha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td className="num">{row.cpf || "—"}</td>
                <td>{[row.city, row.state].filter(Boolean).join("/") || "—"}</td>
                <td>{row.use_us || "—"}</td>
                <td>{row.use_eu || "—"}</td>
                <td>{row.use_jp || "—"}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer underline">Editar</summary>
                    <AddressForm action={updateAddress} address={row} />
                  </details>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7}>Nenhum endereço cadastrado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddressForm({
  action,
  address,
}: {
  action: (formData: FormData) => void | Promise<void>;
  address?: Address;
}) {
  return (
    <form action={action} className="mt-3 grid min-w-72 gap-3 md:grid-cols-3">
      {address ? <input type="hidden" name="id" value={address.id} /> : null}
      <label className="grid gap-1 text-sm">Nome<input name="name" required defaultValue={address?.name ?? ""} /></label>
      <label className="grid gap-1 text-sm">CPF<input name="cpf" defaultValue={address?.cpf ?? ""} /></label>
      <label className="grid gap-1 text-sm">Telefone<input name="phone" defaultValue={address?.phone ?? ""} /></label>
      <label className="grid gap-1 text-sm">E-mail<input name="email" defaultValue={address?.email ?? ""} /></label>
      <label className="grid gap-1 text-sm">Endereço<input name="street" defaultValue={address?.street ?? ""} /></label>
      <label className="grid gap-1 text-sm">Nº<input name="street_number" defaultValue={address?.street_number ?? ""} /></label>
      <label className="grid gap-1 text-sm">Complemento<input name="complement" defaultValue={address?.complement ?? ""} /></label>
      <label className="grid gap-1 text-sm">Bairro<input name="district" defaultValue={address?.district ?? ""} /></label>
      <label className="grid gap-1 text-sm">Cidade<input name="city" defaultValue={address?.city ?? ""} /></label>
      <label className="grid gap-1 text-sm">Estado<input name="state" defaultValue={address?.state ?? ""} /></label>
      <label className="grid gap-1 text-sm">CEP<input name="zip_code" defaultValue={address?.zip_code ?? ""} /></label>
      <UseField label="Estados Unidos" name="use_us" value={address?.use_us} />
      <UseField label="Europa" name="use_eu" value={address?.use_eu} />
      <UseField label="Japão" name="use_jp" value={address?.use_jp} />
      <button className="ok md:w-fit" type="submit">{address ? "Salvar" : "Cadastrar"}</button>
    </form>
  );
}

function UseField({ label, name, value }: { label: string; name: string; value?: string | null }) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">—</option>
        {withCurrent(ADDRESS_USES, value).map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}
