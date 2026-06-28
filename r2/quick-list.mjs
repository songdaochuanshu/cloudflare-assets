// quick-list.mjs
import crypto from 'crypto';

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_KEY;
const bucketName = process.env.R2_HOMEPAGE_BUCKET || 'homepage-bg';
const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const host = bucketName + '.' + accountId + '.r2.cloudflarestorage.com';

function getSignatureKey(key, dateStamp) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update('auto').digest();
  const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
  return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function formatDate(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

function signRequest(method, uri, query, bodyHash, date) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders = 'host:' + host + '\nx-amz-content-sha256:' + bodyHash + '\nx-amz-date:' + amzDate + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = method + '\n' + uri + '\n' + query + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + bodyHash;
  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return { authorization: 'AWS4-HMAC-SHA256 Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature, amzDate };
}

async function main() {
  const allKeys = [];
  let marker = '';
  while (true) {
    let query = 'max-keys=1000';
    if (marker) query += '&marker=' + encodeURIComponent(marker);
    const { authorization, amzDate } = signRequest('GET', '/', query, emptyPayloadHash, new Date());
    const resp = await fetch('https://' + host + '/?' + query, {
      headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
    });
    if (!resp.ok) { console.error('List failed:', resp.status); break; }
    const xml = await resp.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) allKeys.push(m[1]);
    if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
    const next = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    marker = next ? next[1] : '';
  }

  console.log('总文件数:', allKeys.length);
  
  // Group by prefix
  const prefixes = {};
  const rootFiles = [];
  for (const key of allKeys) {
    const slashIdx = key.indexOf('/');
    if (slashIdx === -1) {
      rootFiles.push(key);
    } else {
      const prefix = key.substring(0, slashIdx + 1);
      if (!prefixes[prefix]) prefixes[prefix] = [];
      prefixes[prefix].push(key);
    }
  }

  console.log('\n=== 文件夹 ===');
  for (const [prefix, files] of Object.entries(prefixes).sort()) {
    console.log('  ' + prefix + ' (' + files.length + ' 个文件)');
  }
  console.log('\n=== 根目录文件 ===');
  console.log('  ' + rootFiles.length + ' 个');
  rootFiles.slice(0, 10).forEach(f => console.log('    ' + f));
  if (rootFiles.length > 10) console.log('    ... 还有 ' + (rootFiles.length - 10) + ' 个');
}

main();
