"""Fixture tests for import_pedidos (v3-shaped workbook)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import openpyxl

from import_pedidos import (
    build,
    list_notas_sheets,
    parse_finance_sheet_month,
)


def _write_finance(ws, rows):
    for r_index, row in enumerate(rows, start=1):
        for c_index, value in enumerate(row, start=1):
            ws.cell(r_index, c_index, value)


def make_fixture(path: Path):
    wb = openpyxl.Workbook()
    # Month sheet with encomenda + Pronta Entrega + TAXAS
    fin = wb.active
    fin.title = "Financeiro 1026"
    _write_finance(
        fin,
        [
            ["", "Data", "", "", "Controle Financeiro de Outubro de 2026"],
            ["", None, "Resultado Financeiro"],
            ["", None, "Total de Vendas Loja Nova", "Total de Vendas Sob Encomenda", "Custo de compra ", "Meta"],
            ["", None, 100, 500, 0, 1400000],
            [],
            ["Qtde", "Pedido", "Referência", "Status", "Valor de Venda", "Valor de Compra", "Taxas de Pgto - Maquina", "Custo Envio", "Valor da Taxa - Envio"],
            [1, 10001, "REF-A", "COMPRADO", 1000, 400, None, None, None],
            [1, 10002, "REF-B", "COMPRADO", 2000, None, None, None, None],
            [1, "Pronta Entrega"],
            [1, 501, "STOCK-1", "ENVIADO", 500, None, None, None, None],
            ["", None, "TAXAS"],
            [1, 10001, "AB123456789BR", "TAXADO", None, None, None, None, 80],
        ],
    )
    # Newer notas first in creation then older inserted at index 0 → workbook order is 9 then 10
    # (old importer would have read only 9; new importer reads both, prioritizing 10).
    n10 = wb.create_sheet("notas de intermediação 10")
    n10.append(["Pedidos", "Plataforma", "Comprado", "Rastreamento", "Valor Comprado", "Taxa", "Frete"])
    n10.append([10002, "EU", True, "AB222", 650, 25, 70])  # newer wins for empty fields
    n10.append([10003, "EU", True, "AB333", 300, 15, 40])

    n9 = wb.create_sheet("notas de intermediação 9", 0)
    n9.append(["Pedidos", "Plataforma", "Comprado", "Rastreamento", "Valor Comprado", "Taxa", "Frete"])
    n9.append([10001, "EU", True, "AB111", 999, 10, 50])  # should NOT win over finance purchase 400
    n9.append([10002, "EU", True, "AB222", 700, 20, 60])  # must not overwrite 10's fee/ship

    for title in (
        "Financeiro 2026",
        "Entregues",
        "Pedidos",
        "Acompanhamentos",
        "Rastreamento",
        "Cancelamentos",
        "Estoque",
        "Relógios comprados de clientes",
    ):
        ws = wb.create_sheet(title)
        if title == "Financeiro 2026":
            ws.append(["", "Data", "", "", "Controle Financeiro de Julho de 2026"])
        elif title in {"Entregues", "Pedidos", "Acompanhamentos", "Rastreamento"}:
            ws.append(["ID", "x", "y", "z", "w", "a", "b", "c", "d", "e"])
        elif title == "Estoque":
            ws.append(["", "", "Marca", "Modelo"])
        elif title == "Relógios comprados de clientes":
            ws.append(["Cliente", "Tel", "CPF", "Codigo", "Modelo"])
        else:
            ws.append(["Pedido"])

    # Also add Financeiro 1126 to prove dynamic month detection
    fin11 = wb.create_sheet("Financeiro 1126")
    _write_finance(
        fin11,
        [
            ["", "Data", "", "", "Controle Financeiro de Novembro de 2026"],
            ["Qtde", "Pedido", "Referência", "Status", "Valor de Venda", "Valor de Compra", "Taxas", "Envio", "Taxa"],
            [1, 11001, "NOV", "COMPRADO", 300, 100, None, None, None],
        ],
    )

    wb.save(path)
    wb.close()


class ImportPedidosTest(unittest.TestCase):
    def test_parse_finance_sheet_month(self):
        self.assertEqual(parse_finance_sheet_month("Financeiro 1026"), "2026-10-01")
        self.assertEqual(parse_finance_sheet_month("Financeiro 1126"), "2026-11-01")
        self.assertIsNone(parse_finance_sheet_month("Financeiro 2026"))
        self.assertIsNone(parse_finance_sheet_month("Pedidos"))

    def test_v3_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fixture.xlsx"
            make_fixture(path)
            wb = openpyxl.load_workbook(path, read_only=True)
            notas = list_notas_sheets(wb)
            wb.close()
            self.assertEqual(notas[0], "notas de intermediação 10")
            self.assertEqual(notas[1], "notas de intermediação 9")

            payload, report = build(path)
            months = {g["month"] for g in payload["goals"]} | {
                o["finance_month"] for o in payload["orders"] if o.get("finance_month")
            }
            self.assertIn("2026-10-01", months)
            self.assertIn("2026-11-01", months)

            by_key = {}
            for order in payload["orders"]:
                by_key[(order["order_key"], order["flow"], order["finance_month_key"])] = order

            enc = next(o for o in payload["orders"] if o["order_key"] == "10001" and o["flow"] == "encomenda")
            self.assertEqual(enc["purchase_amount"], 400)  # finance wins over notas 999
            self.assertEqual(enc["import_tax"], 80)

            enc2 = next(o for o in payload["orders"] if o["order_key"] == "10002" and o["flow"] == "encomenda")
            # purchase/fee/ship from notas 10 (newer), not overwritten by 9
            self.assertEqual(enc2["purchase_amount"], 650)
            self.assertEqual(enc2["payment_fee"], 25)
            self.assertEqual(enc2["shipping_cost"], 70)

            pronta = next(o for o in payload["orders"] if o["order_key"] == "501")
            self.assertEqual(pronta["flow"], "loja_nova")
            self.assertEqual(pronta["origin"], "Pronta Entrega")
            self.assertEqual(pronta["sale_amount"], 500)

            self.assertGreaterEqual(report["pronta_entrega"], 1)
            self.assertEqual(report["notas_abas"][0]["aba"], "notas de intermediação 10")
            self.assertTrue(any("ordem das abas notas" in a for a in report["avisos"]))
            self.assertGreaterEqual(report["sem_compra"], 1)


if __name__ == "__main__":
    unittest.main()
