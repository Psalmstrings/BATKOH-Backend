const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
{
    fullName: { 
        type: String, 
        required: true, 
        trim: true,
    },

    dob: { type: Date, required: true },

    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true, 
        trim: true 
    },

    gender: { 
        type: String, 
        required: true, 
        enum: ["Male", "Female", "Other"] 
    },

    phone: { 
        type: String, 
        required: true, 
        trim: true,
    },

    lgaOrigin: { type: String, required: true },
    stateOrigin: { type: String, required: true },
    address: { type: String, required: true },
    stateResidence: { type: String, required: true },
    institution: { type: String, required: true },
    course: { type: String, required: true },

    volunteerPost: {
        type: String,
        required: true,
        enum: [
            "Director",
            "State Coordinator",
            "Deputy Coordinator",
            "State Working Committee",
            "Campus Coordinators",
            "Campus Captains",
            "Members"
        ]
    },

    /**
     * COUPON SYSTEM FIELDS
     */

    // Only Campus Coordinators get this
   couponCode: {
        type: String,
        unique: true,
        sparse: true
        },

        usedCouponCode: {
        type: String,
        index: true
        },

    // Links a member directly to a coordinator (ObjectId)
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
    },

    receivedBursary: { type: Boolean, default: false },
},
{ timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);