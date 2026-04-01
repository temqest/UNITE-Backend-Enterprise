"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toInventoryError = toInventoryError;
function toInventoryError(code, message, details) {
    return { code, message, details };
}
