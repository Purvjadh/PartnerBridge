// src/routes/admin.routes.js
import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/rbac.middleware.js";
import {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    updateUserStatus,
    getPartners,
    updatePartnerTier,
    verifyPartnerKYC
} from "../controllers/admin.controller.js";

const router = Router();

// All admin routes require authentication and admin role
router.use(verifyJWT);
router.use(isAdmin);

// User management
router.route("/users")
    .get(getAllUsers)
    .post(createUser);

router.route("/users/:id")
    .get(getUserById)
    .put(updateUser)
    .delete(deleteUser);

router.patch("/users/:id/status", updateUserStatus);

// Partner management
router.get("/partners", getPartners);
router.patch("/partners/:id/tier", updatePartnerTier);
router.patch("/partners/:id/kyc", verifyPartnerKYC);

export default router;