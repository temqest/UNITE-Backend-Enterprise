"use strict";
/**
 * TypeScript types for the chat module
 * Defines interfaces for one-to-one messaging between users
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageType = void 0;
// Message types enum
var MessageType;
(function (MessageType) {
    MessageType["TEXT"] = "text";
    MessageType["IMAGE"] = "image";
    MessageType["FILE"] = "file";
    MessageType["VIDEO"] = "video";
    MessageType["LINK"] = "link";
})(MessageType || (exports.MessageType = MessageType = {}));
