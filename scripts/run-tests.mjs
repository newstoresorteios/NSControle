// Run in one process so restricted local environments do not need to spawn test workers.
const tests = [
  "tray-map", "bi-map", "correios-map", "finance", "order-filters",
  "request-user", "invoice-parse", "invoice-cost", "operational", "refunds", "taxes", "integracao",
];

for (const name of tests) {
  await import(`../src/lib/${name}.test.ts`);
}
