const webPush = require('web-push');

const vapidKeys = webPush.generateVAPIDKeys();

console.log('VAPID Keys generated! Add these to your environment variables:');
console.log('\nVAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('\nMake sure to also set VAPID_CONTACT_EMAIL in your environment variables!');
