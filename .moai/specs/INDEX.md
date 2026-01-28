# ZyFlow Improvement Specifications Index

> Generated: 2026-01-27
> Status: Active Planning Phase

## Overview

This document indexes all improvement specifications identified through codebase analysis.

## Execution Priority

| Priority | SPEC ID | Title | Status | Est. Hours |
|----------|---------|-------|--------|------------|
| 🔴 Critical | SPEC-MIGR-001 | OpenSpec to MoAI SPEC Migration | Draft | 30-40h |
| 🔴 Critical | SPEC-SEC-001 | Security Vulnerability Resolution | Draft | 2-3h |
| 🔴 Critical | SPEC-TEST-001 | Failed Test Resolution | Completed (Partial) | 5-7h |
| 🟠 High | SPEC-ARCH-001 | Server Architecture Modularization | Draft | 15-20h |
| 🟡 Medium | SPEC-QUAL-001 | Code Quality Improvement | Draft | 8-11h |
| 🟡 Medium | SPEC-COV-001 | Test Coverage Expansion | Draft | 26-35h |

**Total Estimated Effort: 86-116 hours**

---

## Dependency Graph

```
SPEC-MIGR-001 (Migration) ◄── Independent, can run in parallel
    │
    │  SPEC-SEC-001 (Security)
    │      │
    │      ▼
    │  SPEC-TEST-001 (Tests)
    │      │
    │      ├──────────────────┐
    │      ▼                  ▼
    │  SPEC-ARCH-001      SPEC-QUAL-001
    │  (Architecture)     (Quality)
    │      │                  │
    │      └────────┬─────────┘
    │               ▼
    │        SPEC-COV-001
    │        (Coverage)
    │               │
    └───────────────┘
         (both complete before production)
```

---

## SPEC Details

### 🔴 SPEC-MIGR-001: OpenSpec to MoAI SPEC Migration
- **File**: [SPEC-MIGR-001/spec.md](SPEC-MIGR-001/spec.md)
- **Priority**: Critical
- **Issue**: Replace OpenSpec system with MoAI-ADK SPEC system (51 files, 406 references)
- **Dependencies**: None (independent track)
- **TAGs**: 15 implementation units with dependency chain
- **Approach**: DDD vertical-slice migration with coexistence period

### 🔴 SPEC-SEC-001: Security Vulnerability Resolution
- **File**: [active/SPEC-SEC-001.md](active/SPEC-SEC-001.md)
- **Priority**: Critical
- **Issue**: 2 npm security vulnerabilities
- **Dependencies**: None

### 🔴 SPEC-TEST-001: Failed Test Resolution
- **File**: [active/SPEC-TEST-001.md](active/SPEC-TEST-001.md)
- **Priority**: Critical
- **Issue**: 41 failing tests (8.2% failure rate)
- **Dependencies**: SPEC-SEC-001

### 🟠 SPEC-ARCH-001: Server Architecture Modularization
- **File**: [active/SPEC-ARCH-001.md](active/SPEC-ARCH-001.md)
- **Priority**: High
- **Issue**: Monolithic app.ts (3,599 lines)
- **Dependencies**: SPEC-TEST-001

### 🟡 SPEC-QUAL-001: Code Quality Improvement
- **File**: [active/SPEC-QUAL-001.md](active/SPEC-QUAL-001.md)
- **Priority**: Medium
- **Issue**: 123 ESLint warnings, inconsistent patterns
- **Dependencies**: SPEC-TEST-001

### 🟡 SPEC-COV-001: Test Coverage Expansion
- **File**: [active/SPEC-COV-001.md](active/SPEC-COV-001.md)
- **Priority**: Medium
- **Issue**: ~13% test coverage (target: 80%)
- **Dependencies**: SPEC-TEST-001, SPEC-ARCH-001

---

## Recommended Execution Order

### Week 1: Stabilization
1. ✅ Execute SPEC-SEC-001 (Security fixes)
2. ✅ Execute SPEC-TEST-001 (Test fixes)

### Week 2-3: Architecture
3. ✅ Execute SPEC-ARCH-001 (Modularization)
4. ✅ Execute SPEC-QUAL-001 (Quality improvements)

### Week 4-5: Coverage
5. ✅ Execute SPEC-COV-001 (Test coverage)

---

## Metrics Targets

| Metric | Current | Target | SPEC |
|--------|---------|--------|------|
| Security Vulnerabilities | 2 | 0 | SEC-001 |
| Failed Tests | 41 | 0 | TEST-001 |
| app.ts Lines | 3,599 | <300 | ARCH-001 |
| ESLint Warnings | 123 | <20 | QUAL-001 |
| Test Coverage | 13% | 80% | COV-001 |

---

## Quick Commands

```bash
# Start with security fixes
/moai:2-run SPEC-SEC-001

# Then fix failing tests
/moai:2-run SPEC-TEST-001

# Continue with architecture
/moai:2-run SPEC-ARCH-001
```

---

## Notes

- All SPECs follow EARS (Easy Approach to Requirements Syntax) format
- Each SPEC includes acceptance criteria for verification
- Dependencies must be completed before starting dependent SPECs
- Estimated hours are for a single developer
