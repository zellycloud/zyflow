# Flow Dashboard Specification

## ADDED Requirements

### Requirement: Project Selection
The system SHALL provide a sidebar for selecting projects (repositories).

#### Scenario: Display project list
- **WHEN** the user opens the application
- **THEN** the sidebar SHALL display all registered projects
- **AND** the currently selected project SHALL be highlighted

#### Scenario: Switch project
- **WHEN** the user clicks a different project in the sidebar
- **THEN** the main content SHALL update to show that project's changes
- **AND** the sidebar selection SHALL reflect the new project

#### Scenario: Add new project
- **WHEN** the user clicks the "Add Project" button
- **THEN** a modal SHALL appear to enter project path
- **AND** upon confirmation, the project SHALL be added to the list

### Requirement: Change List Display
The system SHALL display all Changes for the selected project in an accordion format.

#### Scenario: Display collapsed change
- **WHEN** a Change is in collapsed state (Level 1)
- **THEN** the system SHALL show: title, current stage badge, and progress bar in a single row

#### Scenario: Display expanded change
- **WHEN** a Change is in expanded state (Level 2)
- **THEN** the system SHALL show: pipeline bar with 6 stages and tab content for the selected stage

#### Scenario: Toggle change expansion
- **WHEN** the user clicks on a collapsed Change
- **THEN** the Change SHALL expand to show Level 2 content
- **WHEN** the user clicks on an expanded Change header
- **THEN** the Change SHALL collapse to Level 1

### Requirement: Pipeline Visualization
The system SHALL visualize the 6-stage pipeline (Spec, Task, Code, Test, Commit, Docs) as a horizontal bar.

#### Scenario: Display stage status
- **WHEN** displaying the pipeline bar
- **THEN** each stage SHALL show its status: completed (✓), in-progress (●), or pending (○)
- **AND** stages with tasks SHALL show completion count (e.g., "3/5")

#### Scenario: Stage as tab selector
- **WHEN** the user clicks a stage in the pipeline bar
- **THEN** the tab content below SHALL update to show that stage's details
- **AND** the clicked stage SHALL be visually highlighted as active

### Requirement: Stage Tab Content
The system SHALL display stage-specific content in a tabbed panel below the pipeline bar.

#### Scenario: Display Spec tab
- **WHEN** the Spec tab is selected
- **THEN** the system SHALL display the proposal summary from OpenSpec
- **AND** provide a link to view the full spec document

#### Scenario: Display Task/Code/Test/Docs tabs
- **WHEN** any of Task, Code, Test, or Docs tabs is selected
- **THEN** the system SHALL display the list of tasks for that stage
- **AND** each task SHALL show its status and title

#### Scenario: Display Commit tab
- **WHEN** the Commit tab is selected
- **THEN** the system SHALL display commit/CI status for the Change

### Requirement: Task Detail View
The system SHALL provide a Level 3 detail view for tasks when content is extensive.

#### Scenario: Open task detail modal
- **WHEN** the user clicks "View Details" on a task
- **THEN** a modal SHALL appear showing full task description and metadata

#### Scenario: Navigate to task detail page
- **WHEN** task content is too large for a modal
- **THEN** the "View Details" action SHALL navigate to a dedicated task page
- **AND** the page SHALL provide a back navigation to return to the Flow view

### Requirement: Smart Default Expansion
The system SHALL automatically expand Changes and tabs based on current progress.

#### Scenario: Auto-expand in-progress change
- **WHEN** the user loads the Flow view
- **THEN** Changes with status "in-progress" SHALL be automatically expanded

#### Scenario: Auto-select current stage tab
- **WHEN** a Change is expanded
- **THEN** the tab for the current_stage SHALL be automatically selected

### Requirement: OpenSpec Synchronization
The system SHALL synchronize Changes from OpenSpec files to the database.

#### Scenario: Manual sync trigger
- **WHEN** the user clicks the "Sync from OpenSpec" button
- **THEN** the system SHALL scan the openspec/changes directory
- **AND** create or update Changes in the database

#### Scenario: Parse tasks.md
- **WHEN** synchronizing a Change with tasks.md
- **THEN** the system SHALL parse checkbox items (- [ ] / - [x])
- **AND** create corresponding tasks with appropriate status

### Requirement: Standalone Tasks Support
The system SHALL support tasks not associated with any Change (legacy kanban compatibility).

#### Scenario: Display standalone tasks
- **WHEN** the project has tasks with change_id=null
- **THEN** the system SHALL display them in a separate "Standalone Tasks" section

#### Scenario: Create standalone task
- **WHEN** the user creates a task without selecting a Change
- **THEN** the task SHALL be created with change_id=null
- **AND** appear in the Standalone Tasks section
