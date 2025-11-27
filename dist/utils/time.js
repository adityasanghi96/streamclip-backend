"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOlderThan = isOlderThan;
function isOlderThan(date, hours) {
    return (new Date().getTime() - new Date(date).getTime()) > hours * 60 * 60 * 1000;
}
