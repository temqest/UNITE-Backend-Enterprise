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
exports.validateStaffUpdate = exports.validateStaffCreate = exports.validateStaffListQuery = exports.validateUserIdParam = exports.staffUpdateSchema = exports.staffCreateSchema = exports.staffListQuerySchema = exports.userIdParamSchema = void 0;
const z = __importStar(require("zod"));
const staffRoleSchema = z
    .string()
    .trim()
    .min(1, 'Role is required');
const sectorSchema = z.enum(['LGU', 'NON-LGU', 'Others', 'none']);
const optionalText = z
    .string()
    .trim()
    .optional();
exports.userIdParamSchema = z.object({
    id: z.string().uuid('User ID must be a valid UUID'),
});
exports.staffListQuerySchema = z.object({
    role: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
});
exports.staffCreateSchema = z.object({
    first_name: z.string().trim().min(1, 'First name is required').max(50),
    last_name: z.string().trim().min(1, 'Last name is required').max(50),
    email: z.string().email('Email must be a valid email address').toLowerCase().trim(),
    password: z.string().min(6, 'Password must be at least 6 characters long').max(128),
    role: staffRoleSchema,
    sector: sectorSchema,
    force_password_change: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    province: optionalText,
    district: optionalText,
    municipality: optionalText,
    geographic_designations: z.array(z.record(z.string(), z.any())).optional(),
});
exports.staffUpdateSchema = z.object({
    first_name: z.string().trim().min(1).max(50).optional(),
    last_name: z.string().trim().min(1).max(50).optional(),
    email: z.string().email().toLowerCase().trim().optional(),
    role: staffRoleSchema.optional(),
    sector: sectorSchema.optional(),
    phone_number: optionalText,
    geographic_area: optionalText,
    geographic_designations: z.array(z.record(z.string(), z.any())).optional(),
    province: optionalText,
    district: optionalText,
    municipality: optionalText,
});
function formatZodError(error) {
    return error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
    }));
}
const validateUserIdParam = (data) => {
    const result = exports.userIdParamSchema.safeParse(data);
    if (result.success)
        return { success: true, data: result.data };
    return { success: false, error: formatZodError(result.error) };
};
exports.validateUserIdParam = validateUserIdParam;
const validateStaffListQuery = (data) => {
    const result = exports.staffListQuerySchema.safeParse(data);
    if (result.success)
        return { success: true, data: result.data };
    return { success: false, error: formatZodError(result.error) };
};
exports.validateStaffListQuery = validateStaffListQuery;
const validateStaffCreate = (data) => {
    const result = exports.staffCreateSchema.safeParse(data);
    if (result.success)
        return { success: true, data: result.data };
    return { success: false, error: formatZodError(result.error) };
};
exports.validateStaffCreate = validateStaffCreate;
const validateStaffUpdate = (data) => {
    const result = exports.staffUpdateSchema.safeParse(data);
    if (result.success)
        return { success: true, data: result.data };
    return { success: false, error: formatZodError(result.error) };
};
exports.validateStaffUpdate = validateStaffUpdate;
