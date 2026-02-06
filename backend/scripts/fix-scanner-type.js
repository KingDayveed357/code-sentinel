#!/usr/bin/env node
// Quick fix script to apply the scanner_type constraint fix via Supabase REST API

const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
}

// The SQL to execute
const SQL = `
-- Drop the existing check constraint if it exists
ALTER TABLE vulnerabilities_unified 
DROP CONSTRAINT IF EXISTS vulnerabilities_unified_scanner_type_check;

-- Add the correct check constraint with all valid scanner types
ALTER TABLE vulnerabilities_unified
ADD CONSTRAINT vulnerabilities_unified_scanner_type_check
CHECK (scanner_type IN ('sast', 'secret', 'sca', 'iac', 'container'));
`;

console.log('🔧 Applying scanner_type constraint fix...\n');
console.log('SQL to execute:');
console.log('─'.repeat(80));
console.log(SQL);
console.log('─'.repeat(80));
console.log('');

// Extract project ref from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
    console.error('❌ Could not extract project ref from SUPABASE_URL');
    process.exit(1);
}

const options = {
    hostname: `${projectRef}.supabase.co`,
    port: 443,
    path: '/rest/v1/rpc/exec_sql',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    }
};

const data = JSON.stringify({ query: SQL });

const req = https.request(options, (res) => {
    let body = '';

    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ Migration applied successfully!');
            console.log('');
            console.log('The scanner_type constraint now allows:');
            console.log('  - sast');
            console.log('  - secret');
            console.log('  - sca');
            console.log('  - iac');
            console.log('  - container');
            console.log('');
        } else {
            console.error('❌ Migration failed');
            console.error('Status:', res.statusCode);
            console.error('Response:', body);
            console.log('');
            console.log('⚠️  Please run the migration manually via Supabase SQL Editor:');
            console.log(`   ${SUPABASE_URL}/project/_/sql`);
            console.log('');
            console.log('Copy and paste the SQL shown above.');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
    console.log('');
    console.log('⚠️  Please run the migration manually via Supabase SQL Editor:');
    console.log(`   ${SUPABASE_URL}/project/_/sql`);
    console.log('');
    console.log('Copy and paste the SQL shown above.');
});

req.write(data);
req.end();
