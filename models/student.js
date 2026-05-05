const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
    fullName: { 
        type: String, 
        required: true, 
        trim: true,
        match: [/^[A-Za-z\s]+$/, "Full name should only contain letters and spaces"]
    },
    dob: { type: Date, required: true },
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true,
        trim: true,
        match: [/.+\@.+\..+/, "Please provide a valid email address"]
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
        match: [/^\d{10,15}$/, "Please provide a valid phone number"]
    },
    lgaOrigin: { type: String, required: true },
    stateOrigin: { type: String, required: true },
    address: { type: String, required: true },
    stateResidence: { type: String, required: true },
    institution: { type: String, required: true },
    course: { type: String, required: true },
    receivedBursary: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Student", studentSchema);
