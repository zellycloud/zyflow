# Security Policy

## Overview

이 문서는 zyflow 프로젝트의 보안 정책과 기여자를 위한 보안 가이드라인을 제공합니다.

This document provides security policies and guidelines for contributors to the zyflow project.

---

## Reporting Security Vulnerabilities

보안 취약점을 발견하셨다면:

1. **공개 이슈로 보고하지 마세요** - 취약점 정보가 악용될 수 있습니다
2. 이메일로 비공개 보고해 주세요: [보안 담당자 이메일]
3. 48시간 이내에 응답을 받으실 수 있습니다

If you discover a security vulnerability:
1. **Do NOT report it as a public issue**
2. Email us privately at: [security contact email]
3. You will receive a response within 48 hours

---

## For Contributors: Files You Should NEVER Commit

### Critical - Never Commit These Files

| Category | Files/Patterns | Risk |
|----------|---------------|------|
| **Environment Files** | `.env`, `.env.local`, `.env.production` | API keys, database credentials |
| **API Keys** | `*-api-key.*`, `*_api_key*`, `*.apikey` | Service access compromise |
| **Private Keys** | `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*` | Authentication bypass |
| **Cloud Credentials** | `.aws/`, `.gcloud/`, `service-account*.json` | Cloud infrastructure access |
| **Database Files** | `*.db`, `*.sqlite`, `*.sqlite3` | User data exposure |
| **OAuth Tokens** | `oauth-*.json`, `tokens.json` | Account access |
| **Session Data** | `.zyflow/`, `memory/`, `.swarm/` | User activity exposure |

### Files That ARE Safe to Commit

These files are intentionally tracked and contain NO secrets:

| File | Purpose | Why Safe |
|------|---------|----------|
| `.claude/settings.json` | Hook configurations, permissions | Contains no API keys |
| `.mcp.json` | MCP server configurations | Uses placeholders |
| `.moai/config/*.yaml` | Framework configuration templates | No actual credentials |
| `.env.example` | Environment template | Placeholder values only |
| `.env.production.template` | Production template | No actual values |

---

## Pre-Commit Security Checks

### Required Setup

프로젝트에 기여하기 전에 pre-commit 훅을 설치하세요:

```bash
# Install pre-commit
pip install pre-commit

# Install gitleaks (macOS)
brew install gitleaks

# Install gitleaks (Linux)
# Download from https://github.com/gitleaks/gitleaks/releases

# Setup hooks
pre-commit install
```

### What Gets Scanned

Pre-commit 훅이 자동으로 검사하는 항목:

- **Gitleaks**: API keys, passwords, tokens in code
- **Private Key Detection**: RSA, EC, ED25519 keys
- **Large Files**: Files over 1MB
- **Merge Conflicts**: Unresolved conflict markers

### Bypassing Checks (Emergency Only)

긴급 상황에서만 사용하세요:

```bash
# Skip all hooks (NOT RECOMMENDED)
git commit --no-verify -m "message"

# Better: Fix the issue or add to .gitleaks.toml allowlist
```

---

## Security Best Practices for Contributors

### 1. Environment Variables

```bash
# WRONG - Never hardcode secrets
API_KEY = "sk-abc123..."

# CORRECT - Use environment variables
API_KEY = os.environ.get("API_KEY")
```

### 2. Configuration Files

```yaml
# WRONG - Secrets in config files
api_key: "sk-abc123..."

# CORRECT - Reference environment variables
api_key: "${API_KEY}"  # Resolved at runtime
```

### 3. Documentation Examples

```python
# WRONG - Real-looking keys in docs
api_key = "sk-proj-abc123xyz789"

# CORRECT - Obvious placeholder
api_key = "your_api_key_here"
api_key = "sk-xxx..."
```

### 4. Test Files

```python
# WRONG - Real credentials in tests
def test_api():
    client = Client(api_key="real-key-here")

# CORRECT - Mock or fixture
def test_api():
    client = Client(api_key="test-key")
    # Or use pytest fixtures with mocking
```

---

## Git History and Secret Rotation

### If You Accidentally Committed a Secret

1. **즉시 해당 시크릿을 로테이션하세요** (가장 중요!)
2. Git 히스토리에서 제거하세요:

```bash
# Using git-filter-repo (recommended)
pip install git-filter-repo
git filter-repo --invert-paths --path path/to/secret/file

# Or using BFG Repo Cleaner
bfg --delete-files .env
git push --force
```

3. GitHub에서 시크릿 스캔 알림 확인

### Preventing Future Incidents

- Pre-commit 훅이 항상 활성화되어 있는지 확인
- `.gitignore` 패턴이 최신인지 확인
- 정기적인 `git diff --staged` 검토 습관화

---

## GitHub Repository Settings

### Recommended Security Settings

레포지토리 관리자는 다음 설정을 활성화하세요:

1. **Settings > Code security and analysis**
   - ✅ Secret scanning
   - ✅ Secret scanning push protection
   - ✅ Dependabot alerts
   - ✅ Dependabot security updates

2. **Settings > Branches > Branch protection rules**
   - ✅ Require status checks (including security scan)
   - ✅ Require signed commits (optional but recommended)

---

## Supported Versions

| Version | Security Support |
|---------|-----------------|
| 1.x.x   | ✅ Active support |
| < 1.0   | ❌ No support |

---

## Security Scanning Tools Used

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Gitleaks** | Secret detection in commits | `.gitleaks.toml` |
| **GitHub Secret Scanning** | Repository-wide scanning | Repository settings |
| **Dependabot** | Dependency vulnerabilities | `.github/dependabot.yml` |
| **Pre-commit hooks** | Local development checks | `.pre-commit-config.yaml` |

---

## Questions?

보안 관련 질문이 있으시면:

- 📧 비공개 문의: [보안 담당자 이메일]
- 💬 일반 문의: GitHub Discussions

---

*Last updated: 2026-02-01*
