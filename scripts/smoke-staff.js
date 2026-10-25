/* Test de bout en bout des comptes du dashboard et de leurs droits.
 * A lancer DANS le conteneur api, sur une base qui n'est pas en production :
 *   docker cp scripts/smoke-staff.js vtc-api-1:/app/ && docker exec -w /app vtc-api-1 node smoke-staff.js
 * Il cree deux comptes temporaires (smoke-*) et les supprime a la fin.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000/v1';
const prisma = new PrismaClient();
const PASSWORD = 'SmokeTest#2026';
const results = [];

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  return { status: res.status, data: json && json.data !== undefined ? json.data : json };
}

function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${name}${ok ? '' : ` -> ${detail}`}`);
}

async function login(email, password) {
  const r = await call('POST', '/auth/admin/login', null, { email, password });
  return { ...r, token: r.data && r.data.accessToken };
}

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.deleteMany({ where: { email: { startsWith: 'smoke-' } } });
  const admin = await prisma.user.create({
    data: { role: 'admin', phone: '+22399000001', email: 'smoke-admin@test.local', firstName: 'Smoke', lastName: 'Admin', passwordHash: hash, permissions: ['*'] },
  });
  try {
    const a = await login('smoke-admin@test.local', PASSWORD);
    check('connexion administrateur', a.status === 200 || a.status === 201, a.status);
    check('connexion renvoie les droits', Array.isArray(a.data.user.permissions) && a.data.user.permissions.includes('*'), JSON.stringify(a.data.user));

    const me = await call('GET', '/admin/me', a.token);
    check('GET /admin/me (admin)', me.status === 200 && me.data.permissions.includes('*'), me.status);

    const created = await call('POST', '/admin/staff', a.token, {
      firstName: 'Awa', lastName: 'Comptable', email: 'smoke-compta@test.local', phone: '+22399000002',
      password: PASSWORD, permissions: ['finances'],
    });
    check('creation du comptable', created.status === 201 && created.data.id, `${created.status} ${JSON.stringify(created.data)}`);
    check('la reponse ne contient aucun mot de passe', created.data && created.data.passwordHash === undefined, 'passwordHash present');
    const accId = created.data.id;

    const dup = await call('POST', '/admin/staff', a.token, {
      firstName: 'Bis', lastName: 'Doublon', email: 'SMOKE-compta@test.local', phone: '+22399000003',
      password: PASSWORD, permissions: ['finances'],
    });
    check('email deja utilise refuse', dup.status === 409, dup.status);

    const bad = await call('POST', '/admin/staff', a.token, {
      firstName: 'Mal', lastName: 'Forme', email: 'smoke-x@test.local', phone: '+22399000004',
      password: PASSWORD, permissions: ['nimporte-quoi'],
    });
    check('droit inconnu refuse', bad.status === 400, bad.status);

    const b = await login('smoke-compta@test.local', PASSWORD);
    check('connexion du comptable', b.status === 200 || b.status === 201, b.status);

    const expect = async (label, method, path, want) => {
      const r = await call(method, path, b.token);
      check(`comptable ${label}`, want.includes(r.status), `${r.status}`);
    };
    await expect('lit son profil', 'GET', '/admin/me', [200]);
    await expect('voit les finances', 'GET', '/admin/finances', [200]);
    await expect('voit les paiements', 'GET', '/admin/payments', [200]);
    await expect('voit le rapport de commissions', 'GET', '/admin/reports/commissions', [200]);
    await expect('ne voit pas les courses', 'GET', '/admin/trips', [403]);
    await expect('ne voit pas les clients', 'GET', '/admin/users', [403]);
    await expect('ne voit pas les chauffeurs', 'GET', '/drivers', [403]);
    await expect('ne voit pas les parametres', 'GET', '/admin/settings', [403]);
    await expect('ne voit pas les zones', 'GET', '/admin/zones', [403]);
    await expect('ne liste pas les comptes', 'GET', '/admin/staff', [403]);

    const selfEdit = await call('PATCH', `/admin/staff/${accId}`, b.token, { permissions: ['*'] });
    check('comptable ne peut pas se donner tous les droits', selfEdit.status === 403, selfEdit.status);
    const mk = await call('POST', '/admin/staff', b.token, { firstName: 'X', lastName: 'Y', email: 'smoke-z@test.local', phone: '+22399000005', password: PASSWORD, permissions: ['*'] });
    check('comptable ne peut pas creer de compte', mk.status === 403, mk.status);

    const list = await call('GET', '/admin/staff', a.token);
    check('admin liste les comptes sans mot de passe', list.status === 200 && list.data.every((u) => u.passwordHash === undefined), list.status);
    const users = await call('GET', '/admin/users?limit=5', a.token);
    check('liste des utilisateurs sans mot de passe', users.status === 200 && users.data.data.every((u) => u.passwordHash === undefined), users.status);

    const up = await call('PATCH', `/admin/staff/${accId}`, a.token, { permissions: ['finances', 'courses'] });
    check('admin ajoute le droit courses', up.status === 200, up.status);
    await expect('voit les courses apres le changement, sans reconnexion', 'GET', '/admin/trips', [200]);

    const off = await call('PATCH', `/admin/staff/${accId}`, a.token, { isActive: false });
    check('admin desactive le comptable', off.status === 200, off.status);
    await expect('est bloque tout de suite apres desactivation', 'GET', '/admin/finances', [403, 401]);
    const again = await login('smoke-compta@test.local', PASSWORD);
    check('reconnexion refusee apres desactivation', again.status === 403, again.status);

    const delSelf = await call('DELETE', `/admin/staff/${admin.id}`, a.token);
    check('admin ne peut pas supprimer son propre compte', delSelf.status === 400, delSelf.status);
    const del = await call('DELETE', `/admin/staff/${accId}`, a.token);
    check('admin supprime le comptable', del.status === 200 && del.data.deleted === true, `${del.status}`);
    const gone = await prisma.user.findUnique({ where: { id: accId } });
    check('le compte supprime n existe plus en base', gone === null, 'toujours present');

    const client = await prisma.user.findFirst({ where: { role: 'client' }, select: { id: true } });
    if (client) {
      const delClient = await call('DELETE', `/admin/staff/${client.id}`, a.token);
      check('on ne peut pas supprimer un client par cette route', delClient.status === 404, delClient.status);
    }
  } finally {
    await prisma.refreshToken.deleteMany({ where: { user: { email: { startsWith: 'smoke-' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'smoke-' } } });
    await prisma.$disconnect();
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} verifications reussies`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error('Erreur du script :', e);
  await prisma.user.deleteMany({ where: { email: { startsWith: 'smoke-' } } }).catch(() => {});
  process.exit(2);
});
