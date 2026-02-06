// Quick diagnostic script to check database state
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
  console.log('🔍 CodeSentinel Database Diagnostic\n');
  console.log('='.repeat(50));

  // Check vulnerabilities_unified
  console.log('\n1️⃣  Checking vulnerabilities_unified table...');
  const { count: unifiedCount, error: unifiedError } = await supabase
    .from('vulnerabilities_unified')
    .select('*', { count: 'exact', head: true });
  
  if (unifiedError) {
    console.log('   ❌ Error:', unifiedError.message);
  } else {
    console.log('   📊 Total rows:', unifiedCount || 0);
    if (unifiedCount === 0) {
      console.log('   ⚠️  WARNING: Table is EMPTY!');
    }
  }

  // Check vulnerability_instances
  console.log('\n2️⃣  Checking vulnerability_instances table...');
  const { count: instancesCount, error: instancesError } = await supabase
    .from('vulnerability_instances')
    .select('*', { count: 'exact', head: true });
  
  if (instancesError) {
    console.log('   ❌ Error:', instancesError.message);
  } else {
    console.log('   📊 Total rows:', instancesCount || 0);
    if (instancesCount === 0) {
      console.log('   ⚠️  WARNING: Table is EMPTY!');
    }
  }

  // Check legacy vulnerabilities_sast
  console.log('\n3️⃣  Checking legacy vulnerabilities_sast table...');
  const { count: sastCount, error: sastError } = await supabase
    .from('vulnerabilities_sast')
    .select('*', { count: 'exact', head: true });
  
  if (sastError) {
    console.log('   ❌ Error:', sastError.message);
  } else {
    console.log('   📊 Total rows:', sastCount || 0);
    if (sastCount && sastCount > 0) {
      console.log('   ℹ️  Legacy table HAS data - unified tables should too!');
    }
  }

  // Check recent scans
  console.log('\n4️⃣  Checking recent scans...');
  const { data: scans, error: scansError } = await supabase
    .from('scans')
    .select('id, status, created_at, vulnerabilities_found')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (scansError) {
    console.log('   ❌ Error:', scansError.message);
  } else if (!scans || scans.length === 0) {
    console.log('   ⚠️  No scans found');
  } else {
    console.log('   📋 Recent scans:');
    scans.forEach(scan => {
      console.log(`      - ${scan.id.substring(0, 8)}... | ${scan.status.padEnd(10)} | ${(scan.vulnerabilities_found || 0).toString().padStart(3)} vulns | ${new Date(scan.created_at).toLocaleString()}`);
    });
  }

  // Check scan logs for the most recent scan
  if (scans && scans.length > 0) {
    const latestScanId = scans[0].id;
    console.log(`\n5️⃣  Checking logs for latest scan (${latestScanId.substring(0, 8)}...)...`);
    
    const { data: logs, error: logsError } = await supabase
      .from('scan_logs')
      .select('level, message, created_at')
      .eq('scan_id', latestScanId)
      .order('created_at', { ascending: true });
    
    if (logsError) {
      console.log('   ❌ Error:', logsError.message);
    } else if (!logs || logs.length === 0) {
      console.log('   ⚠️  No logs found for this scan');
    } else {
      console.log('   📋 Scan logs (showing key messages):');
      logs.forEach(log => {
        // Only show important logs
        if (log.message.includes('unified') || 
            log.message.includes('Processing') ||
            log.message.includes('Failed') ||
            log.message.includes('error') ||
            log.message.includes('CRITICAL') ||
            log.level === 'error') {
          const icon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : 'ℹ️';
          console.log(`      ${icon} [${log.level.toUpperCase().padEnd(7)}] ${log.message}`);
        }
      });
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n🎯 DIAGNOSIS:');
  
  if (sastCount && sastCount > 0 && unifiedCount === 0) {
    console.log('   ❌ PROBLEM CONFIRMED: Legacy tables have data but unified tables are empty');
    console.log('   🔍 This means processUnifiedVulnerabilities() is NOT running or failing');
    console.log('\n   Next steps:');
    console.log('   1. Check the scan logs above for "Processing unified vulnerabilities"');
    console.log('   2. Look for error messages with "unified" or "CRITICAL"');
    console.log('   3. Run a new scan and watch backend terminal for emoji markers');
  } else if (unifiedCount && unifiedCount > 0) {
    console.log('   ✅ Unified tables ARE being populated');
    console.log('   ℹ️  The issue might be in the API queries, not the data storage');
  } else {
    console.log('   ⚠️  No data in any vulnerability tables');
    console.log('   🔍 Scanners might not be finding vulnerabilities, or scans are failing');
  }
  
  console.log('\n');
}

diagnose().catch(console.error);
