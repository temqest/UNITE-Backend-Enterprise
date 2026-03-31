"use client";

import {
  Ellipsis as MoreHorizontal,
  Pencil as Edit3,
  TrashBin as Trash2,
} from "@gravity-ui/icons";
import { Checkbox } from "@heroui/checkbox";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownSection,
  DropdownItem,
} from "@heroui/dropdown";
import type { StaffListItem } from "@/types/coordinator.types";

interface StaffTableProps {
  staff: StaffListItem[];
  selectedStaffIds: string[];
  onSelectAll: (checked: boolean) => void;
  onSelectStaff: (id: string, checked: boolean) => void;
  onEditStaff?: (id: string) => void;
  onDeleteStaff?: (id: string, name: string) => void;
  loading?: boolean;
}

export default function StaffTable({
  staff,
  selectedStaffIds,
  onSelectAll,
  onSelectStaff,
  onEditStaff,
  onDeleteStaff,
  loading,
}: StaffTableProps) {
  const isAllSelected = staff.length > 0 && staff.every((s) => selectedStaffIds.includes(s.id));

  const getRoleColor = (roleCode: string) => {
    switch (roleCode?.toLowerCase()) {
      case "admin":
      case "super_admin":
        return "danger";
      case "coordinator":
      case "staff_coordinator":
        return "primary";
      case "doctor":
      case "medical_staff":
        return "success";
      case "nurse":
      case "medical_personnel":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? "success" : "warning";
  };

  const getStatusText = (isActive: boolean) => {
    return isActive ? "Active" : "Pending";
  };

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              <th className="px-6 py-3.5 text-left w-12">
                <Checkbox
                  isSelected={false}
                  disabled
                  className="opacity-50"
                />
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Geographic Area
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Created Date
              </th>
              <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, index) => (
              <tr key={index} className="border-b border-gray-100 animate-pulse">
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-4"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-48"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-28"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-36"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-gray-400 mb-2">
          <svg
            className="w-16 h-16 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-2a6 6 0 0112 0v2zm2.25-4.75A3.75 3.75 0 1123 12.25"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-600 mb-1">No staff found</h3>
        <p className="text-gray-500">Add your first staff member to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-200">
            <th className="px-6 py-3.5 text-left w-12">
              <Checkbox
                isSelected={isAllSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Geographic Area
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Created Date
            </th>
            <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {staff.map((staffMember, index) => (
            <tr
              key={staffMember.id}
              className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
                index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
              }`}
            >
              <td className="px-6 py-4">
                <Checkbox
                  isSelected={selectedStaffIds.includes(staffMember.id)}
                  onChange={(e) => onSelectStaff(staffMember.id, e.target.checked)}
                />
              </td>
              <td className="px-6 py-4">
                <p className="font-medium text-gray-900">{staffMember.fullName}</p>
              </td>
              <td className="px-6 py-4">
                <p className="text-gray-600 text-sm">{staffMember.email}</p>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-1 flex-wrap">
                  {staffMember.roles && staffMember.roles.length > 0 ? (
                    staffMember.roles.slice(0, 1).map((role) => (
                      <Chip
                        key={role.id}
                        size="sm"
                        variant="flat"
                        color={getRoleColor(role.code)}
                        className="text-xs"
                      >
                        {role.name}
                      </Chip>
                    ))
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                  {staffMember.roles && staffMember.roles.length > 1 && (
                    <Chip
                      size="sm"
                      variant="bordered"
                      className="text-xs"
                    >
                      +{staffMember.roles.length - 1}
                    </Chip>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <p className="text-gray-600 text-sm">{staffMember.phoneNumber || "-"}</p>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-1 flex-wrap">
                  {staffMember.coverageAreas && staffMember.coverageAreas.length > 0 ? (
                    staffMember.coverageAreas.slice(0, 1).map((area) => (
                      <Chip
                        key={area.id}
                        size="sm"
                        variant="flat"
                        color="default"
                        className="text-xs"
                      >
                        {area.name}
                      </Chip>
                    ))
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                  {staffMember.coverageAreas && staffMember.coverageAreas.length > 1 && (
                    <Chip
                      size="sm"
                      variant="bordered"
                      className="text-xs"
                    >
                      +{staffMember.coverageAreas.length - 1}
                    </Chip>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <Chip
                  size="sm"
                  variant="flat"
                  color={getStatusColor(staffMember.isActive)}
                  className="text-xs font-medium"
                >
                  {getStatusText(staffMember.isActive)}
                </Chip>
              </td>
              <td className="px-6 py-4">
                <p className="text-gray-600 text-sm">
                  {new Date(staffMember.createdAt).toLocaleDateString()}
                </p>
              </td>
              <td className="px-6 py-4">
                <div className="flex justify-center">
                  <Dropdown>
                    <DropdownTrigger>
                      <Button isIconOnly variant="light" size="sm">
                        <MoreHorizontal className="text-lg text-gray-600" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu variant="faded" color="default">
                      <DropdownSection>
                        <DropdownItem
                          key="edit"
                          startContent={<Edit3 className="text-lg" />}
                          onPress={() => onEditStaff?.(staffMember.id)}
                        >
                          Edit
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 className="text-lg" />}
                          onPress={() => onDeleteStaff?.(staffMember.id, staffMember.fullName)}
                        >
                          Delete
                        </DropdownItem>
                      </DropdownSection>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
