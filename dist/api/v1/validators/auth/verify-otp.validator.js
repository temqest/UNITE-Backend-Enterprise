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
exports.validateVerifyOtp = exports.verifyOtpSchema = void 0;
const z = __importStar(require("zod"));
exports.verifyOtpSchema = z.object({
    email: z
        .string()
        .min(1, { message: 'Email is required' })
        .email({ message: 'Email must be a valid email address' })
        .toLowerCase(),
    code: z
        .string()
        .length(6, { message: 'Code must be exactly 6 digits' })
        .regex(/^\d{6}$/, { message: 'Code must contain only digits' }),
    authUserId: z
        .string()
        .min(1, { message: 'authUserId is required' })
        .uuid({ message: 'authUserId must be a valid UUID' }),
});
const validateVerifyOtp = (data) => {
    const result = exports.verifyOtpSchema.safeParse(data);
    if (result.success) {
        return { data: result.data, error: null };
    }
    return { data: null, error: result.error };
};
exports.validateVerifyOtp = validateVerifyOtp;
