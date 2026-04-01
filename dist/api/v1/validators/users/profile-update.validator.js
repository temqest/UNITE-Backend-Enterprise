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
exports.validateProfileUpdate = exports.profileUpdateSchema = void 0;
const z = __importStar(require("zod"));
exports.profileUpdateSchema = z.object({
    firstName: z
        .string()
        .min(1, 'First name must not be empty')
        .max(50, 'First name must not exceed 50 characters')
        .trim()
        .optional(),
    lastName: z
        .string()
        .min(1, 'Last name must not be empty')
        .max(50, 'Last name must not exceed 50 characters')
        .trim()
        .optional(),
    geographicArea: z
        .string()
        .max(100, 'Geographic area must not exceed 100 characters')
        .trim()
        .optional()
        .nullable(),
    role: z
        .enum(['admin', 'staff'])
        .optional(),
}).refine((data) => {
    const hasAtLeastOneField = Object.values(data).some((value) => value !== undefined && value !== null);
    return hasAtLeastOneField;
}, { message: 'At least one field must be provided for update' });
const validateProfileUpdate = (data) => {
    try {
        const result = exports.profileUpdateSchema.parse(data);
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
exports.validateProfileUpdate = validateProfileUpdate;
