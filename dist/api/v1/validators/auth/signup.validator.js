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
exports.validateSignup = exports.signupSchema = exports.signupStaffSchema = exports.signupAdminSchema = void 0;
const z = __importStar(require("zod"));
const passwordSchema = z
    .string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .refine((password) => /[A-Z]/.test(password), { message: 'Password must contain at least one uppercase letter' })
    .refine((password) => /[a-z]/.test(password), { message: 'Password must contain at least one lowercase letter' })
    .refine((password) => /\d/.test(password), { message: 'Password must contain at least one number' })
    .refine((password) => /[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?]/.test(password), { message: 'Password must contain at least one special character' });
const baseSignupSchema = z.object({
    email: z
        .string()
        .min(1, { message: 'Email is required' })
        .email({ message: 'Email must be a valid email address' })
        .toLowerCase(),
    password: passwordSchema,
    first_name: z
        .string()
        .min(1, { message: 'First name is required' })
        .max(100, { message: 'First name must not exceed 100 characters' }),
    last_name: z
        .string()
        .min(1, { message: 'Last name is required' })
        .max(100, { message: 'Last name must not exceed 100 characters' }),
});
exports.signupAdminSchema = baseSignupSchema.extend({
    variant: z.literal('admin').optional(),
    organization_name: z
        .string()
        .min(1, { message: 'Organization name is required' })
        .max(255, { message: 'Organization name must not exceed 255 characters' }),
});
exports.signupStaffSchema = baseSignupSchema.extend({
    variant: z.literal('staff'),
    invitation_code: z
        .string()
        .min(1, { message: 'Invitation code is required' }),
});
exports.signupSchema = z.union([exports.signupAdminSchema, exports.signupStaffSchema]);
const validateSignup = (data) => {
    const result = exports.signupSchema.safeParse(data);
    if (result.success) {
        return { data: result.data, error: null };
    }
    return { data: null, error: result.error };
};
exports.validateSignup = validateSignup;
