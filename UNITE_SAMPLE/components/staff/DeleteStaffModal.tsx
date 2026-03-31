"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { AlertTriangle } from "lucide-react";

interface DeleteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  staffName: string;
  isDeleting?: boolean;
}

export default function DeleteStaffModal({
  isOpen,
  onClose,
  onConfirm,
  staffName,
  isDeleting = false,
}: DeleteStaffModalProps) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Error deleting staff:", error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      backdrop="blur"
      isDismissable={!isDeleting}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 items-center">
          <div className="p-3 bg-red-100 rounded-full">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mt-3">
            Delete Staff Member?
          </h2>
        </ModalHeader>

        <ModalBody>
          <p className="text-gray-600 text-center">
            Are you sure you want to delete<br />
            <span className="font-semibold text-gray-900">{staffName}</span>?
          </p>
          <p className="text-sm text-gray-500 text-center">
            This action cannot be undone. The staff member's account will be permanently deleted from the system.
          </p>
        </ModalBody>

        <ModalFooter className="flex gap-2 justify-center">
          <Button
            color="default"
            variant="light"
            onPress={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            color="danger"
            onPress={handleConfirm}
            isLoading={isDeleting}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Spinner size="sm" color="current" />
            ) : (
              "Delete Staff"
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
