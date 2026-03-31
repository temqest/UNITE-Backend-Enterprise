"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/dropdown";
import { Chip } from "@heroui/chip";
import { Plus, Magnifier } from "@gravity-ui/icons";
import type { StaffFilters } from "@/types/coordinator.types";

interface StaffToolbarProps {
  searchQuery: string;
  filters: StaffFilters;
  onSearch: (query: string) => void;
  onFilter: (key: string, value: any) => void;
  onClearFilters: () => void;
  onAddStaff: () => void;
}

export default function StaffToolbar({
  searchQuery,
  filters,
  onSearch,
  onFilter,
  onClearFilters,
  onAddStaff,
}: StaffToolbarProps) {
  const activeFilterCount = Object.values(filters).filter(
    (v) => v && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  return (
    <div className="space-y-4">
      {/* Search and Add Button Row */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Input
            isClearable
            className="w-full"
            placeholder="Search by name or email..."
            startContent={<Magnifier className="text-lg text-gray-400" />}
            value={searchQuery}
            onValueChange={onSearch}
            onClear={() => onSearch("")}
          />
        </div>
        <Button
          onPress={onAddStaff}
          color="danger"
          startContent={<Plus className="text-lg" />}
          className="font-semibold"
        >
          Add Staff
        </Button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex gap-2 flex-wrap">
          {activeFilterCount > 0 && (
            <>
              {filters.role && filters.role.length > 0 && (
                <Chip
                  variant="flat"
                  onClose={() => onFilter("role", [])}
                  className="bg-blue-50"
                >
                  Role: {filters.role.join(", ")}
                </Chip>
              )}
              {filters.organizationType && filters.organizationType.length > 0 && (
                <Chip
                  variant="flat"
                  onClose={() => onFilter("organizationType", [])}
                  className="bg-green-50"
                >
                  Type: {filters.organizationType.join(", ")}
                </Chip>
              )}
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={onClearFilters}
                className="text-gray-600"
              >
                ✕ Clear all
              </Button>
            </>
          )}
        </div>

        {/* Quick Filter Dropdowns */}
        <div className="flex gap-2 ml-auto">
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="bordered" size="sm">
                Filter by Role
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              selectionMode="multiple"
              selectedKeys={new Set(filters.role || [])}
              onSelectionChange={(keys) =>
                onFilter("role", Array.from(keys as Set<string>))
              }
            >
              <DropdownSection title="Staff Roles">
                <DropdownItem key="admin">System Admin</DropdownItem>
                <DropdownItem key="coordinator">Coordinator</DropdownItem>
                <DropdownItem key="doctor">Doctor</DropdownItem>
                <DropdownItem key="nurse">Nurse</DropdownItem>
                <DropdownItem key="staff">Medical Staff</DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>

          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="bordered" size="sm">
                Filter by Organization Type
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              selectionMode="multiple"
              selectedKeys={new Set(filters.organizationType || [])}
              onSelectionChange={(keys) =>
                onFilter("organizationType", Array.from(keys as Set<string>))
              }
            >
              <DropdownSection title="Organization Types">
                <DropdownItem key="LGU">LGU</DropdownItem>
                <DropdownItem key="NGO">NGO</DropdownItem>
                <DropdownItem key="Hospital">Hospital</DropdownItem>
                <DropdownItem key="RedCross">Red Cross</DropdownItem>
                <DropdownItem key="BloodBank">Blood Bank</DropdownItem>
                <DropdownItem key="Other">Other</DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
