const dotenv = require("dotenv");
dotenv.config();
const mongoose = require("mongoose");
const Student = require("./models/student");

async function checkAndMigrate() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected successfully!");

        const existingCoordinators = await Student.find({ volunteerPost: "Campus Coordinators" });
        console.log(`Found ${existingCoordinators.length} current Campus Coordinators:`);
        existingCoordinators.forEach(c => {
            console.log(`- ${c.fullName} (${c.institution}) - Email: ${c.email}`);
        });

        if (existingCoordinators.length > 0) {
            const result = await Student.updateMany(
                { volunteerPost: "Campus Coordinators" },
                { $set: { volunteerPost: "Student" } }
            );
            console.log(`Migration complete! Modified ${result.modifiedCount} records from Campus Coordinators to Student.`);
        } else {
            console.log("No Campus Coordinators needed migration.");
        }

        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    } catch (err) {
        console.error("Migration error:", err);
        process.exit(1);
    }
}

checkAndMigrate();
