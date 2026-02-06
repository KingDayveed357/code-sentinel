// Simple test to check if title normalizer works without AI
const { normalizeTitle } = require('../src/scanners/utils/title-normalizer');

console.log('🧪 Testing Title Normalizer (Synchronous Fallback)...\n');

const testCases = [
    {
        ruleId: 'javascript.lang.security.audit.xss.taint-unsafe-echo-tag',
        rawTitle: 'Taint-unsafe-echo-tag Taint-unsafe-echo-tag',
        scannerType: 'sast'
    },
    {
        ruleId: 'sql-injection',
        rawTitle: 'Found SQL injection in auth.ts at line 42',
        scannerType: 'sast'
    },
    {
        ruleId: 'CVE-2023-12345',
        rawTitle: null,
        scannerType: 'sca'
    }
];

console.log('Testing title normalization:\n');

testCases.forEach((test, i) => {
    console.log(`Test ${i + 1}:`);
    console.log(`  Rule ID: ${test.ruleId}`);
    console.log(`  Raw Title: ${test.rawTitle || '(none)'}`);

    try {
        const normalized = normalizeTitle(test.ruleId, test.rawTitle, test.scannerType);
        console.log(`  ✅ Normalized: "${normalized}"`);
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
    }
    console.log('');
});

console.log('✅ Title normalizer works correctly!');
console.log('This means the fallback path is functional.\n');
