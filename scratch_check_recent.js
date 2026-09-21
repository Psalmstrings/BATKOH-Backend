require('dotenv').config();
const mongoose = require('mongoose');

async function checkRecent() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Student = require('./models/student');
        const recent = await Student.find().sort({ createdAt: -1 }).limit(10).select('fullName volunteerPost couponCode usedCouponCode createdAt');
        console.log('Recent 10 records:', JSON.stringify(recent, null, 2));

        const staffCaptains = await Student.find({ volunteerPost: /Staff/i }).select('fullName volunteerPost couponCode usedCouponCode createdAt');
        console.log('All Staff records:', JSON.stringify(staffCaptains, null, 2));
    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
checkRecent();
