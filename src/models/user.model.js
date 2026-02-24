// src/models/user.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserRoles, UserStatus, PartnerTiers } from "../constants.js";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please enter valid email"]
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters"],
        select: false
    },
    firstName: {
        type: String,
        required: [true, "First name is required"],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, "Last name is required"],
        trim: true
    },
    role: {
        type: String,
        enum: Object.values(UserRoles),
        required: true
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization"
    },
    status: {
        type: String,
        enum: Object.values(UserStatus),
        default: UserStatus.ACTIVE
    },
    partnerTier: {
        type: String,
        enum: Object.values(PartnerTiers),
        required: function() {
            return this.role === UserRoles.PARTNER;
        }
    },
    commissionRate: {
        type: Number,
        min: 0,
        max: 100,
        required: function() {
            return this.role === UserRoles.PARTNER;
        }
    },
    kycStatus: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending"
    },
    phoneNumber: String,
    companyName: String,
    profileImage: String,
    refreshToken: String,
    lastLoginAt: Date,
    passwordChangedAt: Date,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, {
    timestamps: true
});

// ✅ FIXED: Hash password before saving with proper error handling
userSchema.pre("save", async function(next) {
    try {
        // Agar password modify nahi hua to next call karo
        if (!this.isModified("password")) {
            return next();
        }
        
        // Password hash karo
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        this.passwordChangedAt = new Date();
        
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

// Generate access token
userSchema.methods.generateAccessToken = function() {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            role: this.role,
            organization: this.organization
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d"
        }
    );
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function() {
    return jwt.sign(
        {
            _id: this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d"
        }
    );
};

// Get sanitized user object
userSchema.methods.getSanitizedUser = function() {
    return {
        _id: this._id,
        email: this.email,
        firstName: this.firstName,
        lastName: this.lastName,
        role: this.role,
        organization: this.organization,
        status: this.status,
        partnerTier: this.partnerTier,
        commissionRate: this.commissionRate,
        kycStatus: this.kycStatus,
        phoneNumber: this.phoneNumber,
        companyName: this.companyName,
        profileImage: this.profileImage,
        createdAt: this.createdAt
    };
};

export const User = mongoose.model("User", userSchema);