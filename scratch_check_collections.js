require('dotenv').config();
const mongoose = require('mongoose');

async function checkCollections() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const admin = new mongoose.mongo.Admin(mongoose.connection.db);
        const dbs = await admin.listDatabases();
        console.log('Databases:', JSON.stringify(dbs, null, 2));

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections in current DB (' + mongoose.connection.db.databaseName + '):', collections.map(c => c.name));

        // Check all collections for couponCode matching 5186 or STAFF
        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(`Collection ${col.name} count: ${count}`);
            const staff = await mongoose.connection.db.collection(col.name).find({ $or: [{ couponCode: /5186/ }, { couponCode: /STAFF/i }] }).toArray();
            if (staff.length > 0) {
                console.log(`Found in ${col.name}:`, staff);
            }
        }
    } catch(err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}
checkCollections();
