// src/middlewares/rbac.middleware.js
import { ApiError } from "../utils/apierror.js";

export const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new ApiError(401, "Unauthorized - Please login");
        }

        if (!allowedRoles.includes(req.user.role)) {
            throw new ApiError(403, `Access denied. Required role: ${allowedRoles.join(" or ")}`);
        }

        next();
    };
};

// Specific role checkers
export const isAdmin = (req, res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized - Please login");
    }
    
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        throw new ApiError(403, "Access denied. Admin access required.");
    }
    
    next();
};

export const isSuperAdmin = (req, res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Unauthorized - Please login");
    }
    
    if (req.user.role !== "super_admin") {
        throw new ApiError(403, "Access denied. Super Admin access required.");
    }
    
    next();
};