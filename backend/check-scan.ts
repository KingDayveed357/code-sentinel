// Check specific scan logs
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const scanId = '721817eb-f2b4-4e8e-8a3f-e1f9e8e9e9e9'; // The scan with 9 vulns

async function checkScan() {
  console.log(`🔍 Checking scan ${scanId.substring(0, 8)}...\n`);
  
  // Get scan details
  const { data: scan, error: scanError } = await supabase
    .from('scans')
    .select('*')
    .ilike('id', `${scanId.substring(0, 8)}%`)
    .single();
  
  if (scanError || !scan) {
    console.log('❌ Scan not found');
    return;
  }
  
  console.log('📊 Scan Details:');
  console.log(`   ID: ${scan.id}`);
  console.log(`   Status: ${scan.status}`);
  console.log(`   Vulnerabilities Found: ${scan.vulnerabilities_found}`);
  console.log(`   Created: ${new Date(scan.created_at).toLocaleString()}`);
  console.log(`   Completed: ${scan.completed_at ? new Date(scan.completed_at).toLocaleString() : 'N/A'}`);
  console.log('');
  
  // Get logs
  const { data: logs, error: logsError } = await supabase
    .from('scan_logs')
    .select('level, message, created_at')
    .eq('scan_id', scan.id)
    .order('created_at', { ascending: true });
  
  if (logsError) {
    console.log('❌ Error fetching logs:', logsError.message);
    return;
  }
  
  console.log('📋 All Scan Logs:');
  logs?.forEach((log, i) => {
    const icon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`   ${i + 1}. ${icon} [${log.level.toUpperCase()}] ${log.message}`);
  });
}

checkScan().catch(console.error);
