-- Concurrent Scan Tracking Verification Queries
-- Run these to verify the fix is working correctly

-- ============================================
-- 1. Check actual running scans (SOURCE OF TRUTH)
-- ============================================
SELECT 
  COUNT(*) as actual_concurrent_scans,
  STRING_AGG(status::text, ', ') as statuses
FROM scans
WHERE workspace_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
  AND status IN ('pending', 'running', 'normalizing', 'ai_enriching');

-- ============================================
-- 2. List all active scans with details
-- ============================================
SELECT 
  id,
  status,
  scan_type,
  created_at,
  started_at,
  completed_at,
  NOW() - created_at as age,
  progress_percentage,
  progress_stage
FROM scans
WHERE workspace_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
  AND status IN ('pending', 'running', 'normalizing', 'ai_enriching')
ORDER BY created_at DESC;

-- ============================================
-- 3. Check usage tracking (monthly only now)
-- ============================================
SELECT 
  user_id,
  period_year,
  period_month,
  scans_used,
  scans_limit,
  concurrent_scans,  -- This should no longer be used for limiting
  concurrent_scans_limit
FROM usage_tracking
WHERE user_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
  AND period_year = EXTRACT(YEAR FROM NOW())
  AND period_month = EXTRACT(MONTH FROM NOW());

-- ============================================
-- 4. Find potentially stuck scans
-- ============================================
SELECT 
  id,
  status,
  created_at,
  started_at,
  completed_at,
  NOW() - created_at as age,
  error_message
FROM scans
WHERE status IN ('pending', 'running', 'normalizing')
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- 5. Scan completion audit trail
-- ============================================
SELECT 
  resource_id as scan_id,
  action,
  created_at
FROM usage_history
WHERE resource_type = 'scan'
  AND user_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- 6. Compare concurrent_scans counter vs actual
-- ============================================
WITH actual_scans AS (
  SELECT COUNT(*) as count
  FROM scans
  WHERE workspace_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
    AND status IN ('pending', 'running', 'normalizing', 'ai_enriching')
),
tracked_scans AS (
  SELECT concurrent_scans as count
  FROM usage_tracking
  WHERE user_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
    AND period_year = EXTRACT(YEAR FROM NOW())
    AND period_month = EXTRACT(MONTH FROM NOW())
)
SELECT 
  actual_scans.count as actual_concurrent,
  COALESCE(tracked_scans.count, 0) as tracked_concurrent,
  COALESCE(tracked_scans.count, 0) - actual_scans.count as difference,
  CASE 
    WHEN COALESCE(tracked_scans.count, 0) > actual_scans.count 
    THEN '⚠️ Counter is higher than actual (was causing issue)'
    WHEN COALESCE(tracked_scans.count, 0) < actual_scans.count 
    THEN '⚠️ Counter is lower than actual'
    ELSE '✅ Counter matches actual'
  END as status
FROM actual_scans, tracked_scans;

-- ============================================
-- 7. OPTIONAL: Reset stuck concurrent_scans counters
-- ============================================
-- Uncomment and run if you want to clean up the unused counter
-- UPDATE usage_tracking
-- SET concurrent_scans = 0
-- WHERE concurrent_scans > 0;

-- ============================================
-- 8. Check scan limits by plan
-- ============================================
SELECT 
  p.plan,
  COUNT(s.id) as active_scans,
  CASE p.plan
    WHEN 'Free' THEN 5
    WHEN 'Dev' THEN 3
    WHEN 'Team' THEN 20
    WHEN 'Enterprise' THEN 50
    ELSE 1
  END as concurrent_limit,
  CASE 
    WHEN COUNT(s.id) >= CASE p.plan
      WHEN 'Free' THEN 5
      WHEN 'Dev' THEN 3
      WHEN 'Team' THEN 20
      WHEN 'Enterprise' THEN 50
      ELSE 1
    END THEN '🔴 At limit'
    ELSE '✅ Under limit'
  END as status
FROM profiles p
LEFT JOIN scans s ON s.workspace_id = p.id 
  AND s.status IN ('pending', 'running', 'normalizing', 'ai_enriching')
WHERE p.id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
GROUP BY p.plan;

-- ============================================
-- 9. Recent scan activity summary
-- ============================================
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as scans_started,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status IN ('pending', 'running', 'normalizing')) as active
FROM scans
WHERE workspace_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- ============================================
-- 10. Verify fix is working
-- ============================================
-- This query checks if the fix is working correctly
WITH current_scans AS (
  SELECT COUNT(*) as count
  FROM scans
  WHERE workspace_id = 'YOUR_WORKSPACE_ID'  -- Replace with actual workspace ID
    AND status IN ('pending', 'running', 'normalizing', 'ai_enriching')
)
SELECT 
  count as actual_concurrent_scans,
  CASE 
    WHEN count = 0 THEN '✅ No scans running - new scans should start immediately'
    WHEN count < 3 THEN '✅ Under limit - new scans should start'
    WHEN count >= 3 THEN '⚠️ At/over limit - new scans will queue (expected)'
  END as status
FROM current_scans;
