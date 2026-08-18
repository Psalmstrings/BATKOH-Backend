const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    dob: {
      type: Date,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    gender: {
      type: String,
      required: true,
      enum: ["Male", "Female", "Other"],
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    lgaOrigin: {
      type: String,
      required: true,
    },

    stateOrigin: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },

    stateResidence: {
      type: String,
      required: true,
    },

   institution: {
    type: String,
    required: true,
    enum: [
        "UNILAG",
        "YABATECH",
        "LASU",
        "FCE",
        "OCEANOGRAPHY",
        "SACOED",
        "LASCON",
        "LASCOETH",
        "LASUSTECH",
        "LASUED",
    ],
    },

    course: {
      type: String,
      required: true,
    },

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
        "Members",
        "NFSAN Member",
      ],
    },

    /**
     * REFERRAL / COUPON SYSTEM
     */

    // Unique referral code.
    // Generated for:
    // - Campus Coordinators
    // - NFSAN Coordinators
    couponCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    // Code entered by a member during registration.
    // Used by:
    // - Members
    // - NFSAN Members
    usedCouponCode: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    // The coordinator who referred this member.
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    receivedBursary: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
    mongoose.models.Student ||
    mongoose.model("Student", studentSchema);