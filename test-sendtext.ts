import * as fs from 'fs';
import * as path from 'path';

// Read .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
}

const apiKey = envVars['SENDTEXT_API_KEY'];
const apiSecret = envVars['SENDTEXT_API_SECRET'];
const apiUrl = envVars['SENDTEXT_API_URL'] || 'https://api.sendtext.sn/v1/sms/ml';

if (!apiKey || !apiSecret) {
  console.error('Missing SENDTEXT_API_KEY or SENDTEXT_API_SECRET in .env');
  process.exit(1);
}

const phone = '22375673336';
const senderName = 'JulakAI';
const code = '1234';
const text = `Test JulakAI : votre code de verification est ${code}.`;

console.log(`Sending SMS to ${phone} with sender_name="${senderName}"...`);
console.log(`API URL: ${apiUrl}`);

(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'snt-api-key': apiKey,
        'snt-api-secret': apiSecret,
      },
      body: JSON.stringify({
        sender_name: senderName,
        phone,
        text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const body = await response.json().catch(() => ({}));
    console.log(`HTTP Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(body, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
})();
