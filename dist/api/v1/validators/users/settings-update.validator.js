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
exports.validateSettingsUpdate = exports.settingsUpdateSchema = void 0;
const z = __importStar(require("zod"));
exports.settingsUpdateSchema = z.object({
    enableEmail: z
        .boolean()
        .optional(),
    enable_email_notifications: z
        .boolean()
        .optional(),
    enableInApp: z
        .boolean()
        .optional(),
    enable_in_app_notifications: z
        .boolean()
        .optional(),
    enableAll: z
        .boolean()
        .optional(),
    enable_all_notifications: z
        .boolean()
        .optional(),
    enableSms: z
        .boolean()
        .optional(),
    enable_sms_notifications: z
        .boolean()
        .optional(),
    enablePushNotifications: z
        .boolean()
        .optional(),
    enable_push_notifications: z
        .boolean()
        .optional(),
    enableEventNotifications: z
        .boolean()
        .optional(),
    enable_event_notifications: z
        .boolean()
        .optional(),
    enableOrgUpdates: z
        .boolean()
        .optional(),
    enable_org_updates: z
        .boolean()
        .optional(),
    emailDigestFrequency: z
        .enum(['daily', 'weekly', 'monthly', 'never'])
        .optional(),
    email_digest_frequency: z
        .enum(['daily', 'weekly', 'monthly', 'never'])
        .optional(),
    timezone: z
        .string()
        .max(100, 'Timezone must not exceed 100 characters')
        .optional(),
    language: z
        .string()
        .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Language must be a valid ISO 639-1 code (e.g., "en" or "en-US")')
        .optional(),
}).refine((data) => {
    const hasAtLeastOneField = Object.values(data).some((value) => value !== undefined);
    return hasAtLeastOneField;
}, { message: 'At least one setting must be provided for update' });
const validateSettingsUpdate = (data) => {
    try {
        const result = exports.settingsUpdateSchema.parse(data);
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
exports.validateSettingsUpdate = validateSettingsUpdate;
