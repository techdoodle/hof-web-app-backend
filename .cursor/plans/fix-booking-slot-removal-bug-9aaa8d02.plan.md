<!-- 9aaa8d02-eda6-4465-9898-7af053fd36a5 a6aaf577-a6fb-430d-bb01-4904a582d4f4 -->
# Employee Management System - Tribe

## Overview

Build a comprehensive employee management system with a football-themed, motivating design. Employees can be mapped to existing users (1:1), with full HR/super_admin access and limited employee view access.

## Backend Implementation

### 1. Database Schema

**New File**: `hof-web-app-backend/src/database/migrations/[timestamp]-CreateEmployeeManagementTables.ts`

- **employees table**:
- `id` (primary key)
- `user_id` (foreign key to users, nullable, unique - 1:1 mapping)
- `employee_id` (unique employee identifier, e.g., "EMP001")
- `first_name`, `last_name`, `email`, `phone_number`
- `date_of_birth` (for birthday tracking)
- `joining_date`, `designation`, `department`
- `employment_type` (enum: INTERN, FULL_TIME, PART_TIME, CONTRACT)
- `status` (enum: ACTIVE, ON_LEAVE, RESIGNED, TERMINATED)
- `manager_id` (self-referencing foreign key)
- `profile_picture` (URL)
- `created_at`, `updated_at`

- **employee_documents table**:
- `id` (primary key)
- `employee_id` (foreign key)
- `document_type` (enum: OFFER_LETTER, INTERNSHIP_LETTER, RELIEVING_LETTER, CONTRACT, NDA, CERTIFICATE, CUSTOM)
- `custom_type_name` (nullable, for custom types)
- `file_url` (Firebase Storage URL)
- `file_name`, `file_size`, `mime_type`
- `issued_date`, `expiry_date` (nullable)
- `issued_by` (user_id of HR/admin)
- `notes` (text, nullable)
- `created_at`, `updated_at`

- **employee_onboarding table**:
- `id` (primary key)
- `employee_id` (foreign key)
- `onboarding_stage` (enum: PENDING, IN_PROGRESS, DOCUMENTS_PENDING, COMPLETED)
- `checklist_items` (JSONB - array of {task, completed, due_date})
- `assigned_by` (user_id of HR)
- `started_at`, `completed_at` (nullable)
- `created_at`, `updated_at`

- **Indexes**:
- `employees(user_id)` - unique index
- `employees(employee_id)` - unique index
- `employees(date_of_birth)` - for birthday queries
- `employees(status, employment_type)`
- `employee_documents(employee_id, document_type)`
- `employee_onboarding(employee_id, onboarding_stage)`

### 2. Entity Definitions

**New File**: `hof-web-app-backend/src/modules/employee/entities/employee.entity.ts`

- Define Employee entity with TypeORM decorators
- Relations: User (ManyToOne), Manager (self-referencing), Documents (OneToMany), Onboarding (OneToOne)

**New File**: `hof-web-app-backend/src/modules/employee/entities/employee-document.entity.ts`

- Define EmployeeDocument entity

**New File**: `hof-web-app-backend/src/modules/employee/entities/employee-onboarding.entity.ts`

- Define EmployeeOnboarding entity

### 3. DTOs

**New File**: `hof-web-app-backend/src/modules/employee/dto/employee.dto.ts`

- `CreateEmployeeDto`: firstName, lastName, email, phoneNumber, dateOfBirth, joiningDate, designation, department, employmentType, userId (optional), managerId (optional)
- `UpdateEmployeeDto`: All fields optional
- `EmployeeResponseDto`: Full employee data with relations
- `EmployeeListDto`: Paginated list with filters (status, department, employmentType)

**New File**: `hof-web-app-backend/src/modules/employee/dto/document.dto.ts`

- `UploadDocumentDto`: employeeId, documentType, customTypeName (optional), file (multipart), issuedDate, expiryDate (optional), notes (optional)
- `DocumentResponseDto`: Full document data
- `DocumentListDto`: Filtered list by employeeId, documentType

**New File**: `hof-web-app-backend/src/modules/employee/dto/onboarding.dto.ts`

- `CreateOnboardingDto`: employeeId, checklistItems
- `UpdateOnboardingDto`: onboardingStage, checklistItems
- `OnboardingResponseDto`: Full onboarding data

### 4. Services

**New File**: `hof-web-app-backend/src/modules/employee/employee.service.ts`

- `createEmployee()`: Create employee, optionally link to existing user
- `updateEmployee()`: Update employee details
- `getEmployeeById()`: Get employee with relations
- `getEmployees()`: Paginated list with filters
- `getEmployeesByBirthday()`: Get employees with birthdays in date range
- `linkEmployeeToUser()`: Link employee to existing user account
- `getEmployeeStats()`: Department counts, employment type stats

**New File**: `hof-web-app-backend/src/modules/employee/document.service.ts`

- `uploadDocument()`: Upload to Firebase Storage, save metadata
- `getDocuments()`: Get documents for employee
- `deleteDocument()`: Delete from storage and database
- `generateDocument()`: Template-based document generation (future)

**New File**: `hof-web-app-backend/src/modules/employee/onboarding.service.ts`

- `createOnboarding()`: Initialize onboarding process
- `updateOnboardingStage()`: Update stage and checklist
- `completeOnboarding()`: Mark as completed
- `getOnboardingProgress()`: Get current progress

### 5. Controllers

**New File**: `hof-web-app-backend/src/modules/employee/employee.controller.ts`

- `POST /admin/employees` - Create employee (HR/super_admin)
- `GET /admin/employees` - List employees with filters (HR/super_admin full, employees limited)
- `GET /admin/employees/:id` - Get employee details
- `PUT /admin/employees/:id` - Update employee (HR/super_admin)
- `GET /admin/employees/birthdays` - Get upcoming birthdays
- `POST /admin/employees/:id/link-user` - Link to user account
- `GET /admin/employees/stats` - Employee statistics

**New File**: `hof-web-app-backend/src/modules/employee/document.controller.ts`

- `POST /admin/employees/:id/documents` - Upload document (multipart)
- `GET /admin/employees/:id/documents` - List documents
- `GET /admin/employees/:id/documents/:docId` - Get document
- `DELETE /admin/employees/:id/documents/:docId` - Delete document
- `GET /admin/employees/:id/documents/:docId/download` - Download document

**New File**: `hof-web-app-backend/src/modules/employee/onboarding.controller.ts`

- `POST /admin/employees/:id/onboarding` - Create onboarding
- `GET /admin/employees/:id/onboarding` - Get onboarding status
- `PUT /admin/employees/:id/onboarding` - Update onboarding
- `POST /admin/employees/:id/onboarding/complete` - Complete onboarding

### 6. Guards & Permissions

- Use `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)` for full access endpoints
- Add `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.EMPLOYEE)` for limited access
- Create custom guard to check if employee can view their own data

### 7. Module Setup

**New File**: `hof-web-app-backend/src/modules/employee/employee.module.ts`

- Import TypeORM entities
- Provide services
- Export controllers
- Import UserModule for user linking

## Frontend Implementation (Admin Panel)

### 8. Route Setup

**File**: `hof-admin/src/App.tsx`

- Add CustomRoute: `<Route path="/tribe" element={<TribeDashboard />} />`
- Add menu item in Layout (HR/super_admin only)

### 9. Main Dashboard Component

**New File**: `hof-admin/src/resources/tribe/TribeDashboard.tsx`

- Football field/stadium background design
- Hero section with motivational football imagery
- Quick stats cards (total employees, birthdays this month, onboarding in progress)
- Upcoming birthdays section (next 7 days)
- Recent onboarding activity
- Quick actions (Add Employee, View Calendar, Documents)

### 10. Employee List

**New File**: `hof-admin/src/resources/tribe/EmployeeList.tsx`

- DataGrid with employee data
- Filters: status, department, employment type
- Search by name, email, employee ID
- Actions: View, Edit, Documents, Onboarding
- Football-themed card view option
- Show profile pictures, badges for employment type

### 11. Employee Create/Edit Forms

**New File**: `hof-admin/src/resources/tribe/EmployeeCreate.tsx`

- Multi-step form with football-themed design
- Step 1: Basic Info (name, email, phone, DOB)
- Step 2: Employment Details (designation, department, type, joining date)
- Step 3: Link to User (optional - search existing users)
- Step 4: Manager Assignment (optional)
- Step 5: Profile Picture Upload
- Validation and error handling

**New File**: `hof-admin/src/resources/tribe/EmployeeEdit.tsx`

- Similar to create, pre-filled with existing data
- Additional: Status change, employment history

### 12. Employee Detail View

**New File**: `hof-admin/src/resources/tribe/EmployeeShow.tsx`

- Tabbed interface:
- Overview: Profile, employment details, stats
- Documents: All documents with download/upload
- Onboarding: Progress tracker
- Birthday: Celebration view (if birthday)
- Football jersey-style profile card
- Achievement badges display

### 13. Document Management

**New File**: `hof-admin/src/resources/tribe/DocumentManager.tsx`

- Document upload with drag-and-drop
- Document type selector (with custom option)
- Document list with filters
- Preview/download functionality
- Document expiry tracking
- Bulk upload support

### 14. Onboarding Management

**New File**: `hof-admin/src/resources/tribe/OnboardingManager.tsx`

- Checklist-based onboarding tracker
- Stage progression visualization
- Task assignment and completion
- Email notifications (future)
- Document upload during onboarding

### 15. Birthday Calendar

**New File**: `hof-admin/src/resources/tribe/BirthdayCalendar.tsx`

- Calendar view with birthday highlights
- List view: Upcoming birthdays (next 30 days)
- Birthday celebration page for each employee
- Send birthday wishes

### To-dos

- [ ] Create database migration to increase status column length from VARCHAR(20) to VARCHAR(50)
- [ ] Update matches.entity.ts to reflect new column length
- [ ] Refactor slot processing to handle multiple slots, grouping by booking ID
- [ ] Update refund logic to handle multiple slots per booking correctly
- [ ] Fix booked_slots decrement to use actual count of removed slots
- [ ] Update playernation.service.ts processMatchedPlayerStats to set STATS_UPDATED when stats imported