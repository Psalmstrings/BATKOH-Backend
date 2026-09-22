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

    // ── Renamed from lgaOrigin ──
    lgaOfRegistration: {
      type: String,
      required: true,
      enum: [
        "AGEGE",
        "AJEROMI/IFELODUN",
        "ALIMOSHO",
        "AMUWO-ODOFIN",
        "APAPA",
        "BADAGRY",
        "EPE",
        "ETI-OSA",
        "IBEJU/LEKKI",
        "IFAKO-IJAYE",
        "IKEJA",
        "IKORODU",
        "KOSOFE",
        "LAGOS ISLAND",
        "LAGOS MAINLAND",
        "MUSHIN",
        "0J0",
        "OSHODI/ISOLO",
        "SOMOLU",
        "SURULERE"
      ],
    },

    // ── Renamed from stateOrigin ──
    stateOfRegistration: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },

    stateResidence: {
      type: String,
      required: false,
      default: "",
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

    volunteerPost: {
      type: String,
      required: true,
      enum: [
        // Admin-registered roles (do not appear in public form)
        "Director",
        "State Coordinator",
        "Deputy Coordinator",
        "State Working Committee",
        "Campus Coordinators",
        "Campus Captains",
        "Staff Captains",
        // Legacy values kept for existing records
        "Members",
        "NFSAN Member",
        // Public registration roles (appear in form)
        "Student",
        "Staff",
      ],
    },


    /**
     * REFERRAL / COUPON SYSTEM
     */

    // Unique referral code.
    // Generated for Campus Captains, Staff Captains, Campus Coordinators.
    couponCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    // Code entered by a member during registration.
    usedCouponCode: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    // The coordinator/captain who referred this member.
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },

    receivedBursary: {
      type: Boolean,
      default: false,
    },

    // Whether student has a Permanent Voter's Card (PVC)
    hasPvc: {
      type: Boolean,
      default: false,
    },

    // Voter Identification Number — Nigerian INEC
    // Must be 17–20 alphanumeric characters.
    // unique + sparse so multiple empty/null values are allowed.
    vin: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      required: true,
      validate: {
        validator: function (v) {
          if (!v || v.trim() === "") return true;
          return /^[A-Z0-9]{17,20}$/.test(v.trim().toUpperCase());
        },
        message:
          "VIN must contain only letters and numbers and be between 17 and 20 characters.",
      },
    },

    // Optional customized password for Campus/Staff Captains
    password: {
      type: String,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
    mongoose.models.Student ||
    mongoose.model("Student", studentSchema);