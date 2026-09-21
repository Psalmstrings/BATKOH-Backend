require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Student = require('./models/student');
        const captains = await Student.find({ couponCode: { $exists: true, $ne: null } }).select('fullName email volunteerPost couponCode');
        console.log('Captains with couponCode:', JSON.stringify(captains, null, 2));

        const allPosts = await Student.distinct('volunteerPost');
        console.log('Distinct volunteerPosts in DB:', allPosts);

        const staffSearch = await Student.find({ couponCode: /STAFF/i }).select('fullName email volunteerPost couponCode');
        console.log('Staff couponCode search:', JSON.stringify(staffSearch, null, 2));
    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
