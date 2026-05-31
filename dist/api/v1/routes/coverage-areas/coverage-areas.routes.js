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
exports.coverageAreasRouter = void 0;
const express_1 = require("express");
const async_handler_1 = require("../../../../lib/async-handler");
const auth_middleware_1 = require("../../../../middelware/auth.middleware");
const authorization_middleware_1 = require("../../../../middelware/authorization.middleware");
const validate_middleware_1 = require("../../../../middelware/validate.middleware");
const controller = __importStar(require("../../controllers/coverage-areas/coverage-areas.controller"));
const validators = __importStar(require("../../validators/coverage-areas/coverage-areas.validators"));
function schemaValidator(schema) {
    return {
        validate: (payload) => {
            const parsed = schema.safeParse(payload);
            if (!parsed.success) {
                return { success: false, error: parsed.error.issues };
            }
            return { success: true, data: parsed.data };
        },
    };
}
const router = (0, express_1.Router)();
exports.coverageAreasRouter = router;
router.use(auth_middleware_1.authMiddleware);
router.use(authorization_middleware_1.requireActiveUser);
router.use(authorization_middleware_1.requireOrgScope);
router.get('/', (0, authorization_middleware_1.authorize)('coverage.read'), (0, validate_middleware_1.validateMiddleware)(schemaValidator(validators.listCoverageAreasQuerySchema), 'query'), (0, async_handler_1.asyncHandler)(controller.listCoverageAreas));
router.get('/:id', (0, authorization_middleware_1.authorize)('coverage.read'), (0, async_handler_1.asyncHandler)(controller.getCoverageArea));
router.post('/', (0, authorization_middleware_1.authorize)('coverage.create'), (0, validate_middleware_1.validateMiddleware)(schemaValidator(validators.createCoverageAreaSchema)), (0, async_handler_1.asyncHandler)(controller.createCoverageArea));
router.patch('/:id', (0, authorization_middleware_1.authorize)('coverage.update'), (0, validate_middleware_1.validateMiddleware)(schemaValidator(validators.updateCoverageAreaSchema)), (0, async_handler_1.asyncHandler)(controller.updateCoverageArea));
router.delete('/:id', (0, authorization_middleware_1.authorize)('coverage.delete'), (0, async_handler_1.asyncHandler)(controller.deleteCoverageArea));
router.post('/:id/reconcile-events', (0, authorization_middleware_1.authorize)('coverage.update'), (0, async_handler_1.asyncHandler)(controller.reconcileEvents));
