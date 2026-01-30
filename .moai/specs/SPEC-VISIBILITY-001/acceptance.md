# Acceptance Criteria: SPEC-VISIBILITY-001

**SPEC ID**: SPEC-VISIBILITY-001
**Title**: SPEC Visibility & Unified Management System
**Version**: 1.0.0

---

## Overview

This document defines acceptance criteria for SPEC-VISIBILITY-001 using Given/When/Then (Gherkin) format. All scenarios must pass for the SPEC to be considered complete.

**Coverage Requirements**:
- Minimum 2 scenarios per phase (8 total required)
- Edge cases for error handling
- Performance criteria validation
- Data integrity verification

---

## Phase 1: Status Synchronization Fix

### Scenario 1.1: Read Status from Frontmatter

```gherkin
Feature: Status Synchronization from Frontmatter
  As a developer
  I want SPEC status to be read from frontmatter
  So that database reflects accurate SPEC status

Scenario: Sync status for completed SPEC
  Given a SPEC file at .moai/specs/SPEC-TEST-001/spec.md
  And the frontmatter contains:
    """
    ---
    spec_id: SPEC-TEST-001
    title: Test SPEC
    status: completed
    priority: high
    ---
    """
  When scanMoaiSpecs function is executed
  Then the database tasks table SHALL have a record with spec_id = 'SPEC-TEST-001'
  And the status field SHALL equal 'completed'
  And the status SHALL NOT be hardcoded to 'active'
```

**Success Criteria**:
- ✅ Database record created with correct status
- ✅ No hardcoded 'active' status
- ✅ Status matches frontmatter exactly

---

### Scenario 1.2: Handle Missing Status Field

```gherkin
Scenario: Default to planned when status is missing
  Given a SPEC file at .moai/specs/SPEC-TEST-002/spec.md
  And the frontmatter contains:
    """
    ---
    spec_id: SPEC-TEST-002
    title: Test SPEC Without Status
    priority: medium
    ---
    """
  When scanMoaiSpecs function is executed
  Then the database record SHALL default to status = 'planned'
  And a warning SHALL be logged containing:
    - SPEC ID: SPEC-TEST-002
    - Message: "Missing status field, defaulting to planned"
  And the warning SHALL appear in structured logs
```

**Success Criteria**:
- ✅ Default status applied correctly
- ✅ Warning logged with context
- ✅ SPEC processing continues without error

---

### Scenario 1.3: Normalize Invalid Status

```gherkin
Scenario: Normalize status with case variations
  Given a SPEC file with frontmatter status: "In Progress"
  When scanMoaiSpecs function is executed
  Then the status SHALL be normalized to 'in_progress'
  And the database record SHALL store status = 'in_progress'
  And the normalization SHALL handle:
    | Input         | Normalized    |
    | "In Progress" | in_progress   |
    | "COMPLETED"   | completed     |
    | "Planned"     | planned       |
    | "  blocked  " | blocked       |
```

**Success Criteria**:
- ✅ Case insensitive normalization
- ✅ Whitespace trimmed
- ✅ Spaces converted to underscores

---

### Scenario 1.4: Handle Concurrent Status Updates

```gherkin
Scenario: Synchronize status changes during concurrent scans
  Given SPEC-TEST-003 with status: 'active'
  And a concurrent process updates frontmatter to status: 'completed'
  When scanMoaiSpecs runs during the update
  Then the system SHALL handle the race condition safely
  And the final database status SHALL match the latest frontmatter value
  And no database lock errors SHALL occur
```

**Success Criteria**:
- ✅ Race condition handled gracefully
- ✅ Final status consistent with frontmatter
- ✅ No database corruption

---

## Phase 2: Unified SPEC Scanner

### Scenario 2.1: Scan Both MoAI and OpenSpec Formats

```gherkin
Feature: Unified SPEC Scanning
  As a user
  I want to see both MoAI and OpenSpec specs in one unified list
  So that I have complete visibility of all specifications

Scenario: Return unified list from both directories
  Given a project with 3 MoAI SPECs in .moai/specs/:
    | SPEC ID       | Status    | Format |
    | SPEC-AUTH-001 | active    | moai   |
    | SPEC-TEST-001 | planned   | moai   |
    | SPEC-MIGR-001 | completed | moai   |
  And 5 OpenSpec specs in openspec/specs/:
    | File              | Title         | Format    |
    | auth-login.md     | Login Feature | openspec  |
    | auth-signup.md    | Signup Flow   | openspec  |
    | payment-stripe.md | Stripe Setup  | openspec  |
    | api-users.md      | Users API     | openspec  |
    | api-posts.md      | Posts API     | openspec  |
  When GET /api/specs is called
  Then the response SHALL contain 8 total specs
  And each spec SHALL have a 'format' field with value 'moai' or 'openspec'
  And the response SHALL include both MoAI and OpenSpec specs
```

**Success Criteria**:
- ✅ All 8 specs returned
- ✅ Format field present on all specs
- ✅ Correct format assigned to each spec

---

### Scenario 2.2: Filter Specs by Format

```gherkin
Scenario: Filter unified list to show only MoAI specs
  Given a unified spec list with both MoAI and OpenSpec formats
  When GET /api/specs?format=moai is called
  Then the response SHALL contain only specs with format = 'moai'
  And OpenSpec specs SHALL be excluded from results
  And the total count SHALL equal number of MoAI specs
```

**Success Criteria**:
- ✅ Only MoAI specs returned
- ✅ Filter applied correctly
- ✅ Count accurate

---

### Scenario 2.3: Handle Duplicate SPEC IDs Across Formats

```gherkin
Scenario: Prioritize MoAI format when SPEC exists in both
  Given SPEC-AUTH-001 exists in both formats:
    - MoAI: .moai/specs/SPEC-AUTH-001/spec.md
    - OpenSpec: openspec/specs/SPEC-AUTH-001.md
  When the unified scanner executes
  Then the MoAI format SHALL be prioritized in the main result
  And the OpenSpec version SHALL be included with key 'SPEC-AUTH-001-openspec'
  And the OpenSpec version SHALL have migrationCandidate = true
  And the response SHALL include both entries for visibility
```

**Success Criteria**:
- ✅ MoAI format prioritized
- ✅ OpenSpec flagged as migration candidate
- ✅ Both visible in results

---

### Scenario 2.4: Cache Performance Optimization

```gherkin
Scenario: Improve performance with 60-second cache
  Given the unified scanner has completed an initial scan
  When GET /api/specs is called a second time within 60 seconds
  Then the system SHALL return cached results
  And filesystem scanning SHALL NOT occur
  And response time SHALL be <10ms
  And cache hit SHALL be logged for monitoring
```

**Success Criteria**:
- ✅ Cache hit on subsequent requests
- ✅ Significant performance improvement
- ✅ Cache hit logged

---

## Phase 3: OpenSpec → MoAI Migration Tool

### Scenario 3.1: Convert OpenSpec to MoAI 3-File Format

```gherkin
Feature: OpenSpec Migration
  As a developer
  I want to migrate OpenSpec specs to MoAI format
  So that all specs use the unified 3-file structure

Scenario: Migrate OpenSpec with all sections
  Given an OpenSpec file at openspec/specs/auth-login.md containing:
    """
    # Login Feature

    ## Requirements
    - User can login with email and password
    - Invalid credentials show error message

    ## Tasks
    - [ ] Create login form component
    - [ ] Implement authentication API
    - [ ] Add error handling

    ## Acceptance Criteria
    - Valid credentials redirect to dashboard
    - Invalid credentials show error
    """
  When migration tool is executed with spec_id = 'SPEC-AUTH-001'
  Then 3 files SHALL be created:
    - .moai/specs/SPEC-AUTH-001/spec.md
    - .moai/specs/SPEC-AUTH-001/plan.md
    - .moai/specs/SPEC-AUTH-001/acceptance.md
  And spec.md SHALL contain EARS-formatted requirements:
    """
    **[EARS: Event-Driven]**
    WHEN user submits login credentials, THEN the system SHALL authenticate against database.

    **[EARS: Unwanted]**
    The system SHALL NOT display credentials in error messages.
    """
  And plan.md SHALL contain TAG chain:
    """
    ### TAG-001: Create Login Form Component
    **Status**: pending

    ### TAG-002: Implement Authentication API
    **Status**: pending

    ### TAG-003: Add Error Handling
    **Status**: pending
    """
  And acceptance.md SHALL contain Gherkin scenarios:
    """
    Scenario: Successful login with valid credentials
      Given a user with email "user@example.com" and password "password123"
      When the user submits login form
      Then the user SHALL be redirected to dashboard

    Scenario: Failed login with invalid credentials
      Given invalid credentials
      When the user submits login form
      Then an error message SHALL be displayed
    """
```

**Success Criteria**:
- ✅ All 3 files created
- ✅ Valid EARS requirements generated
- ✅ TAG chains properly formatted
- ✅ Gherkin scenarios syntactically correct

---

### Scenario 3.2: Dry-Run Mode Preview

```gherkin
Scenario: Preview migration without writing files
  Given migration tool with --dry-run flag enabled
  When migration is initiated for SPEC-AUTH-001
  Then migration preview SHALL be output to console
  And the preview SHALL show:
    - Generated spec.md content
    - Generated plan.md content
    - Generated acceptance.md content
  And no files SHALL be written to filesystem
  And the preview SHALL highlight:
    - EARS patterns used
    - TAG count
    - Scenario count
```

**Success Criteria**:
- ✅ Preview generated without filesystem writes
- ✅ Complete content preview shown
- ✅ Summary statistics included

---

### Scenario 3.3: Preserve Original Files During Migration

```gherkin
Scenario: Keep OpenSpec files unless explicitly deleted
  Given an OpenSpec file at openspec/specs/auth-login.md
  When migration executes without --delete-original flag
  Then the original OpenSpec file SHALL remain at openspec/specs/auth-login.md
  And MoAI files SHALL be created in .moai/specs/SPEC-AUTH-001/
  And both file sets SHALL exist simultaneously
```

**Success Criteria**:
- ✅ Original file preserved
- ✅ MoAI files created in separate directory
- ✅ No data loss

---

### Scenario 3.4: Handle Missing Sections Gracefully

```gherkin
Scenario: Generate placeholders for incomplete OpenSpec
  Given an OpenSpec file with only Requirements section (no Tasks or Acceptance)
  When migration tool executes
  Then spec.md SHALL be generated with available requirements
  And plan.md SHALL contain placeholder:
    """
    <!-- TODO: Manual review required - no tasks found in source -->

    ### TAG-001: Review and Define Tasks
    **Status**: pending
    **Description**: Original OpenSpec lacked task definitions
    """
  And acceptance.md SHALL contain placeholder:
    """
    <!-- TODO: Manual review required - no acceptance criteria found -->

    Scenario: Define Acceptance Criteria
      Given the implementation is complete
      Then acceptance criteria SHALL be defined
    """
  And a warning SHALL be logged listing missing sections
```

**Success Criteria**:
- ✅ Migration completes without errors
- ✅ Placeholders clearly marked
- ✅ Warning logged for manual review

---

### Scenario 3.5: Batch Migration Progress Tracking

```gherkin
Scenario: Migrate 19 OpenSpec files with progress tracking
  Given 19 OpenSpec files in zellyy-money project
  When batch migration script executes
  Then the system SHALL:
    - Process each file sequentially
    - Display progress: "Processing 5/19: auth-login.md"
    - Log successful migrations
    - Log warnings for incomplete sections
    - Generate final report with:
      * Total processed: 19
      * Successful: 17
      * Warnings: 2
      * Failed: 0
  And the migration SHALL complete within 60 seconds
```

**Success Criteria**:
- ✅ All 19 files processed
- ✅ Progress displayed in real-time
- ✅ Final report comprehensive
- ✅ Performance target met

---

## Phase 4: Archive Management

### Scenario 4.1: Archive SPEC to Monthly Directory

```gherkin
Feature: Archive Management
  As a developer
  I want to archive completed or obsolete SPECs
  So that active SPEC list remains focused

Scenario: Archive completed SPEC
  Given an active SPEC-TEST-001 in .moai/specs/ with status: 'completed'
  When POST /api/specs/SPEC-TEST-001/archive is called
  Then SPEC directory SHALL move to .moai/archive/2026-01/SPEC-TEST-001/
  And database status SHALL update to 'archived'
  And archive metadata file SHALL be created at .moai/archive/2026-01/SPEC-TEST-001/.metadata.json
  And metadata SHALL preserve:
    """
    {
      "originalStatus": "completed",
      "archivedDate": "2026-01-30T12:00:00Z",
      "archivedBy": "system",
      "reason": "Completed SPEC archival"
    }
    """
```

**Success Criteria**:
- ✅ Directory moved to archive
- ✅ Database status updated atomically
- ✅ Metadata preserves original status

---

### Scenario 4.2: Restore Archived SPEC

```gherkin
Scenario: Restore SPEC from archive to active directory
  Given an archived SPEC-TEST-001 in .moai/archive/2026-01/
  And archive metadata contains originalStatus: 'completed'
  When POST /api/specs/SPEC-TEST-001/restore is called
  Then SPEC directory SHALL move back to .moai/specs/SPEC-TEST-001/
  And database status SHALL restore to 'completed' (from metadata)
  And SPEC structure integrity SHALL be validated:
    - spec.md exists
    - plan.md exists
    - acceptance.md exists
  And validation report SHALL confirm all files present
```

**Success Criteria**:
- ✅ SPEC restored to original location
- ✅ Original status restored from metadata
- ✅ Structure integrity validated

---

### Scenario 4.3: Rollback on Filesystem Error

```gherkin
Scenario: Handle archive failure with rollback
  Given an active SPEC-TEST-001 in .moai/specs/
  And the .moai/archive/ directory has insufficient permissions
  When POST /api/specs/SPEC-TEST-001/archive is called
  Then the filesystem move SHALL fail with permissions error
  And the database status change SHALL be rolled back
  And SPEC SHALL remain in .moai/specs/SPEC-TEST-001/ (original location)
  And the response SHALL return status 500 with error:
    """
    {
      "error": "Archive operation failed",
      "reason": "Insufficient permissions on archive directory",
      "recovery": "Check .moai/archive/ permissions and retry"
    }
    """
```

**Success Criteria**:
- ✅ Database changes rolled back
- ✅ SPEC remains in original location
- ✅ Detailed error message returned
- ✅ No partial state changes

---

### Scenario 4.4: List Archived SPECs

```gherkin
Scenario: Retrieve list of archived SPECs
  Given 3 SPECs archived in .moai/archive/2026-01/:
    | SPEC ID       | Original Status | Archived Date  |
    | SPEC-TEST-001 | completed       | 2026-01-15     |
    | SPEC-OLD-002  | blocked         | 2026-01-20     |
    | SPEC-TEMP-003 | planned         | 2026-01-25     |
  When GET /api/specs/archived is called
  Then the response SHALL return 3 archived SPECs
  And each entry SHALL include:
    - spec_id
    - originalStatus
    - archivedDate
    - archivePath
    - restorationEligible (boolean)
```

**Success Criteria**:
- ✅ All archived SPECs listed
- ✅ Metadata included in response
- ✅ Restoration eligibility indicated

---

## Performance Criteria

### Scenario P.1: Database Query Performance

```gherkin
Feature: Performance Requirements
  All operations must meet performance targets

Scenario: Query performance for large project
  Given a project with 100 SPECs (80 MoAI + 20 OpenSpec)
  When unified scanner executes
  Then all database queries SHALL complete within 100ms
  And the total scan time SHALL be <500ms
  And cache hit rate SHALL exceed 80% after first scan
```

**Performance Targets**:
- ✅ Query time: <100ms
- ✅ Total scan: <500ms
- ✅ Cache hit rate: >80%

---

### Scenario P.2: Migration Performance

```gherkin
Scenario: Batch migration speed
  Given 19 OpenSpec files in zellyy-money project
  When batch migration executes
  Then all 19 SPECs SHALL convert within 60 seconds
  And migration report SHALL be generated within 5 seconds
  And average processing time per SPEC SHALL be <3 seconds
```

**Performance Targets**:
- ✅ Total time: <60s
- ✅ Per-SPEC: <3s
- ✅ Report generation: <5s

---

### Scenario P.3: Archive Operation Speed

```gherkin
Scenario: Fast archive and restore operations
  Given a SPEC with 3 files totaling 50KB
  When archive operation executes
  Then the operation SHALL complete within 2 seconds
  And restore operation SHALL complete within 2 seconds
  And atomic operations SHALL complete within 5 seconds total
```

**Performance Targets**:
- ✅ Archive: <2s
- ✅ Restore: <2s
- ✅ Atomic operations: <5s

---

## Edge Cases and Error Handling

### Scenario E.1: Handle Corrupted SPEC Files

```gherkin
Scenario: Gracefully handle corrupted frontmatter
  Given a SPEC file with malformed YAML frontmatter:
    """
    ---
    spec_id: SPEC-TEST-001
    title: "Unclosed quote
    status: active
    ---
    """
  When scanMoaiSpecs executes
  Then the system SHALL log error:
    "Failed to parse frontmatter for SPEC-TEST-001: Invalid YAML"
  And the SPEC SHALL be skipped from results
  And scanning SHALL continue for remaining SPECs
  And no system crash SHALL occur
```

**Success Criteria**:
- ✅ Error logged with context
- ✅ Corrupted SPEC skipped
- ✅ Remaining SPECs processed
- ✅ No system crash

---

### Scenario E.2: Handle Disk Full During Archive

```gherkin
Scenario: Rollback archive when disk is full
  Given insufficient disk space in .moai/archive/
  When archive operation attempts to move SPEC
  Then the filesystem operation SHALL fail with "Disk full" error
  And database transaction SHALL rollback
  And SPEC SHALL remain in original location
  And error response SHALL include:
    - Error type: "Disk full"
    - Recovery suggestion: "Free up disk space and retry"
```

**Success Criteria**:
- ✅ Transaction rolled back
- ✅ SPEC remains in place
- ✅ Helpful error message

---

### Scenario E.3: Handle Concurrent Archive and Restore

```gherkin
Scenario: Prevent race condition between archive and restore
  Given SPEC-TEST-001 is being archived
  When a concurrent restore request arrives for SPEC-TEST-001
  Then the system SHALL detect the conflict
  And the concurrent operation SHALL wait or fail gracefully
  And no data corruption SHALL occur
  And the final state SHALL be consistent (either archived or active, not both)
```

**Success Criteria**:
- ✅ Race condition detected
- ✅ Operations serialized
- ✅ Consistent final state

---

## Data Integrity Verification

### Scenario D.1: Zero Data Loss During Migration

```gherkin
Scenario: Preserve 100% of OpenSpec content
  Given an OpenSpec file with:
    - 500 lines of content
    - 25 requirements
    - 15 tasks
    - 10 acceptance criteria
  When migration executes
  Then the generated MoAI files SHALL contain:
    - All 25 requirements (in EARS format)
    - All 15 tasks (as TAG chains)
    - All 10 acceptance criteria (as Gherkin scenarios)
  And no content SHALL be lost
  And checksum verification SHALL confirm 100% data preservation
```

**Success Criteria**:
- ✅ All requirements preserved
- ✅ All tasks preserved
- ✅ All acceptance criteria preserved
- ✅ Checksum validation passes

---

### Scenario D.2: Maintain File Timestamps During Archive

```gherkin
Scenario: Preserve file metadata in archive
  Given SPEC-TEST-001 with files:
    | File          | Created    | Modified   |
    | spec.md       | 2026-01-10 | 2026-01-15 |
    | plan.md       | 2026-01-10 | 2026-01-20 |
    | acceptance.md | 2026-01-10 | 2026-01-12 |
  When archive operation moves files
  Then all timestamps SHALL be preserved:
    - Creation time
    - Modification time
    - Access time
  And file permissions SHALL be preserved
```

**Success Criteria**:
- ✅ Timestamps preserved
- ✅ Permissions preserved
- ✅ Metadata intact

---

## Summary of Acceptance Criteria

### Minimum Requirements

| Phase | Minimum Scenarios | Provided |
|-------|-------------------|----------|
| 1     | 2                 | 4        |
| 2     | 2                 | 4        |
| 3     | 2                 | 5        |
| 4     | 2                 | 4        |
| **Total** | **8**         | **17**   |

**Additional Criteria**:
- Performance: 3 scenarios
- Edge Cases: 3 scenarios
- Data Integrity: 2 scenarios

**Total Scenarios**: 25

### Quality Gates

All scenarios must pass for SPEC completion:
- ✅ Functional correctness
- ✅ Performance targets met
- ✅ Error handling robust
- ✅ Data integrity guaranteed
- ✅ Zero data loss
- ✅ Type safety maintained (0 TypeScript errors)

---

**End of Acceptance Criteria**
