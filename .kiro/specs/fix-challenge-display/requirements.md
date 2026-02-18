# Requirements Document

## Introduction

This document specifies the requirements for fixing challenge display issues in the Chabaqa application. Users have reported that challenges are not displaying correctly in two critical locations: the Creator Manage Challenge Page (tasks tab) and the User Challenge Timeline. The root causes include inconsistent task ID handling between backend and frontend, missing property safeguards, and incomplete data transformation in the backend service.

## Glossary

- **Challenge**: A structured program with multiple tasks that users can participate in
- **Task**: An individual activity within a challenge, identified by a unique ID and day number
- **Backend_Service**: The NestJS service (challenge.service.ts) responsible for challenge data operations
- **Frontend_Component**: React components that display challenge data (TimelineTab, ChallengeTasksTab)
- **Task_Resource**: A learning resource attached to a task (video, article, code, tool)
- **Challenge_Resource**: A learning resource attached to the challenge itself
- **Task_ID**: A unique string identifier for a task, must be consistent across all operations
- **Transform_Method**: The transformToResponseDto method that converts database documents to API responses
- **Participant**: A user who has joined a challenge
- **Sequential_Progression**: A feature where tasks must be completed in order

## Requirements

### Requirement 1: Consistent Task ID Management

**User Story:** As a developer, I want all tasks to have consistent IDs throughout the system, so that tasks can be reliably identified and tracked across backend and frontend.

#### Acceptance Criteria

1. WHEN a task is created, THE Backend_Service SHALL assign a unique Task_ID using MongoDB ObjectId
2. WHEN a task is retrieved from the database, THE Backend_Service SHALL ensure the task has an id field populated
3. WHEN transforming challenge data, THE Transform_Method SHALL map both _id and id fields to a single id property
4. WHEN a task lacks an id field, THE Backend_Service SHALL generate one before returning the response
5. THE Backend_Service SHALL ensure all existing tasks have id fields through the ensureTaskAndResourceIds method

### Requirement 2: Complete Task Property Serialization

**User Story:** As a frontend developer, I want all task properties to be properly serialized in API responses, so that components can display task information without errors.

#### Acceptance Criteria

1. WHEN transforming a task, THE Transform_Method SHALL include all required properties: id, day, title, description, deliverable, isCompleted, isActive, points, instructions, notes, resources, createdAt
2. WHEN a task property is undefined, THE Transform_Method SHALL provide a sensible default value
3. WHEN serializing task resources, THE Transform_Method SHALL ensure each resource has an id field
4. WHEN a task has no resources array, THE Transform_Method SHALL return an empty array instead of undefined
5. WHEN a task has no notes field, THE Transform_Method SHALL return an empty string or undefined consistently

### Requirement 3: Timeline Component Data Handling

**User Story:** As a user, I want to view my challenge timeline with all tasks displayed correctly, so that I can track my progress through the challenge.

#### Acceptance Criteria

1. WHEN the TimelineTab receives task data, THE Frontend_Component SHALL validate that each task has required properties
2. WHEN a task property is missing, THE Frontend_Component SHALL use a default value to prevent rendering errors
3. WHEN displaying task status, THE Frontend_Component SHALL handle undefined isActive, isCompleted, and isUnlocked properties
4. WHEN showing task resources, THE Frontend_Component SHALL handle empty or undefined resources arrays
5. WHEN displaying points, THE Frontend_Component SHALL default to 0 if points is undefined
6. WHEN showing lock status, THE Frontend_Component SHALL handle missing lockReason property gracefully

### Requirement 4: Manage Tasks Component Data Handling

**User Story:** As a challenge creator, I want to manage my challenge tasks without display errors, so that I can effectively organize and edit my challenge content.

#### Acceptance Criteria

1. WHEN the ChallengeTasksTab receives task data, THE Frontend_Component SHALL validate that each task has required properties
2. WHEN a task resource lacks an id, THE Frontend_Component SHALL handle it gracefully without crashing
3. WHEN displaying task details, THE Frontend_Component SHALL handle undefined instructions, notes, and resources properties
4. WHEN editing a task, THE Frontend_Component SHALL preserve all task properties including optional ones
5. WHEN a task has no resources, THE Frontend_Component SHALL display an empty resources list

### Requirement 5: Resource ID Consistency

**User Story:** As a developer, I want all task resources to have consistent IDs, so that resources can be reliably identified and managed.

#### Acceptance Criteria

1. WHEN a task resource is created, THE Backend_Service SHALL assign a unique id using MongoDB ObjectId
2. WHEN transforming task data, THE Transform_Method SHALL ensure all resources have id fields
3. WHEN a resource lacks an id, THE Backend_Service SHALL generate one before returning the response
4. THE Backend_Service SHALL apply the same ID consistency rules to challenge-level resources
5. WHEN updating tasks, THE Backend_Service SHALL preserve existing resource IDs

### Requirement 6: Sequential Progression Data Integrity

**User Story:** As a user, I want sequential progression features to work correctly, so that I can see which tasks are locked and why.

#### Acceptance Criteria

1. WHEN sequential progression is enabled, THE Backend_Service SHALL include isUnlocked property for each task
2. WHEN a task is locked, THE Backend_Service SHALL include a lockReason property explaining why
3. WHEN transforming challenge data, THE Transform_Method SHALL include sequentialProgression and unlockMessage fields
4. WHEN calculating task unlock status, THE Backend_Service SHALL use the participant's completedTasks array
5. THE Backend_Service SHALL ensure the first task is always unlocked when sequential progression is enabled

### Requirement 7: Null Safety and Default Values

**User Story:** As a developer, I want the system to handle missing or null values gracefully, so that the application doesn't crash when data is incomplete.

#### Acceptance Criteria

1. WHEN a task array is undefined, THE Backend_Service SHALL return an empty array
2. WHEN a resources array is undefined, THE Backend_Service SHALL return an empty array
3. WHEN optional string fields are undefined, THE Backend_Service SHALL return undefined or empty string consistently
4. WHEN numeric fields are undefined, THE Backend_Service SHALL return 0 as default
5. WHEN boolean fields are undefined, THE Backend_Service SHALL return false as default

### Requirement 8: Data Transformation Validation

**User Story:** As a system administrator, I want all challenge data transformations to be validated, so that API responses are always well-formed.

#### Acceptance Criteria

1. WHEN transforming challenge data, THE Transform_Method SHALL validate that all required fields are present
2. WHEN a required field is missing, THE Transform_Method SHALL log a warning and provide a default value
3. WHEN transforming participant data, THE Transform_Method SHALL ensure completedTasks is an array
4. WHEN transforming task data, THE Transform_Method SHALL ensure createdAt is properly serialized to ISO string
5. THE Transform_Method SHALL handle both Date objects and date strings for createdAt fields

### Requirement 9: Frontend Type Safety

**User Story:** As a frontend developer, I want TypeScript interfaces to match the actual API response structure, so that type checking catches data inconsistencies.

#### Acceptance Criteria

1. THE Frontend_Component SHALL define interfaces that match the backend response structure
2. WHEN receiving task data, THE Frontend_Component SHALL validate data against TypeScript interfaces
3. WHEN a type mismatch occurs, THE Frontend_Component SHALL log a warning and handle gracefully
4. THE Frontend_Component SHALL use optional chaining for all potentially undefined properties
5. THE Frontend_Component SHALL provide type guards for critical data validations

### Requirement 10: Error Recovery and Logging

**User Story:** As a developer, I want comprehensive error logging for data issues, so that I can quickly diagnose and fix problems.

#### Acceptance Criteria

1. WHEN a task is missing an id, THE Backend_Service SHALL log a warning with the task details
2. WHEN a resource is missing an id, THE Backend_Service SHALL log a warning with the resource details
3. WHEN data transformation fails, THE Backend_Service SHALL log the error and return a safe default
4. WHEN the frontend encounters invalid data, THE Frontend_Component SHALL log the issue to the console
5. THE Backend_Service SHALL include request context in error logs for debugging
