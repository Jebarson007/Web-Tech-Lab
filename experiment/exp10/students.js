// ============================================================================
// EXPERIMENT: WORKING WITH MONGODB USING SHELL COMMANDS (mongosh)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. DATABASE & COLLECTION MANAGEMENT
// ----------------------------------------------------------------------------

// List all existing databases on the MongoDB server
show dbs;

// Switch context to (or create if non-existent) database 'universityDB'
use universityDB;

// Confirm current active database context
db;

// Create an explicit collection named 'students'
db.createCollection("students");

// Display all collections in current database
show collections;


// ----------------------------------------------------------------------------
// 2. CREATE OPERATIONS (INSERTION)
// ----------------------------------------------------------------------------

// Insert a single document into 'students' collection
db.students.insertOne({
  student_id: 101,
  name: "Alice Smith",
  age: 20,
  major: "Computer Science",
  gpa: 3.8,
  skills: ["Python", "MongoDB"],
  enrollmentDate: new Date("2023-09-01")
});

// Insert multiple documents into 'students' collection
db.students.insertMany([
  {
    student_id: 102,
    name: "Bob Jones",
    age: 22,
    major: "Data Science",
    gpa: 3.4,
    skills: ["R", "Python", "SQL"],
    enrollmentDate: new Date("2022-09-01")
  },
  {
    student_id: 103,
    name: "Charlie Brown",
    age: 21,
    major: "Computer Science",
    gpa: 2.8,
    skills: ["Java", "C++"],
    enrollmentDate: new Date("2023-01-15")
  },
  {
    student_id: 104,
    name: "Diana Prince",
    age: 23,
    major: "Cybersecurity",
    gpa: 3.9,
    skills: ["Linux", "Python", "Networking"],
    enrollmentDate: new Date("2021-09-01")
  }
]);


// ----------------------------------------------------------------------------
// 3. READ OPERATIONS (QUERYING)
// ----------------------------------------------------------------------------

// Retrieve all documents in the collection
db.students.find();

// Retrieve documents matching exact filter criteria
db.students.find({ major: "Computer Science" });

// Query using comparison operator ($gte: Greater than or equal to)
db.students.find({ gpa: { $gte: 3.5 } });

// Query using logical operator ($or) and array value check
db.students.find({
  $or: [
    { major: "Cybersecurity" },
    { skills: "MongoDB" }
  ]
});

// Projection query: select specific fields (1 to include, 0 to exclude)
db.students.find({}, { name: 1, gpa: 1, major: 1, _id: 0 });

// Fetch a single document matching criteria
db.students.findOne({ student_id: 101 });

// Count total documents matching a specified condition
db.students.countDocuments({ major: "Computer Science" });


// ----------------------------------------------------------------------------
// 4. UPDATE OPERATIONS
// ----------------------------------------------------------------------------

// Update a single document using $set operator
db.students.updateOne(
  { student_id: 101 },
  { $set: { gpa: 3.9, age: 21 } }
);

// Append an element to an array field across multiple documents using $push
db.students.updateMany(
  { major: "Computer Science" },
  { $push: { skills: "Git" } }
);

// Increment a numeric value by 1 using $inc operator
db.students.updateOne(
  { student_id: 102 },
  { $inc: { age: 1 } }
);


// ----------------------------------------------------------------------------
// 5. INDEXING
// ----------------------------------------------------------------------------

// Create a unique index on student_id to enforce uniqueness and optimize lookups
db.students.createIndex({ student_id: 1 }, { unique: true });

// List all indexes configured on the collection
db.students.getIndexes();


// ----------------------------------------------------------------------------
// 6. DELETE OPERATIONS & CLEANUP
// ----------------------------------------------------------------------------

// Delete a single document matching specified filter criteria
db.students.deleteOne({ student_id: 103 });

// Delete all documents matching a condition (e.g., GPA below 3.0)
db.students.deleteMany({ gpa: { $lt: 3.0 } });

// Drop the collection from the database
db.students.drop();

// Drop the current active database
db.dropDatabase();
