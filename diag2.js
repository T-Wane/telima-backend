const Redis = require('ioredis');
const r = new Redis({ host: 'localhost', port: 6379 });

async function check() {
  const presence = await r.zrange('telima:driver:presence', 0, -1, 'WITHSCORES');
  console.log('Presence:', presence.length ? presence : 'VIDE');
  await r.disconnect();
}
check().catch(console.error);
