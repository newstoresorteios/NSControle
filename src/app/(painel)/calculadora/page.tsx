"use client";

import { useMemo, useState } from "react";
import { brl } from "@/lib/format";

export default function CalculadoraPage() {
  const [eur, setEur] = useState("915");
  const [discount, setDiscount] = useState("25");
  const [rate, setRate] = useState("6.48");
  const [fee, setFee] = useState("500");
  const [parcelado, setParcelado] = useState("9799.99");
  const [paymentOff, setPaymentOff] = useState("5");
  const [pixOff, setPixOff] = useState("15");

  const europe = useMemo(() => {
    const price = number(eur);
    const off = number(discount) / 100;
    const euro = number(rate);
    const extra = number(fee);
    const finalEur = price * (1 - off);
    return { finalEur, brl: finalEur * euro + extra };
  }, [eur, discount, rate, fee]);

  const sale = useMemo(() => {
    const price = number(parcelado);
    const afterPayment = price * (1 - number(paymentOff) / 100);
    const pixList = price * (1 - number(pixOff) / 100);
    const pixAfterPayment = afterPayment * (1 - number(pixOff) / 100);
    return { afterPayment, pixList, pixAfterPayment };
  }, [parcelado, paymentOff, pixOff]);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Calculadora</h1>
        <p className="text-[#6d645b]">
          As mesmas contas da aba de cálculos: desconto da Europa, desconto de pagamento e PIX à vista.
        </p>
      </div>
      <section className="card grid gap-4 md:grid-cols-2">
        <div className="grid gap-3">
          <h2 className="font-semibold">Custo Europa</h2>
          <NumberField label="Valor do relógio (EUR)" value={eur} onChange={setEur} />
          <NumberField label="Desconto (%)" value={discount} onChange={setDiscount} />
          <NumberField label="Euro hoje" value={rate} onChange={setRate} />
          <NumberField label="Taxa (R$)" value={fee} onChange={setFee} />
        </div>
        <div className="grid content-end gap-2">
          <p>Valor final: {europe.finalEur.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} EUR</p>
          <p className="text-2xl font-semibold">{brl(europe.brl)}</p>
        </div>
      </section>
      <section className="card grid gap-4 md:grid-cols-2">
        <div className="grid gap-3">
          <h2 className="font-semibold">Preço de venda</h2>
          <NumberField label="Valor parcelado" value={parcelado} onChange={setParcelado} />
          <NumberField label="Desconto de pagamento (%)" value={paymentOff} onChange={setPaymentOff} />
          <NumberField label="PIX à vista (%)" value={pixOff} onChange={setPixOff} />
        </div>
        <div className="grid content-end gap-2">
          <p>Depois do desconto de pagamento: {brl(sale.afterPayment)}</p>
          <p>PIX sobre o parcelado: {brl(sale.pixList)}</p>
          <p className="text-2xl font-semibold">PIX depois do pagamento: {brl(sale.pixAfterPayment)}</p>
        </div>
      </section>
    </div>
  );
}

function number(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
    </label>
  );
}
