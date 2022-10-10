"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderLogs = void 0;
require('dotenv').config();
const logger_1 = require("@subsquid/logger");
function renderLogs(msg, child) {
    if (process.env.STOR_WITH_CACHE_DEBUG !== 'true')
        return;
    let logger = (0, logger_1.createLogger)('sqd:processor');
    logger.child(child).info(msg);
}
exports.renderLogs = renderLogs;
//# sourceMappingURL=innerUtils.js.map