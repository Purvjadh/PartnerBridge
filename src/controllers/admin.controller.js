// src/controllers/admin.controller.js
import { asyncHandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/apierror.js";
import { ApiResponse } from "../utils/apiresponse.js";
import { User } from "../models/user.model.js";
import { Organization } from "../models/organization.model.js";
import mongoose from "mongoose";

// @desc    Get all users (with filters)
// @route   GET /api/v1/admin/users
// @access  Private (Admin only)
export const getAllUsers = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 10, 
        role, 
        status,
        search,
        sortBy = "createdAt",
        sortOrder = "desc"
    } = req.query;

    // Build query
    const query = {};

    // Super admin sees all, admin sees only their organization
    if (req.user.role !== "super_admin" && req.user.organization) {
        query.organization = req.user.organization;
    }

    if (role) query.role = role;
    if (status) query.status = status;

    // Search by name or email
    if (search) {
        query.$or = [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
        ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Execute query
    const users = await User.find(query)
        .populate("organization", "name")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .select("-password -refreshToken");

    const totalUsers = await User.countDocuments(query);

    return res.status(200).json(
        new ApiResponse(200, {
            users: users.map(user => user.getSanitizedUser()),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalUsers,
                totalPages: Math.ceil(totalUsers / parseInt(limit))
            }
        }, "Users fetched successfully")
    );
});

// @desc    Get single user by ID
// @route   GET /api/v1/admin/users/:id
// @access  Private (Admin only)
export const getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, "Invalid user ID");
    }

    const user = await User.findById(id)
        .populate("organization", "name")
        .select("-password -refreshToken");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Check organization access
    if (req.user.role !== "super_admin" && 
        req.user.organization?.toString() !== user.organization?.toString()) {
        throw new ApiError(403, "Access denied to this user");
    }

    return res.status(200).json(
        new ApiResponse(200, {
            user: user.getSanitizedUser()
        }, "User fetched successfully")
    );
});

// @desc    Create new user (Admin only)
// @route   POST /api/v1/admin/users
// @access  Private (Admin only)
export const createUser = asyncHandler(async (req, res) => {
    const { 
        email, 
        password,
        firstName, 
        lastName, 
        role,
        organizationId,
        partnerTier,
        commissionRate,
        phoneNumber,
        companyName
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new ApiError(409, "User with this email already exists");
    }

    // Set organization
    let organization = organizationId;
    if (!organization && req.user.role !== "super_admin") {
        organization = req.user.organization;
    }

    // Validate organization
    if (organization) {
        const orgExists = await Organization.findById(organization);
        if (!orgExists) {
            throw new ApiError(404, "Organization not found");
        }
    }

    // Validate partner fields
    if (role === "partner") {
        if (!partnerTier || !commissionRate) {
            throw new ApiError(400, "Partner tier and commission rate are required for partner role");
        }
    }

    // Create user
    const user = await User.create({
        email,
        password: password || "Default@123", // Should be generated randomly
        firstName,
        lastName,
        role,
        organization,
        partnerTier: role === "partner" ? partnerTier : undefined,
        commissionRate: role === "partner" ? commissionRate : undefined,
        phoneNumber,
        companyName: role === "client" ? companyName : undefined,
        status: "active",
        createdBy: req.user._id
    });

    const createdUser = await User.findById(user._id)
        .populate("organization", "name")
        .select("-password -refreshToken");

    return res.status(201).json(
        new ApiResponse(201, {
            user: createdUser.getSanitizedUser()
        }, "User created successfully")
    );
});

// @desc    Update user
// @route   PUT /api/v1/admin/users/:id
// @access  Private (Admin only)
export const updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Remove sensitive fields
    delete updates.password;
    delete updates._id;
    delete updates.refreshToken;

    const user = await User.findById(id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Check organization access
    if (req.user.role !== "super_admin" && 
        req.user.organization?.toString() !== user.organization?.toString()) {
        throw new ApiError(403, "Access denied to this user");
    }

    // Update user
    Object.assign(user, updates);
    await user.save();

    const updatedUser = await User.findById(id)
        .populate("organization", "name")
        .select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, {
            user: updatedUser.getSanitizedUser()
        }, "User updated successfully")
    );
});

// @desc    Delete user (soft delete)
// @route   DELETE /api/v1/admin/users/:id
// @access  Private (Admin only)
export const deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Prevent self-deletion
    if (user._id.toString() === req.user._id.toString()) {
        throw new ApiError(400, "You cannot delete your own account");
    }

    // Check organization access
    if (req.user.role !== "super_admin" && 
        req.user.organization?.toString() !== user.organization?.toString()) {
        throw new ApiError(403, "Access denied to this user");
    }

    // Soft delete
    user.status = "inactive";
    await user.save();

    return res.status(200).json(
        new ApiResponse(200, {}, "User deleted successfully")
    );
});

// @desc    Update user status
// @route   PATCH /api/v1/admin/users/:id/status
// @access  Private (Admin only)
export const updateUserStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "inactive", "suspended"].includes(status)) {
        throw new ApiError(400, "Invalid status value");
    }

    const user = await User.findById(id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Prevent self status change
    if (user._id.toString() === req.user._id.toString()) {
        throw new ApiError(400, "You cannot change your own status");
    }

    // Check organization access
    if (req.user.role !== "super_admin" && 
        req.user.organization?.toString() !== user.organization?.toString()) {
        throw new ApiError(403, "Access denied to this user");
    }

    user.status = status;
    await user.save();

    return res.status(200).json(
        new ApiResponse(200, {
            user: user.getSanitizedUser()
        }, `User status updated to ${status}`)
    );
});

// @desc    Get partners list
// @route   GET /api/v1/admin/partners
// @access  Private (Admin only)
export const getPartners = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, tier, kycStatus } = req.query;

    const query = { role: "partner" };

    if (req.user.role !== "super_admin" && req.user.organization) {
        query.organization = req.user.organization;
    }

    if (tier) query.partnerTier = tier;
    if (kycStatus) query.kycStatus = kycStatus;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const partners = await User.find(query)
        .populate("organization", "name")
        .sort("-createdAt")
        .skip(skip)
        .limit(parseInt(limit))
        .select("-password -refreshToken");

    const totalPartners = await User.countDocuments(query);

    return res.status(200).json(
        new ApiResponse(200, {
            partners: partners.map(p => p.getSanitizedUser()),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalPartners,
                totalPages: Math.ceil(totalPartners / parseInt(limit))
            }
        }, "Partners fetched successfully")
    );
});

// @desc    Update partner tier
// @route   PATCH /api/v1/admin/partners/:id/tier
// @access  Private (Admin only)
export const updatePartnerTier = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { tier, commissionRate } = req.body;

    const partner = await User.findOne({ _id: id, role: "partner" });
    if (!partner) {
        throw new ApiError(404, "Partner not found");
    }

    partner.partnerTier = tier;
    if (commissionRate) {
        partner.commissionRate = commissionRate;
    }
    await partner.save();

    return res.status(200).json(
        new ApiResponse(200, {
            partner: partner.getSanitizedUser()
        }, "Partner tier updated successfully")
    );
});

// @desc    Verify partner KYC
// @route   PATCH /api/v1/admin/partners/:id/kyc
// @access  Private (Admin only)
export const verifyPartnerKYC = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!["verified", "rejected"].includes(status)) {
        throw new ApiError(400, "Invalid KYC status");
    }

    const partner = await User.findOne({ _id: id, role: "partner" });
    if (!partner) {
        throw new ApiError(404, "Partner not found");
    }

    partner.kycStatus = status;
    partner.kycRemarks = remarks;
    await partner.save();

    return res.status(200).json(
        new ApiResponse(200, {
            partner: partner.getSanitizedUser()
        }, `KYC ${status} successfully`)
    );
});