import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleOrder, trayRecipient, recipientValid, transitionAllowed } from './integracao.ts';

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
