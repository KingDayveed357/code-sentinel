#!/bin/bash

echo "🔍 Verifying scanner installations on Linux..."
echo ""

declare -A scanners=(
    ["Semgrep"]="semgrep --version"
    ["OSV Scanner"]="osv-scanner --version"
    ["Gitleaks"]="gitleaks version"
    ["Checkov"]="checkov --version"
    ["Trivy"]="trivy --version"
)

installed=0
missing=0

for name in "${!scanners[@]}"; do
    echo -n "Checking $name... "
    if eval "${scanners[$name]}" >/dev/null 2>&1; then
        echo "✅ INSTALLED"
        installed=$((installed+1))
    else
        echo "❌ NOT FOUND"
        missing=$((missing+1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary: $installed/5 scanners installed"

if [ "$missing" -eq 0 ]; then
    echo "✅ All scanners ready!"
else
    echo "⚠️  $missing scanners missing."
fi
