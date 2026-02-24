// src/controllers/auth.controller.js
import { asyncHandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/apierror.js";
import { ApiResponse } from "../utils/apiresponse.js";
import { User } from "../models/user.model.js";
import { Organization } from "../models/organization.model.js";
import jwt from "jsonwebtoken";

const generateTokens = async (user) => {
    try {
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Token generation error:", error);
        throw new ApiError(500, "Something went wrong while generating tokens");
    }
};

const setTokenCookies = (res, accessToken, refreshToken) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    };

    res.cookie("accessToken", accessToken, {
        ...cookieOptions,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.cookie("refreshToken", refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/api/v1/auth/refresh-token"
    });
};

// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public
export const register = asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, role, companyName, phoneNumber } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new ApiError(409, "User with this email already exists");
    }

    // ✅ FIX: Remove any undefined fields
    const userData = {
        email,
        password,
        firstName,
        lastName,
        role: role || "client",
        phoneNumber,
        status: "active"
    };

    // Only add companyName if role is client and companyName exists
    if (role === "client" && companyName) {
        userData.companyName = companyName;
    }

    // Create user
    const user = await User.create(userData);

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    return res.status(201).json(
        new ApiResponse(201, {
            user: createdUser
        }, "User registered successfully")
    );
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
        throw new ApiError(401, "Invalid credentials");
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }

    // Check status
    if (user.status !== "active") {
        throw new ApiError(403, `Your account is ${user.status}. Please contact admin.`);
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user);

    // Get organization if exists
    let organization = null;
    if (user.organization) {
        organization = await Organization.findById(user.organization);
    }

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    // Get sanitized user
    const sanitizedUser = user.getSanitizedUser();

    // Determine dashboard route based on role
    const dashboardRoutes = {
        super_admin: "/super-admin/dashboard",
        admin: "/admin/dashboard",
        employee: "/employee/dashboard",
        client: "/client/dashboard",
        partner: "/partner/dashboard"
    };

    return res.status(200).json(
        new ApiResponse(200, {
            user: sanitizedUser,
            organization,
            tokens: {
                accessToken,
                refreshToken
            },
            dashboard: dashboardRoutes[user.role] || "/dashboard"
        }, "Login successful")
    );
});

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: { refreshToken: 1 }
        },
        { new: true }
    );

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
    };

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", { ...cookieOptions, path: "/api/v1/auth/refresh-token" });

    return res.status(200).json(
        new ApiResponse(200, {}, "Logged out successfully")
    );
});

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decodedToken._id);

        if (!user || user.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Invalid refresh token");
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user);
        setTokenCookies(res, accessToken, newRefreshToken);

        return res.status(200).json(
            new ApiResponse(200, {
                accessToken,
                refreshToken: newRefreshToken
            }, "Access token refreshed")
        );
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
export const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .populate("organization", "name type logo")
        .select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, {
            user: user.getSanitizedUser(),
            organization: user.organization
        }, "Current user fetched successfully")
    );
});