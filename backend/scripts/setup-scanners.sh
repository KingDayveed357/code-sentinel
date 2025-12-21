#!/bin/bash
# ===================================================================
# scripts/setup-scanners.sh
# Install all security scanners for CodeSentinel
# ===================================================================

# set -e
# Add pipx binaries to PATH (for non-interactive scripts)
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"



echo "🔧 Setting up CodeSentinel security scanners..."
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

# ===================================================================
# 1. Semgrep (SAST)
# ===================================================================
echo "📦 Installing Semgrep..."

if command -v semgrep &> /dev/null; then
    echo "✅ Semgrep already installed ($(semgrep --version))"
else
    # Prefer pipx for Python CLI tools
    if command -v pipx &> /dev/null; then
        pipx install semgrep
        echo "✅ Semgrep installed via pipx"
    elif command -v snap &> /dev/null; then
        sudo snap install semgrep
        echo "✅ Semgrep installed via snap"
    else
        echo "❌ pipx not found and snap not available."
        echo "   Install pipx: sudo apt install pipx -y && pipx ensurepath"
        exit 1
    fi
fi

# ===================================================================
# 2. Gitleaks (Secrets)
# ===================================================================
echo ""
echo "🔑 Installing Gitleaks..."

if command -v gitleaks &> /dev/null; then
    echo "✅ Gitleaks already installed ($(gitleaks version))"
else
    case "$OS" in
        Linux*)
            GITLEAKS_VERSION="8.18.0"
            wget "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
            tar -xzf "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
            sudo mv gitleaks /usr/local/bin/
            rm "gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
            echo "✅ Gitleaks installed"
            ;;
        Darwin*)
            if command -v brew &> /dev/null; then
                brew install gitleaks
                echo "✅ Gitleaks installed via Homebrew"
            else
                echo "❌ Homebrew not found. Install from: https://brew.sh/"
                exit 1
            fi
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            exit 1
            ;;
    esac
fi

# ===================================================================
# 3. OSV Scanner (SCA)
# ===================================================================
echo ""
echo "📚 Installing OSV Scanner..."

if command -v osv-scanner &> /dev/null; then
    echo "✅ OSV Scanner already installed ($(osv-scanner --version))"
else
    case "$OS" in
        Linux*)
            OSV_VERSION="1.4.3"
            wget "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_${OSV_VERSION}_linux_amd64"
            chmod +x "osv-scanner_${OSV_VERSION}_linux_amd64"
            sudo mv "osv-scanner_${OSV_VERSION}_linux_amd64" /usr/local/bin/osv-scanner
            echo "✅ OSV Scanner installed"
            ;;
        Darwin*)
            if command -v brew &> /dev/null; then
                brew install osv-scanner
                echo "✅ OSV Scanner installed via Homebrew"
            else
                echo "❌ Homebrew not found"
                exit 1
            fi
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            exit 1
            ;;
    esac
fi

# ===================================================================
# 4. Checkov (IaC)
# ===================================================================
echo ""
echo "🏗️  Installing Checkov..."

if command -v checkov &> /dev/null; then
    echo "✅ Checkov already installed ($(checkov --version))"
else
    if command -v pipx &> /dev/null; then
        pipx install checkov
        echo "✅ Checkov installed via pipx"
    else
        echo "❌ pipx not found. Install pipx with:"
        echo "   sudo apt install pipx -y && pipx ensurepath"
        exit 1
    fi
fi

# ===================================================================
# 5. Trivy (Container)
# ===================================================================
echo ""
echo "🐳 Installing Trivy..."

if command -v trivy &> /dev/null; then
    echo "✅ Trivy already installed ($(trivy --version))"
else
    case "$OS" in
        Linux*)
            TRIVY_VERSION="0.47.0"
            wget "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
            tar -xzf "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
            sudo mv trivy /usr/local/bin/
            rm "trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
            echo "✅ Trivy installed"
            ;;
        Darwin*)
            if command -v brew &> /dev/null; then
                brew install trivy
                echo "✅ Trivy installed via Homebrew"
            else
                echo "❌ Homebrew not found"
                exit 1
            fi
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            exit 1
            ;;
    esac
fi

# ===================================================================
# Verification
# ===================================================================
echo ""
echo "🔍 Verifying installations..."
echo ""

SCANNERS=(
    "semgrep:SAST"
    "gitleaks:Secrets"
    "osv-scanner:SCA"
    "checkov:IaC"
    "trivy:Container"
)

INSTALLED=0
FAILED=0

for scanner_info in "${SCANNERS[@]}"; do
    IFS=':' read -r cmd type <<< "$scanner_info"

    if command -v "$cmd" &> /dev/null; then
        echo "✅ $type: $cmd"
        ((INSTALLED++))
    else
        echo "❌ $type: $cmd (NOT FOUND)"
        ((FAILED++))
        # Do NOT exit, just continue to check all scanners
    fi
done


echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary: $INSTALLED/5 scanners installed successfully"

if [ $FAILED -eq 0 ]; then
    echo "✅ All scanners ready!"
    echo ""
    echo "🚀 Next steps:"
    echo "   1. Configure environment: cp .env.example .env"
    echo "   2. Start Redis: docker run -d -p 6379:6379 redis:7-alpine"
    echo "   3. Run dev server: npm run dev"
else
    echo "⚠️  $FAILED scanners failed to install"
    echo "Please check the errors above and install manually if needed."
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"