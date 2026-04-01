"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateStaffApproval = exports.staffApprovalSchema = void 0;
const z = __importStar(require("zod"));
exports.staffApprovalSchema = z.object({
    userId: z
        .string()
        .uuid('User ID must be a valid UUID'),
    status: z
        .enum(['approve', 'reject']),
    roleType: z
        .string()
        .trim()
        .min(1, 'Role type cannot be empty')
        .max(64, 'Role type must not exceed 64 characters')
        .optional()
        .nullable(),
    sector: z
        .enum(['LGU', 'NON-LGU', 'Others', 'none'])
        .optional()
        .nullable(),
    reason: z
        .string()
        .max(500, 'Reason must not exceed 500 characters')
        .trim()
        .optional()
        .nullable(),
});
const validateStaffApproval = (data) => {
    try {
        const result = exports.staffApprovalSchema.parse(data);
        return { success: true, data: result };
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            const formattedError = error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return { success: false, error: formattedError };
        }
        return { success: false, error: 'Validation failed' };
    }
};
exports.validateStaffApproval = validateStaffApproval;
