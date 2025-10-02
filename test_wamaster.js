// TEST SCRIPT FOR WAMASTER
// Run with: node test_wamaster.js

const {
  detectBugMessage,
  detectUserCountryCode,
  getSettings,
  toggleAntiBug,
  blockCode,
} = require('./lib/wamaster');

console.log('🧪 Testing WAMaster System...\n');

// Test 1: Country Code Detection
console.log('Test 1: Country Code Detection');
const testNumbers = [
  '2347012345678@s.whatsapp.net', // Nigeria
  '254712345678@s.whatsapp.net',  // Kenya
  '447012345678@s.whatsapp.net',  // UK
  '917012345678@s.whatsapp.net',  // India
  '15551234567@s.whatsapp.net'    // US
];

testNumbers.forEach(num => {
  const code = detectUserCountryCode(num);
  console.log(`  ${num} → Country Code: +${code || 'Unknown'}`);
});

// Test 2: Bug Message Detection
console.log('\nTest 2: Bug Message Detection');

// 2a: Normal message
const normalMessage = {
  key: { remoteJid: '1234567890@s.whatsapp.net' },
  message: { conversation: 'Hello, this is a normal message' }
};
const normalResult = detectBugMessage(normalMessage);
console.log(`  Normal message: ${normalResult.isBug ? '❌ FAILED' : '✅ PASSED'}`);

// 2b: Special char spam
const bugMessage1 = {
  key: { remoteJid: '1234567890@s.whatsapp.net' },
  message: { conversation: '!!!@@@###$$$%%%^^^&&&***((()))}}}|||\\///<<<>>>???~~~```' }
};
const bugResult1 = detectBugMessage(bugMessage1);
console.log(`  Special char spam: ${bugResult1.isBug ? '✅ PASSED (detected)' : '❌ FAILED (missed)'}`);
if (bugResult1.isBug) console.log(`    Reason: ${bugResult1.reason}, Severity: ${bugResult1.severity}`);

// 2c: Oversized message
const huge = 'A'.repeat(150000);
const bugMessage2 = {
  key: { remoteJid: '1234567890@s.whatsapp.net' },
  message: { conversation: huge }
};
const bugResult2 = detectBugMessage(bugMessage2);
console.log(`  Oversized message: ${bugResult2.isBug ? '✅ PASSED (detected)' : '❌ FAILED (missed)'}`);
if (bugResult2.isBug) console.log(`    Reason: ${bugResult2.reason}, Severity: ${bugResult2.severity}`);

// 2d: Rapid spam simulation
console.log('  Rapid spam test:');
const spammer = '9876543210@s.whatsapp.net';
for (let i = 0; i < 10; i++) {
  const spamMsg = { key: { remoteJid: spammer }, message: { conversation: `Spam ${i}` } };
  const spamResult = detectBugMessage(spamMsg);
  if (i < 7) {
    if (spamResult.isBug) console.log(`    ❌ Message ${i+1}: False positive`);
  } else {
    if (spamResult.isBug) console.log(`    ✅ Message ${i+1}: Spam detected (${spamResult.reason})`);
    else console.log(`    ❌ Message ${i+1}: Should have been detected`);
  }
}

// Test 3: Settings
console.log('\nTest 3: Settings Management');
const settings = getSettings();
console.log(`  Current settings:`, JSON.stringify(settings, null, 2));

// Test 4: Toggle Anti-Bug
console.log('\nTest 4: Toggle Anti-Bug');
const newState = toggleAntiBug();
console.log(`  Anti-Bug is now: ${newState ? 'ENABLED' : 'DISABLED'}`);

// Test 5: Country code blocking
console.log('\nTest 5: Country Code Blocking');
console.log(`  Blocking country code 234 (Nigeria)...`);
blockCode('234');
const updatedSettings = getSettings();
console.log(`  Blocked codes: ${updatedSettings.blockedCodes.join(', ')}`);

console.log('\n✅ All tests completed!\n');
console.log('💡 To test in real WhatsApp:');
console.log('   1. Start your bot');
console.log('   2. Send: .wamaster status');
console.log('   3. Send: .wamaster antibug');
console.log('   4. Try sending a spam message to test detection');

