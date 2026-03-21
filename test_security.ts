import axios from 'axios';

const API_URL = 'http://localhost:3000';
const INTERNAL_SECRET = 'dev-internal-secret'; // Use what you set in your .env or the default for local testing

async function testSecurity() {
  console.log('--- STARTING SECURITY TESTS ---');

  const slug = 'test-qik-88'; // Should exist in DB from test_e2e.ts or manually
  const otherUserUid = 'some_other_user';
  const myUid = 'test_user_999';

  // Helper to test an endpoint
  async function check(method: string, url: string, headers: any = {}, body: any = null) {
    try {
      const res = await axios({ method, url: `${API_URL}${url}`, headers, data: body });
      return res.status;
    } catch (error: any) {
      return error.response?.status || 500;
    }
  }

  // 1. Test /api/analytics/:slug/summary without Token
  console.log('1. Testing analytics without token...');
  const status1 = await check('get', `/api/analytics/${slug}/summary`);
  console.log(`   Status: ${status1} (Expected: 401)`);

  // 2. Test /api/analytics/account/:uid without Token
  console.log('2. Testing account analytics without token...');
  const status2 = await check('get', `/api/analytics/account/${myUid}`);
  console.log(`   Status: ${status2} (Expected: 401)`);

  // 3. Test /internal/slug/:slug without/wrong Secret
  console.log('3. Testing /internal/slug/:slug with wrong secret...');
  const status3 = await check('get', `/internal/slug/${slug}`, { 'Authorization': 'Bearer wrong' });
  console.log(`   Status: ${status3} (Expected: 401)`);

  // 4. Test /internal/slug/:slug with correct Secret
  console.log('4. Testing /internal/slug/:slug with correct secret...');
  // Note: This requires INTERNAL_SECRET env var to be set on the server
  const status4 = await check('get', `/internal/slug/${slug}`, { 'Authorization': `Bearer ${INTERNAL_SECRET}` });
  console.log(`   Status: ${status4} (Expected: 200/404 depending on slug existence)`);

  console.log('--- SECURITY TESTS COMPLETE ---');
}

testSecurity().catch(console.error);
