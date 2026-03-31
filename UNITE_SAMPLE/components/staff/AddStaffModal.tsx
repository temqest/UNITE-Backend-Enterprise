"use client";

import { useState, useEffect } from "react";
import * as z from "zod";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Checkbox } from "@heroui/checkbox";
import { Eye, EyeSlash as EyeOff } from "@gravity-ui/icons";
import { Spinner } from "@heroui/spinner";
import type { CreateStaffData } from "@/types/coordinator.types";

// Form state interface
interface AddStaffFormState {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  roleId: string;
  organizationType: string;
}

const validateForm = (data: AddStaffFormState): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  if (!data.firstName || data.firstName.length < 2) {
    errors.firstName = "First name must be at least 2 characters";
  }
  if (!data.lastName || data.lastName.length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  }
  if (!data.email || !data.email.includes("@")) {
    errors.email = "Invalid email address";
  }
  if (!data.password || data.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }
  if (data.password !== data.confirmPassword) {
    errors.confirmPassword = "Passwords don't match";
  }
  if (!data.roleId) {
    errors.roleId = "Please select a role";
  }
  
  return errors;
};

interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStaffData) => Promise<void>;
  isSubmitting?: boolean;
  getAllowedStaffTypes?: () => Promise<string[]>;
}

export default function AddStaffModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting: externalIsSubmitting = false,
  getAllowedStaffTypes,
}: AddStaffModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [formData, setFormData] = useState<AddStaffFormState>({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    roleId: "",
    organizationType: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load available roles when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRoles();
    }
  }, [isOpen]);

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      // Mock roles for now - in production, fetch from API
      const roles = [
        { id: "coordinator", name: "Coordinator" },
        { id: "doctor", name: "Doctor" },
        { id: "nurse", name: "Nurse" },
        { id: "staff", name: "Medical Staff" },
      ];
      setAvailableRoles(roles);
    } catch (error) {
      console.error("Failed to load roles", error);
    } finally {
      setLoadingRoles(false);
    }
  };

const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    const formErrors = validateForm(formData);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }
    
    setIsSubmittingLocal(true);
    try {
      const staffData: CreateStaffData = {
        firstName: formData.firstName,
        middleName: formData.middleName || undefined,
        lastName: formData.lastName,
        email: formData.email,
        phoneNumber: formData.phoneNumber || undefined,
        password: formData.password,
        roles: [formData.roleId],
        organizationType: (formData.organizationType || undefined) as any,
      };

      await onSubmit(staffData);
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        phoneNumber: "",
        password: "",
        confirmPassword: "",
        roleId: "",
        organizationType: "",
      });
      onClose();
    } catch (error: any) {
      console.error("Failed to add staff member", error);
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      backdrop="blur"
      isDismissable={!isSubmittingLocal && !externalIsSubmitting}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-gray-900">Add New Staff</h2>
          <p className="text-sm text-gray-600 font-normal">
            Create a new staff member account in your organization
          </p>
        </ModalHeader>

        <ModalBody className="gap-4">
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="John"
                value={formData.firstName}
                onChange={(e) => {
                  setFormData({ ...formData, firstName: e.target.value });
                  if (errors.firstName) setErrors({ ...errors, firstName: "" });
                }}
                isInvalid={!!errors.firstName}
                errorMessage={errors.firstName}
                disabled={isSubmittingLocal || externalIsSubmitting}
              />
              <Input
                label="Last Name"
                placeholder="Doe"
                value={formData.lastName}
                onChange={(e) => {
                  setFormData({ ...formData, lastName: e.target.value });
                  if (errors.lastName) setErrors({ ...errors, lastName: "" });
                }}
                isInvalid={!!errors.lastName}
                errorMessage={errors.lastName}
                disabled={isSubmittingLocal || externalIsSubmitting}
              />
            </div>

            {/* Middle Name */}
            <Input
              label="Middle Name (Optional)"
              placeholder="Maria"
              value={formData.middleName}
              onChange={(e) =>
                setFormData({ ...formData, middleName: e.target.value })
              }
              disabled={isSubmittingLocal || externalIsSubmitting}
            />

            {/* Email */}
            <Input
              label="Email Address"
              placeholder="john.doe@health.org"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: "" });
              }}
              isInvalid={!!errors.email}
              errorMessage={errors.email}
              disabled={isSubmittingLocal || externalIsSubmitting}
            />

            {/* Phone Number */}
            <Input
              label="Phone Number (Optional)"
              placeholder="+1 234 567 8900"
              value={formData.phoneNumber}
              onChange={(e) =>
                setFormData({ ...formData, phoneNumber: e.target.value })
              }
              disabled={isSubmittingLocal || externalIsSubmitting}
            />

            {/* Role Selection */}
            <Select
              label="Role"
              placeholder="Select a role"
              isLoading={loadingRoles}
              isDisabled={loadingRoles || isSubmittingLocal || externalIsSubmitting}
              isInvalid={!!errors.roleId}
              errorMessage={errors.roleId}
              selectedKeys={formData.roleId ? [formData.roleId] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                setFormData({ ...formData, roleId: selected });
                if (errors.roleId) setErrors({ ...errors, roleId: "" });
              }}
            >
              {availableRoles.map((role) => (
                <SelectItem key={role.id}>{role.name}</SelectItem>
              ))}
            </Select>

            {/* Organization Type (Optional) */}
            <Select
              label="Organization Type (Optional)"
              placeholder="Select organization type"
              disabled={isSubmittingLocal || externalIsSubmitting}
              selectedKeys={formData.organizationType ? [formData.organizationType] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                setFormData({ ...formData, organizationType: selected });
              }}
            >
              <SelectItem key="LGU">LGU</SelectItem>
              <SelectItem key="NGO">NGO</SelectItem>
              <SelectItem key="Hospital">Hospital</SelectItem>
              <SelectItem key="RedCross">Red Cross</SelectItem>
              <SelectItem key="BloodBank">Blood Bank</SelectItem>
              <SelectItem key="Other">Other</SelectItem>
            </Select>

            {/* Password Fields */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Password"
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (errors.password) setErrors({ ...errors, password: "" });
                }}
                isInvalid={!!errors.password}
                errorMessage={errors.password}
                endContent={
                  <button
                    className="focus:outline-none"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <Eye className="text-lg text-gray-600" />
                    ) : (
                      <EyeOff className="text-lg text-gray-600" />
                    )}
                  </button>
                }
                disabled={isSubmittingLocal || externalIsSubmitting}
              />
              <Input
                label="Confirm Password"
                placeholder="••••••••"
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData({ ...formData, confirmPassword: e.target.value });
                  if (errors.confirmPassword)
                    setErrors({ ...errors, confirmPassword: "" });
                }}
                isInvalid={!!errors.confirmPassword}
                errorMessage={errors.confirmPassword}
                endContent={
                  <button
                    className="focus:outline-none"
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                  >
                    {showConfirmPassword ? (
                      <Eye className="text-lg text-gray-600" />
                    ) : (
                      <EyeOff className="text-lg text-gray-600" />
                    )}
                  </button>
                }
                disabled={isSubmittingLocal || externalIsSubmitting}
              />
            </div>
          </form>
        </ModalBody>

        <ModalFooter>
          <Button
            color="default"
            variant="light"
            onPress={onClose}
            disabled={isSubmittingLocal || externalIsSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="danger"
            onPress={() => {
              handleFormSubmit();
            }}
            isLoading={isSubmittingLocal || externalIsSubmitting}
            disabled={isSubmittingLocal || externalIsSubmitting}
          >
            {isSubmittingLocal || externalIsSubmitting ? (
              <Spinner size="sm" color="current" />
            ) : (
              "Add Staff"
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
