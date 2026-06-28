// list-prefixes.mjs
// 列出 R2 桶中所有前缀
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

function formatDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function signRequest(method, uri, query, bodyHash, date) {
  const amzDate = formatDate(date);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders = 'host:' + host + '\nx-amz-content-sha256:' + bodyHash + '\nx-amz-date:' + amzDate + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = method + '\n' + uri + '\n' + query + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + bodyHash;
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = dateStamp + '/auto/s3/aws4_request';
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = algorithm + '\n' + amzDate + '\n' + credentialScope + '\n' + hashedCanonicalRequest;
  const signingKey = getSignatureKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return { authorization: algorithm + ' Credential=' + accessKeyId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature, amzDate };
}

async function main() {
  const { authorization, amzDate } = signRequest('GET', '/', 'list-type=2&delimiter=/&max-keys=1000', emptyPayloadHash, new Date());
  const url = 'https://' + host + '/?list-type=2&delimiter=/&max-keys=1000';
  const resp = await fetch(url, {
    headers: { 'Authorization': authorization, 'x-amz-content-sha256': emptyPayloadHash, 'x-amz-date': amzDate, 'Host': host },
  });
  const xml = await resp.text();
  
  // Extract CommonPrefixes (folders)
  const folders = [...xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map(m => m[1]);
  // Extract root-level keys
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
  
  console.log('=== 文件夹（前缀）===');
  folders.forEach(f => console.log('  ' + f));
  console.log('\n=== 根目录文件 ===');
  keys.forEach(k => console.log('  ' + k));
  console.log('\n文件夹数: ' + folders.length + ', 根目录文件数: ' + keys.length);
}

main();
