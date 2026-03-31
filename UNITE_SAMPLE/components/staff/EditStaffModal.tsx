"use client";

import { useEffect } from "react";
import { useState } from "react";
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
import { Spinner } from "@heroui/spinner";
import type { StaffListItem, UpdateStaffData } from "@/types/coordinator.types";

// Form state interface
interface EditStaffFormState {
  firstName: string;
  middleName: string;
  lastName: string;
  phoneNumber: string;
  organizationType: string;
}

const validateForm = (data: EditStaffFormState): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  if (!data.firstName || data.firstName.length < 2) {
    errors.firstName = "First name must be at least 2 characters";
  }
  if (!data.lastName || data.lastName.length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  }
  
  return errors;
};

interface EditStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateStaffData) => Promise<void>;
  staff: StaffListItem;
  isSubmitting?: boolean;
  getAllowedStaffTypes?: () => Promise<string[]>;
}

export default function EditStaffModal({
  isOpen,
  onClose,
  onSubmit,
  staff,
  isSubmitting: externalIsSubmitting = false,
  getAllowedStaffTypes,
}: EditStaffModalProps) {
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [formData, setFormData] = useState<EditStaffFormState>({
    firstName: staff.firstName || "",
    middleName: staff.middleName || "",
    lastName: staff.lastName || "",
    phoneNumber: staff.phoneNumber || "",
    organizationType: staff.organizationType || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when staff changes
  useEffect(() => {
    if (staff && isOpen) {
      setFormData({
        firstName: staff.firstName || "",
        middleName: staff.middleName || "",
        lastName: staff.lastName || "",
        phoneNumber: staff.phoneNumber || "",
        organizationType: staff.organizationType || "",
      });
      setErrors({});
    }
  }, [staff, isOpen]);

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
      const updateData: UpdateStaffData = {
        firstName: formData.firstName,
        middleName: formData.middleName || undefined,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber || undefined,
        organizationType: (formData.organizationType || undefined) as any,
      };

      await onSubmit(updateData);
      onClose();
    } catch (error: any) {
      console.error("Failed to update staff member", error);
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
          <h2 className="text-xl font-semibold text-gray-900">Edit Staff Member</h2>
          <p className="text-sm text-gray-600 font-normal">
            {staff.email}
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

            {/* Email - Read only */}
            <Input
              label="Email Address"
              value={staff.email}
              isReadOnly
              disabled
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
              "Save Changes"
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
