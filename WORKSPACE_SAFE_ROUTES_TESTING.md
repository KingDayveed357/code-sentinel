# Workspace-Safe Routes Refactor - Testing Guide

## Quick Test Scenarios

### Scenario 1: Settings Page Workspace Switch
**Route**: `/dashboard/settings`

**Steps**:
1. Navigate to Settings page
2. Click workspace switcher dropdown
3. Switch to a different workspace
4. Observe page content

**Expected Results**:
- ✅ No flicker or content jump
- ✅ Toast shows "Switched to [workspace name]"
- ✅ All integrations refresh automatically
- ✅ Previous workspace data is not visible
- ✅ Delete account dialog is reset

**How to verify**:
- Look at browser console: should see `🔄 Workspace changed detected:` logs
- Check React Query DevTools: old workspace queries should be removed
- Settings content should match selected workspace

---

### Scenario 2: Billing Page Workspace Switch
**Route**: `/dashboard/billing`

**Steps**:
1. Navigate to Billing page with loaded entitlements
2. Switch to a different workspace via dropdown
3. Observe page updates

**Expected Results**:
- ✅ Skeleton loader shows briefly
- ✅ Billing data updates to new workspace
- ✅ Current plan reflects new workspace
- ✅ Usage statistics refresh
- ✅ No old workspace data visible

**How to verify**:
- Entitlements should match selected workspace's plan
- Current usage card shows new workspace data
- Plan comparison cards update if plans differ

---

### Scenario 3: Integrations Page Workspace Switch
**Route**: `/dashboard/integrations`

**Steps**:
1. Navigate to Integrations page
2. With a workspace selected, switch to another
3. Observe integration status updates

**Expected Results**:
- ✅ Skeleton appears during transition
- ✅ Integration list refreshes for new workspace
- ✅ Connected integrations show correct status
- ✅ GitHub connection status is workspace-specific
- ✅ All integration categories load properly

**How to verify**:
- GitHub integration status changes based on workspace
- Integration counts match workspace's connections
- Connected badges show correct state for new workspace

---

### Scenario 4: Dashboard Overview Workspace Switch
**Route**: `/dashboard`

**Steps**:
1. View dashboard with project data
2. Switch workspaces via dropdown
3. Observe dashboard content updates

**Expected Results**:
- ✅ Stats cards show new workspace data
- ✅ Skeleton appears during loading
- ✅ Critical vulnerabilities list refreshes
- ✅ Recent scans show new workspace scans
- ✅ Security score updates to new workspace
- ✅ Import banner shows per-workspace state

**How to verify**:
- Project count matches new workspace
- Vulnerability stats are from new workspace
- Recent scans belong to new workspace projects

---

### Scenario 5: Toast Notifications
**All Pages**

**Steps**:
1. Trigger an error on Settings page (e.g., disconnect integration)
2. Trigger success on Billing page (e.g., refresh entitlements)
3. Trigger error on Integrations page (e.g., failed load)

**Expected Results**:
- ✅ Toast appears with title + description
- ✅ Error toasts have red variant
- ✅ Success toasts have default variant
- ✅ All toasts appear in top-right
- ✅ Toasts auto-dismiss after 3-5 seconds
- ✅ Close button works

**How to verify**:
- Toasts use consistent styling
- All messages are clear and actionable
- No raw error codes visible

---

### Scenario 6: Memory Cleanup
**Browser DevTools**

**Steps**:
1. Open React Query DevTools
2. Switch workspaces multiple times
3. Check cache contents

**Expected Results**:
- ✅ Old workspace queries are removed
- ✅ Cache only contains current workspace queries
- ✅ No memory leak from switched workspaces
- ✅ Query keys show workspace ID: `['workspace', 'abc123', ...]`

**How to verify**:
In React Query DevTools:
- Click "Mutations" tab
- Observe cache only has current workspace data
- Switch workspace and confirm old data is removed

---

### Scenario 7: Concurrent Switch Prevention
**Performance Test**

**Steps**:
1. Rapidly click workspace switcher 5+ times
2. Observe behavior

**Expected Results**:
- ✅ Only one switch completes
- ✅ No conflicting requests
- ✅ UI settles to final workspace
- ✅ No error toasts from conflicts

**How to verify**:
- Console shows "⏸️ Switch already in progress, ignoring" logs
- Final workspace is correct
- No duplicate requests in Network tab

---

### Scenario 8: Error Recovery
**Error Handling**

**Steps**:
1. Go to Settings page
2. Simulate network error (DevTools > Network > Offline)
3. Try to load integrations
4. Click Retry button

**Expected Results**:
- ✅ Error message appears
- ✅ Retry button is available
- ✅ Retry attempts to reload
- ✅ Success when network restored

**How to verify**:
- Error toast shows with actionable message
- Retry button exists and works
- No console errors beyond network errors

---

## Component-Specific Tests

### Settings Page (`/dashboard/settings`)

**Account Tab**:
- [ ] Resync GitHub button works
- [ ] Toast shows success/error
- [ ] Delete account dialog validates username
- [ ] Delete account shows confirmation

**Preferences Tab**:
- [ ] Theme toggle works
- [ ] Preferences save correctly

**Security Tab**:
- [ ] Disconnect integration shows confirmation
- [ ] Successfully disconnects
- [ ] Toast confirms result
- [ ] Integrations list refreshes

**Workspace Switching in Settings**:
- [ ] Integrations list loads for new workspace
- [ ] No integrations from old workspace shown
- [ ] Delete account dialog doesn't carry state

---

### Billing Page (`/dashboard/billing`)

**Current Usage Card**:
- [ ] Shows correct plan for workspace
- [ ] Usage percentages calculate correctly
- [ ] Limits display as numbers or "Unlimited"
- [ ] Refresh button updates data

**Team Workspace Message**:
- [ ] Appears when in team workspace
- [ ] Explains billing is team owner's responsibility
- [ ] Doesn't appear in personal workspace

**Plans Grid**:
- [ ] All 4 plans display
- [ ] Current plan shows "Current Plan" button
- [ ] Other plans show "Upgrade Now"
- [ ] Buttons are disabled/enabled correctly

**Workspace Switching in Billing**:
- [ ] Skeleton appears during transition
- [ ] Plan info updates to new workspace
- [ ] Usage data refreshes
- [ ] No stale data from old workspace

---

### Integrations Page (`/dashboard/integrations`)

**Category Display**:
- [ ] All 4 categories show
- [ ] Each category has description
- [ ] Cards are properly styled

**Integration Cards**:
- [ ] GitHub shows as available
- [ ] GitLab, Bitbucket show as coming soon
- [ ] Connected status matches workspace
- [ ] Hover effects work

**Workspace Switching in Integrations**:
- [ ] Skeleton appears briefly
- [ ] Integration status updates
- [ ] GitHub connection is workspace-specific
- [ ] Connected badges reflect new workspace

---

### Dashboard (`/dashboard`)

**Stats Cards**:
- [ ] Repository count is workspace-specific
- [ ] Scan count shows correct number
- [ ] Vulnerability count updates
- [ ] Changes show correct direction (↑ or ↓)

**Critical Vulnerabilities**:
- [ ] Shows top 5 from current workspace
- [ ] Links navigate to correct vulnerabilities
- [ ] Severity badges are correct

**Recent Scans**:
- [ ] Shows recent scans from new workspace
- [ ] Status badges are correct
- [ ] Duration times display properly

**Security Score**:
- [ ] Shows workspace-specific score
- [ ] Score updates on refresh
- [ ] Chart displays correctly

**Import Banner**:
- [ ] Appears only in correct workspaces
- [ ] Per-workspace dismissal works
- [ ] Doesn't reappear after dismiss
- [ ] Different state in different workspaces

**Workspace Switching**:
- [ ] Skeleton appears during load
- [ ] All cards update together
- [ ] No partial updates
- [ ] No flicker

---

## Edge Cases

### Edge Case 1: Workspace with No Data
**Steps**:
1. Switch to empty workspace
2. Check each dashboard page

**Expected**:
- ✅ Settings shows "No integrations"
- ✅ Billing shows $0 usage
- ✅ Integrations shows disconnected
- ✅ Dashboard shows empty states

---

### Edge Case 2: Network Failure During Switch
**Steps**:
1. Simulate network error
2. Try to switch workspace
3. Restore network

**Expected**:
- ✅ Error toast appears
- ✅ Workspace doesn't change
- ✅ Can retry
- ✅ Switch succeeds on retry

---

### Edge Case 3: Rapid Workspace Switches
**Steps**:
1. Click workspace switcher 10 times rapidly
2. Let settle

**Expected**:
- ✅ Only switches to last selected
- ✅ No race conditions
- ✅ Single toast notification
- ✅ Correct final state

---

### Edge Case 4: Window Close During Switch
**Steps**:
1. Start workspace switch
2. Close tab immediately

**Expected**:
- ✅ No errors in console
- ✅ Tab closes cleanly
- ✅ No orphaned requests

---

### Edge Case 5: Different Plan Levels
**Steps**:
1. Switch from Free → Dev workspace
2. Check Billing page

**Expected**:
- ✅ Plan displays correctly
- ✅ Limits update
- ✅ Features list changes

---

## Performance Tests

### Load Time Measurements
- [ ] Dashboard loads in < 1s
- [ ] Settings page loads in < 800ms
- [ ] Billing page loads in < 800ms
- [ ] Integrations page loads in < 800ms

### Workspace Switch Time
- [ ] Settings page switch < 500ms
- [ ] Billing page switch < 500ms
- [ ] Integrations switch < 500ms
- [ ] Dashboard switch < 1s

### Memory Usage
- [ ] No memory leak after 5+ switches
- [ ] Cache size stays < 5MB
- [ ] Old workspace data cleaned up

---

## Accessibility Tests

- [ ] Skeleton loading states are announced
- [ ] Toast notifications are announced to screen readers
- [ ] Workspace switcher is keyboard accessible
- [ ] Error messages are clear and specific
- [ ] All buttons have labels
- [ ] Tab order is logical

---

## Browser Compatibility

Test on:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Expected:
- ✅ All features work
- ✅ Skeletons animate smoothly
- ✅ Toasts appear correctly
- ✅ No console errors

---

## Regression Prevention

**Test Existing Features**:
- [ ] Create project still works
- [ ] Run scan still works
- [ ] GitHub integration still works
- [ ] Team creation still works
- [ ] Profile settings still work
- [ ] Logout still works

---

## Sign-Off Checklist

- [ ] All scenarios pass
- [ ] No console errors
- [ ] All edge cases handled
- [ ] Performance meets targets
- [ ] Accessibility verified
- [ ] Browser compatibility confirmed
- [ ] No regressions found
- [ ] Toast notifications consistent
- [ ] Skeleton loaders smooth
- [ ] Workspace switching fast

---

## Known Limitations

1. **Workspace switching toast ID**: Currently using simple success/error toasts instead of loading toasts with ID updates (sonner limitation with hook pattern)
   - Workaround: Toasts appear instantly with clear messaging

2. **Concurrent workspace access**: If user accesses workspace from two tabs, they may show different data
   - Mitigation: Encourage users to use single active tab

3. **Slow network**: Very slow networks may show skeleton for 5+ seconds
   - Mitigation: Add timeout and fallback UI

---

## Debugging Guide

### Check if workspace listener is active:
```
// In console, you should see on workspace switch:
🔄 Workspace changed detected: {from: "old-id", to: "new-id"}
🛑 Cancelling in-flight requests
🗑️ Removing cached data
♻️ Invalidating queries
```

### Verify React Query cache:
```
// Open React Query DevTools
// All query keys should have format:
['workspace', 'workspace-id', 'feature']
```

### Check toast is using hook:
```
// Settings page should have:
const { toast } = useToast()
// Not:
import { toast } from 'sonner'
```

---
