# Staff Management Page - Files Created

## Complete File List

### Main Page
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\app\dashboard\staff\page.tsx
```
**What it does:**
- Main page component that ties everything together
- Handles state management for modals
- Manages staff selection, filtering, and searching
- Permission checks and access control
- Renders the complete staff management interface

**Key imports:**
- useCoordinatorManagement hook
- useCurrentUser hook
- All staff component modules

**State managed:**
- isAddModalOpen, isEditModalOpen, isDeleteModalOpen
- editingStaff, deletingStaff
- selectedStaffIds
- userInfo, displayName, displayEmail

---

### Components

#### 1. StaffTable.tsx
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\components\staff\StaffTable.tsx
```
**What it does:**
- Displays staff data in a professional table format
- Handles row selection with checkboxes
- Shows staff details: name, email, role, phone, geographic area, status, created date
- Provides action menu (edit, delete) per row
- Shows loading states and empty state ui

**Key features:**
- Responsive table layout
- Role badges with color coding
- Status chips (Active/Pending)
- Action dropdown menu
- Loading skeleton

---

#### 2. StaffToolbar.tsx
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\components\staff\StaffToolbar.tsx
```
**What it does:**
- Provides search functionality
- Displays filter dropdowns and active filter chips
- "Add Staff" action button
- Clear filters button

**Key features:**
- Real-time search input
- Multi-select role filter dropdown
- Multi-select organization type filter dropdown
- Active filter display with close button
- Filter count tracking

---

#### 3. AddStaffModal.tsx
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\components\staff\AddStaffModal.tsx
```
**What it does:**
- Modal form for creating new staff members
- Collects staff information and credentials
- Validates form data before submission
- Handles form submission to API

**Key form fields:**
- firstName (required, min 2 chars)
- middleName (optional)
- lastName (required, min 2 chars)
- email (required, valid email format)
- phoneNumber (optional)
- password (required, min 8 chars)
- confirmPassword (required, must match password)
- roleId (required, dropdown selection)
- organizationType (optional, dropdown selection)

**Validation:**
- Uses Zod schema for validation
- React Hook Form for form state management
- Real-time error display

---

#### 4. EditStaffModal.tsx
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\components\staff\EditStaffModal.tsx
```
**What it does:**
- Modal form for editing existing staff member details
- Pre-populates form with current staff data
- Validates changes before submission
- Handles update submission to API

**Editable fields:**
- firstName
- middleName
- lastName
- phoneNumber
- organizationType

**Read-only fields:**
- email (displayed but not editable)
- Role (not editable in this modal - handled separately)

**Note:** Role management is handled through separate endpoints (assignRoleToStaff) rather than direct update

---

#### 5. DeleteStaffModal.tsx
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\components\staff\DeleteStaffModal.tsx
```
**What it does:**
- Confirmation modal for staff deletion
- Shows clear warning about permanent deletion
- Handles delete confirmation and API call
- Shows loading state during deletion

**UI elements:**
- Alert icon in red
- Staff name display
- Cancel and Delete buttons
- Loading spinner during deletion

---

## Modified Files

### Sidebar Navigation
```
c:\Users\Admin\Desktop\Dev\UNITE-Backend-Enterprise\UNITE_SAMPLE\components\layout\sidebar.tsx
```
**Change made:**
- Added new navigation link for staff management
- Link path: `/dashboard/staff`
- Icon: Persons (from gravity-ui/icons)
- Visibility: Always visible (true) or controlled by menu items

**Location in file:**
- Added after coordinator-management link in the `links` array
- Around line 141-145

---

## API Endpoints Used

The components integrate with these backend endpoints (via useCoordinatorManagement hook):

- `GET /api/v1/users` - Fetch staff list with filters
- `POST /api/v1/users` - Create new staff member
- `PATCH /api/v1/users/:id` - Update staff details
- `DELETE /api/v1/users/:id` - Delete staff member

---

## Component Props Documentation

### StaffTable Props
```typescript
interface StaffTableProps {
  staff: StaffListItem[];
  selectedStaffIds: string[];
  onSelectAll: (checked: boolean) => void;
  onSelectStaff: (id: string, checked: boolean) => void;
  onEditStaff?: (id: string) => void;
  onDeleteStaff?: (id: string, name: string) => void;
  loading?: boolean;
}
```

### StaffToolbar Props
```typescript
interface StaffToolbarProps {
  searchQuery: string;
  filters: StaffFilters;
  onSearch: (query: string) => void;
  onFilter: (key: string, value: any) => void;
  onClearFilters: () => void;
  onAddStaff: () => void;
}
```

### AddStaffModal Props
```typescript
interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStaffData) => Promise<void>;
  isSubmitting?: boolean;
  getAllowedStaffTypes?: () => Promise<string[]>;
}
```

### EditStaffModal Props
```typescript
interface EditStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateStaffData) => Promise<void>;
  staff: StaffListItem;
  isSubmitting?: boolean;
  getAllowedStaffTypes?: () => Promise<string[]>;
}
```

### DeleteStaffModal Props
```typescript
interface DeleteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  staffName: string;
  isDeleting?: boolean;
}
```

---

## Type Definitions Used

All types are imported from `@/types/coordinator.types`:

```typescript
interface StaffListItem {
  id: string;
  email: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  phoneNumber?: string;
  organizationType?: string;
  organizationName?: string;
  roles: Array<{id: string; code: string; name: string;}>;
  coverageAreas: Array<{id: string; name: string;}>;
  isActive: boolean;
  createdAt: string;
}

interface CreateStaffData {
  email: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phoneNumber?: string;
  organizationType?: string;
  roles: string[];
}

interface UpdateStaffData {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  phoneNumber?: string;
  organizationType?: string;
  isActive?: boolean;
}

interface StaffFilters {
  role?: string[];
  coverageAreaId?: string[];
  organizationType?: string[];
  search?: string;
}
```

---

## Color Scheme Reference

### Role Colors (in StaffTable)
- Admin/Super Admin: `danger` (red)
- Coordinator/Staff Coordinator: `primary` (blue)
- Doctor/Medical Staff: `success` (green)
- Nurse/Medical Personnel: `secondary` (purple)
- Default: `default` (gray)

### Status Colors
- Active: `success` (green)
- Pending: `warning` (yellow/orange)

---

## Quick Integration Checklist

- [x] Main page component created and connected to dashboard
- [x] All supporting components created
- [x] Sidebar navigation updated
- [x] Form validation implemented
- [x] Type safety with TypeScript
- [x] HeroUI components integrated
- [x] Responsive design implemented
- [x] Loading states included
- [x] Error handling included
- [x] Empty states included
- [x] Permission checks included
- [x] API integration points ready

## Testing Recommendations

1. **Permission Testing**
   - Test access denial for non-admin users
   - Verify super_admin can access
   - Test manage_staff permission

2. **CRUD Operations**
   - Create staff with all fields
   - Edit staff and verify changes
   - Delete staff and confirm
   - Search and filter functionality

3. **Form Validation**
   - Empty field submission
   - Invalid email format
   - Short password
   - Password mismatch

4. **Responsive Design**
   - Mobile view (< 600px)
   - Tablet view (600-900px)
   - Desktop view (> 900px)

5. **Edge Cases**
   - No staff members found
   - Network errors during API calls
   - Duplicate email submission
   - Rapid click actions (double-click delete)

---

## Deployment Notes

1. Ensure backend API endpoints are functional
2. Verify RLS policies filter by org_id correctly
3. Test with multiple organizations to ensure data isolation
4. Verify authentication tokens are correctly set in API calls
5. Test email validation on backend
6. Ensure password hashing/encryption is implemented
7. Set up proper error logging for failed operations

---

## Future Enhancement Ideas

- Export staff list to CSV
- Bulk operations (delete, activate, deactivate)
- Role assignment management UI
- Coverage area visual editor
- Staff activity audit log
- Batch import from Excel
- Advanced date range filtering
- Staff performance metrics
- Integration with external HR systems
