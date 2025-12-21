# scripts/verify-scanners-windows.ps1

Write-Host "🔍 Verifying Scanner Installations on Windows..." -ForegroundColor Cyan
Write-Host ""

$scanners = @(
    @{Name="Semgrep"; Command="semgrep"; TestArg="--version"},
    @{Name="OSV Scanner"; Command="osv-scanner"; TestArg="--version"},
    @{Name="Gitleaks"; Command="gitleaks"; TestArg="version"},
    @{Name="Checkov"; Command="checkov"; TestArg="--version"},
    @{Name="Trivy"; Command="trivy"; TestArg="--version"}
)

$installed = 0
$missing = 0

foreach ($scanner in $scanners) {
    Write-Host "Checking $($scanner.Name)..." -NoNewline
    
    try {
        $null = & $scanner.Command $scanner.TestArg 2>&1
        Write-Host " ✅ INSTALLED" -ForegroundColor Green
        $installed++
    }
    catch {
        Write-Host " ❌ NOT FOUND" -ForegroundColor Red
        $missing++
        
        # Provide installation instructions
        Write-Host "  Install with: " -ForegroundColor Yellow -NoNewline
        
        switch ($scanner.Name) {
            "Semgrep" {
                Write-Host "pip install semgrep" -ForegroundColor White
            }
            "OSV Scanner" {
                Write-Host "Download from: https://github.com/google/osv-scanner/releases" -ForegroundColor White
            }
            "Gitleaks" {
                Write-Host "choco install gitleaks OR download from: https://github.com/gitleaks/gitleaks/releases" -ForegroundColor White
            }
            "Checkov" {
                Write-Host "pip install checkov" -ForegroundColor White
            }
            "Trivy" {
                Write-Host "choco install trivy OR download from: https://github.com/aquasecurity/trivy/releases" -ForegroundColor White
            }
        }
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Summary: $installed/5 scanners installed" -ForegroundColor Cyan

if ($missing -eq 0) {
    Write-Host "✅ All scanners ready!" -ForegroundColor Green
} else {
    Write-Host "⚠️  $missing scanners missing. Install them to enable full scanning." -ForegroundColor Yellow
}