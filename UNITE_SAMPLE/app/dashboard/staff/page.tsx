"use client";

import { useState, useEffect } from "react";
import { useCoordinatorManagement } from "@/hooks/useCoordinatorManagement";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getUserInfo } from "@/utils/getUserInfo";
import Topbar from "@/components/layout/topbar";
import MobileNav from "@/components/tools/mobile-nav";
import {
  StaffToolbar,
  StaffTable,
  AddStaffModal,
  EditStaffModal,
  DeleteStaffModal,
} from "@/components/staff";
import type { CreateStaffData, UpdateStaffData, StaffListItem } from "@/types/coordinator.types";
import { Card } from "@heroui/card";

export default function StaffPage() {
  const [isMobile, setIsMobile] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffListItem | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  // Fetch current user from API
  const { user: currentUser } = useCurrentUser();

  const [userInfo, setUserInfo] = useState<any | null>(null);
  const [displayName, setDisplayName] = useState("unite user");
  const [displayEmail, setDisplayEmail] = useState("unite@health.tech");

  // Use the coordinator management hook for staff operations
  const {
    staff,
    loading,
    error,
    canManageStaff,
    checkingAccess,
    filters,
    searchQuery,
    handleSearch,
    handleFilter,
    handleClearFilters,
    fetchStaff,
    createStaffMember,
    updateStaffMember,
    deleteStaffMember,
    getAllowedStaffTypesForCurrentUser,
  } = useCoordinatorManagement();

  // Wrapper to convert (key, value) signature to filters object signature expected by hook
  const handleFilterChange = (key: string, value: any) => {
    handleFilter({
      ...filters,
      [key]: value,
    });
  };

  // Update display name and email from API user data
  useEffect(() => {
    if (currentUser) {
      if (currentUser.fullName) {
        setDisplayName(currentUser.fullName);
      } else if (currentUser.firstName || currentUser.lastName) {
        const nameParts = [currentUser.firstName, currentUser.middleName, currentUser.lastName].filter(Boolean);
        setDisplayName(nameParts.join(" ") || "unite user");
      }
      if (currentUser.email) {
        setDisplayEmail(currentUser.email);
      }
    }
    // Also keep getUserInfo for backward compatibility
    const info = getUserInfo();
    setUserInfo(info);
  }, [currentUser]);

  // Detect mobile viewport
  useEffect(() => {
    const checkViewport = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    if (typeof window !== 'undefined') {
      checkViewport();
      window.addEventListener('resize', checkViewport);
      return () => window.removeEventListener('resize', checkViewport);
    }
  }, []);

  const handleAddStaff = () => {
    setIsAddModalOpen(true);
  };

  const handleEditStaff = (id: string) => {
    const staffMember = staff.find((s) => s.id === id);
    if (staffMember) {
      setEditingStaff(staffMember);
      setIsEditModalOpen(true);
    }
  };

  const handleDeleteStaff = (id: string, name: string) => {
    setDeletingStaff({ id, name });
    setIsDeleteModalOpen(true);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStaffIds(staff.map((s) => s.id));
    } else {
      setSelectedStaffIds([]);
    }
  };

  const handleSelectStaff = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedStaffIds([...selectedStaffIds, id]);
    } else {
      setSelectedStaffIds(selectedStaffIds.filter((sid) => sid !== id));
    }
  };

  const handleAddStaffSubmit = async (data: CreateStaffData) => {
    try {
      await createStaffMember(data);
      setIsAddModalOpen(false);
      // Refresh staff list
      await fetchStaff();
    } catch (err) {
      console.error("Failed to create staff:", err);
    }
  };

  const handleEditStaffSubmit = async (data: UpdateStaffData) => {
    if (!editingStaff) return;
    try {
      await updateStaffMember(editingStaff.id, data);
      setIsEditModalOpen(false);
      setEditingStaff(null);
      // Refresh staff list
      await fetchStaff();
    } catch (err) {
      console.error("Failed to update staff:", err);
    }
  };

  const handleDeleteStaffConfirm = async () => {
    if (!deletingStaff) return;
    try {
      await deleteStaffMember(deletingStaff.id);
      setIsDeleteModalOpen(false);
      setDeletingStaff(null);
      // Refresh staff list
      await fetchStaff();
    } catch (err) {
      console.error("Failed to delete staff:", err);
    }
  };

  if (checkingAccess) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4 mx-auto"></div>
          <p className="text-gray-600">Checking access permissions...</p>
        </div>
      </div>
    );
  }

  if (!canManageStaff) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access Staff Management. Only super admins and users with 'manage_staff' permission can access this page.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar userName={displayName} userEmail={displayEmail} />
      {isMobile && <MobileNav />}

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600 mt-2">Manage your organization's medical staff members and coordinators</p>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="bg-red-50 border-l-4 border-red-600 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </Card>
        )}

        {/* Toolbar */}
        <StaffToolbar
          searchQuery={searchQuery}
          filters={filters}
          onSearch={handleSearch}
          onFilter={handleFilterChange}
          onClearFilters={handleClearFilters}
          onAddStaff={handleAddStaff}
        />

        {/* Staff Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mt-6">
          <StaffTable
            staff={staff}
            selectedStaffIds={selectedStaffIds}
            onSelectAll={handleSelectAll}
            onSelectStaff={handleSelectStaff}
            onEditStaff={handleEditStaff}
            onDeleteStaff={handleDeleteStaff}
            loading={loading}
          />
        </div>
      </div>

      {/* Modals */}
      <AddStaffModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddStaffSubmit}
        getAllowedStaffTypes={getAllowedStaffTypesForCurrentUser}
      />

      {editingStaff && (
        <EditStaffModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingStaff(null);
          }}
          onSubmit={handleEditStaffSubmit}
          staff={editingStaff}
          getAllowedStaffTypes={getAllowedStaffTypesForCurrentUser}
        />
      )}

      {deletingStaff && (
        <DeleteStaffModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeletingStaff(null);
          }}
          onConfirm={handleDeleteStaffConfirm}
          staffName={deletingStaff.name}
        />
      )}
    </div>
  );
}
