import { LIVE_CHECKS, checkLive } from './live-checks.mjs';

const messages = await checkLive();
for (const { url } of LIVE_CHECKS) {
  const own = messages.filter((m) => m.startsWith(`${url}: `));
  if (own.length === 0) console.log(`ok ${url}`);
  for (const m of own) console.log(`FAIL ${m}`);
}
process.exit(messages.length > 0 ? 1 : 0);
