import test from 'node:test';
import assert from 'node:assert/strict';
import { ANA_PURCHASE_FIELDS, anaOriginAllowed, anaPurchasePatch, anaPurchaseVisible, eligibleOrder, pdfInvoice, trayRecipient, recipientValid, transitionAllowed } from './integracao.ts';

test('apenas pedidos a enviar sem entrega ou rastreio podem ser reservados',()=>{
  const order = {commercial_status:'A ENVIAR',delivered:false,tracking_code:null};
  assert.equal(eligibleOrder(order),true);
  for (const status of ['CANCELADO','AGUARDANDO PAGAMENTO','FINALIZADO','ENVIADO',null]) assert.equal(eligibleOrder({...order,commercial_status:status}),false);
  assert.equal(eligibleOrder({...order,tracking_code:'AA123456789BR'}),false);
  assert.equal(eligibleOrder({...order,delivered:true}),false);
});
test('expedição exige sequência e impede reenviar ou reabrir unidade enviada',()=>{
  assert.equal(transitionAllowed('pendente','preparando'),true);
  assert.equal(transitionAllowed('preparando','embalado'),true);
  assert.equal(transitionAllowed('embalado','enviado'),true);
  for (const from of ['enviado','cancelado','pendente']) assert.equal(transitionAllowed(from,'enviado'),false);
  assert.equal(transitionAllowed('enviado','cancelado'),false);
});
test('destinatário usa endereço de entrega e detecta dados incompletos',()=>{
  const recipient = trayRecipient({customer:{name:'Comprador',cpf:'123',phone:'21999999999'},address:{recipient:'Destinatário',address:'Rua A',number:'12',city:'Rio',state:'RJ',zip_code:'20000000'}});
  assert.equal(recipient.name,'Destinatário');
  assert.equal(recipientValid(recipient),true);
  assert.equal(recipientValid({...recipient,tax_id:''}),false);
  assert.equal(recipientValid(trayRecipient({})),false);
});
test('só origem Europa solicitada aparece para a Ana', () => {
  assert.equal(anaOriginAllowed('Europa'), true);
  assert.equal(anaOriginAllowed(' europa '), true);
  for (const origin of ['Japão', 'EUA', 'USA', 'Uscloser', 'Portugal', 'Tag', 'Global Alvaro', 'Loja', '', null]) {
    assert.equal(anaOriginAllowed(origin), false);
  }
  assert.equal(anaPurchaseVisible({ origin: 'Europa', requested: true }), true);
  assert.equal(anaPurchaseVisible({ origin: 'Europa', requested: false }), false);
  assert.equal(anaPurchaseVisible({ origin: 'Japão', requested: true }), false);
});
test('a Ana grava só os fatos de compra e pagamento já existentes', () => {
  const saved = anaPurchasePatch({
    purchased: true,
    supplierName: ' Pesci ',
    supplierRef: 'T137',
    supplierPurchaseDate: '2026-11-01',
    currency: 'eur',
    foreignAmount: 1200.5,
    paymentDate: '2026-11-02',
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.deepEqual(Object.keys(saved.patch).sort(), [...ANA_PURCHASE_FIELDS].sort());
  assert.equal(saved.patch.purchased, true);
  assert.equal(saved.patch.supplier_name, 'Pesci');
  assert.equal(saved.patch.purchase_currency, 'EUR');
  assert.equal(saved.patch.purchase_foreign_amount, 1200.5);
  assert.equal(ANA_PURCHASE_FIELDS.includes('sale_amount' as never), false);
  assert.equal(ANA_PURCHASE_FIELDS.includes('purchase_amount' as never), false);
  assert.equal(anaPurchasePatch({ purchased: true, supplierName: null, supplierRef: null, supplierPurchaseDate: null, currency: null, foreignAmount: -10, paymentDate: null }).ok, false);
  assert.equal(anaPurchasePatch({ purchased: false, supplierName: null, supplierRef: null, supplierPurchaseDate: '2026-13-01', currency: 'EUR', foreignAmount: 10, paymentDate: null }).ok, false);
  assert.equal(anaPurchasePatch({ purchased: false, supplierName: null, supplierRef: null, supplierPurchaseDate: null, currency: 'JPY', foreignAmount: 10, paymentDate: null }).ok, false);
  assert.equal(anaPurchasePatch({ purchased: false, supplierName: null, supplierRef: null, supplierPurchaseDate: null, currency: null, foreignAmount: 10, paymentDate: null }).ok, false);
});
test('fatura anexada precisa ser um PDF de até 8 MB', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  assert.equal(pdfInvoice(pdf, pdf.byteLength), true);
  assert.equal(pdfInvoice(new Uint8Array([0xff, 0xd8, 0xff]), 3), false);
  assert.equal(pdfInvoice(pdf, 8 * 1024 * 1024 + 1), false);
});
