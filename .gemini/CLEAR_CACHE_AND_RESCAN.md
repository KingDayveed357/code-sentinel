# Clear Scan Cache and Force Fresh Scan

This script will help you clear the scan cache and run a fresh scan to populate the vulnerability tables.

## Step 1: Clear Recent Scans (Optional - for testing)

**WARNING**: This will delete recent scan data. Only do this if you're debugging.

```sql
-- Check recent scans first
SELECT id, status, created_at, vulnerabilities_found 
FROM scans 
ORDER BY created_at DESC 
LIMIT 10;

-- Delete scans from the last hour (adjust as needed)
DELETE FROM scans 
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Verify deletion
SELECT COUNT(*) FROM scans;
```

## Step 2: Run a Fresh Scan

1. Go to CodeSentinel dashboard
2. Navigate to Scans page
3. Click "New Scan"
4. Select a repository
5. Start the scan

## Step 3: Monitor Backend Logs

Watch the backend terminal for these key log messages:

### Expected Flow:
```
📦 Executing vulnerability inserts
✅ All vulnerability inserts completed successfully
ℹ️  Processing unified vulnerabilities and instances
🔄 START: Processing vulnerabilities for unified deduplication
📝 Step 1: Computing fingerprints
✅ Step 1 complete
🔍 Step 2: Fetching existing unified rows
✅ Step 2 complete
🔀 Step 3: Separating creates vs updates
✅ Step 3 complete
➕ Step 4: Inserting new unified rows
✅ Step 4 complete
📦 Step 6: Creating instance rows
➕ Inserting instance rows
✅ Step 6 complete
✅ COMPLETE: Unified vulnerability processing
```

### If You See Errors:

**Error in storeVulnerabilities():**
```
❌ CRITICAL: Failed to store vulnerabilities
```
- Check the error details in the logs
- Common causes:
  - Schema mismatch (user_id vs workspace_id)
  - Missing required fields
  - Database permissions

**Error in processUnifiedVulnerabilities():**
```
❌ FAILED: Unified vulnerability processing
```
- Check which step failed
- Common causes:
  - Database permissions
  - Missing fingerprint
  - Invalid data format

## Step 4: Verify Data

Run the diagnostic script:
```bash
cd backend
npx tsx diagnose-db.ts
```

Expected output:
```
1️⃣  Checking vulnerabilities_unified table...
   📊 Total rows: 12  ✅

2️⃣  Checking vulnerability_instances table...
   📊 Total rows: 12  ✅

3️⃣  Checking legacy vulnerabilities_sast table...
   📊 Total rows: 12  ✅
```

## Step 5: Check UI

1. Go to Scan Detail page
2. Verify:
   - Scanner Results shows counts
   - Findings by Severity is accurate
   - "What Should I Fix First?" is populated

3. Go to Global Vulnerabilities page
4. Verify:
   - Vulnerabilities are listed
   - Severity breakdown is correct

## Troubleshooting

### Issue: Scan shows "X vulns" but tables are empty

**Cause**: Scan cache is cloning from a previous failed scan

**Solution**:
1. Delete recent scans (see Step 1)
2. Run a fresh scan
3. Monitor logs for actual errors

### Issue: "No vulnerabilities to process for unified architecture"

**Cause**: `allVulnerabilities` array is empty

**Check**:
1. Look for log: "Found X raw vulnerabilities"
2. If X is 0, scanners aren't finding issues
3. If X > 0, check deduplication logic

### Issue: storeVulnerabilities() fails with schema error

**Cause**: `user_id` column doesn't match `workspaceId` value

**Solution**:
1. Check database schema
2. Verify `user_id` column exists and accepts UUIDs
3. Or change code to use correct column name

### Issue: Permission denied errors

**Cause**: Database user doesn't have INSERT permissions

**Solution**:
1. Check Supabase RLS policies
2. Ensure service role has full access
3. Grant INSERT permissions to tables

## Next Steps

If the scan still fails after following these steps:

1. **Capture full logs**: Copy the entire backend log output during a scan
2. **Check database directly**: Use Supabase dashboard to inspect tables
3. **Test individual components**:
   - Test scanner execution
   - Test deduplication
   - Test database inserts manually

## Manual Database Insert Test

To test if database inserts work at all:

```typescript
// test-insert.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testInsert() {
  const { data, error } = await supabase
    .from('vulnerabilities_unified')
    .insert({
      fingerprint: 'test-' + Date.now(),
      title: 'Test Vulnerability',
      description: 'Test',
      severity: 'low',
      scanner_type: 'sast',
      repository_id: 'YOUR_REPO_ID',
      workspace_id: 'YOUR_WORKSPACE_ID',
      rule_id: 'test-rule',
      status: 'open',
      first_detected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select();
  
  if (error) {
    console.log('❌ Insert failed:', error);
  } else {
    console.log('✅ Insert succeeded:', data);
  }
}

testInsert();
```

Run: `npx tsx test-insert.ts`
