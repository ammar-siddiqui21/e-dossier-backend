import { Router,Request, Response } from "express";
import { firestore } from "../../firebase";
import dotenv from "dotenv";
import { authenticateToken } from "../../middleware/auth.middleware";
import { Officer } from "../../common/types/officer";
import multer from 'multer';
import { uploadImageToCloudinary } from "../../cloudinary";
import { UploadApiResponse } from "cloudinary";
import { Timestamp } from "firebase-admin/firestore";


const upload = multer({storage: multer.memoryStorage()});
dotenv.config();
const router = Router();
// router.use(authenticateToken);

const officerCollection = firestore.collection("officers");

// SAVE OFFICER IMAGE
router.post("/officer/:id/image", upload.single('image'), async (req : Request, res : Response) => {
    try {
        const { id } = req.params;
        const file = req.file;
        console.log("Received file for upload:", file ? file.originalname : "No file"); 
        if(!id || !file) {
            return res.status(400).json({ error: "Missing officerId in parameter or image file" });
        }
        const result = await uploadImageToCloudinary(file.buffer, id) as UploadApiResponse;
        if(result.secure_url) {
            const officerRef = officerCollection.doc(id);
            await officerRef.update({ imageUrl: result.secure_url });
        }
        res.status(200).json({ message: "Image uploaded successfully" });
    } catch (error) {
        console.error("Error uploading image:", error);
        res.status(500).json({ error: "Failed to upload image" });
    }
});

// SAVE OFFICER DATA
router.post("/officer", async (req : Request, res : Response) => {
    const officerData : Officer = req.body;
    try {
        const docRef = await officerCollection.add(officerData);
        res.status(201).json({ id: docRef.id, message: "Officer data saved successfully" });
    } catch (error) {
        console.error("Error saving officer data:", error);
        res.status(500).json({ error: "Failed to save officer data" });
    }
});

// SAVE MULTIPLE OFFICERS DATA
router.post("/officers/bulk", async (req: Request, res: Response) => {
    const officersData: Officer[] = req.body; // expecting array

    if (!Array.isArray(officersData) || officersData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty officers array" });
    }

    try {
        const batch = firestore.batch();

        const createdOfficerIds: string[] = [];

        officersData.forEach((officer: Officer) => {
            const newDocRef = officerCollection.doc();  // <-- generate id
            createdOfficerIds.push(newDocRef.id);       // <-- STORE THE ID NOW
            batch.set(newDocRef, officer);              // <-- add to batch
        });

        await batch.commit();

        res.status(201).json({
            message: "Officers data saved successfully",
            ids: createdOfficerIds
        });
    } catch (error) {
        console.error("Error saving officers data in bulk:", error);
        res.status(500).json({ error: "Failed to save officers data in bulk" });
    }
});


// UPDATE OFFICER DATA
router.put("/officer/:id", async (req : Request, res : Response) => {
    const { id } = req.params;
    const updatedData : Partial<Officer> = req.body;
    try {
        const officerRef = officerCollection.doc(id);
        await officerRef.update(updatedData);
        res.status(200).json({ message: "Officer data updated successfully" });
    } catch (error) {
        console.error("Error updating officer data:", error);
        res.status(500).json({ error: "Failed to update officer data" });
    }
});

//UPDATE MARKS OF ONE OFFICER
router.put('/officer/marks/:id', async (req : Request, res : Response) => {
  try {
    const { id }  = req.params;
    const newMarks = req.body; // Expecting array: [{ courseId, marks }]

    if (!id) {
      return res.status(400).json({ error: 'Missing officerId in parameter' });
    }

    if (!Array.isArray(newMarks)) {
      return res.status(400).json({ error: 'Body must be an array of marks' });
    }

    const officerRef = firestore.collection('officers').doc(id);
    const officerDoc = await officerRef.get();

    if (!officerDoc.exists) {
      return res.status(404).json({ error: 'Officer not found' });
    }

    const officerData = officerDoc.data();
    const existingMarks = officerData?.marks || [];

    // Option: If you want to *merge/update by courseName*
    const mergedMarks = [...existingMarks];

    newMarks.forEach(newItem => {
      const index = mergedMarks.findIndex(m => m.courseId === newItem.courseId);
      if (index >= 0) {
        mergedMarks[index] = newItem; // update existing course
      } else {
        mergedMarks.push(newItem); // add new course
      }
    });

    // 🔹 Step 3: Update officer record
    await officerRef.update({ marks: mergedMarks });

    res.json({
      message: 'Marks updated successfully',
      officerId: officerRef.id,
      marks: mergedMarks
    });

  } catch (error) {
    console.error('Error updating marks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE MARKS OF ALL OFFICERS
router.put('officer/marks' , async (req : Request, res : Response) => {
    const { courseId, marks } = req.body; // marks: [{ officerId, marks }]

    if (!courseId || !Array.isArray(marks)) {
        return res.status(400).json({ error: "Invalid request body" });
    }
    const batch = firestore.batch();

    try {
        for (const { officerId, marks: officerMarks } of marks) {
            const officerRef = firestore.collection('officers').doc(officerId);
            const officerDoc = await officerRef.get();

            if (!officerDoc.exists) {
                console.warn(`Officer with ID ${officerId} not found, skipping.`);
                continue;
            }

            const officerData = officerDoc.data() as Officer;
            const existingMarks = officerData?.marks || [];

            // Update or add the course marks
            const index = existingMarks.findIndex(m => m.courseId === courseId);
            if (index >= 0) {
                existingMarks[index].marks = officerMarks; // update existing course
            } else {
                existingMarks.push({ courseId, marks: officerMarks }); // add new course
            }

            batch.update(officerRef, { marks: existingMarks });
        }

        await batch.commit();
        res.json({ message: "Marks updated successfully for all officers" });
    } catch (error) {
        console.error("Error updating marks for all officers:", error);
        res.status(500).json({ error: "Failed to update marks for all officers" });
    }
});

// GET OFFICER BY ID
router.get("/officer/:id", async (req : Request, res : Response) => {
    const { id } = req.params;
    try {
        const doc = await officerCollection.doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Officer not found" });
        }
        res.json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error("Error fetching officer data:", error);
        res.status(500).json({ error: "Failed to fetch officer data" });
    }
});

// GET ALL OFFICERS
router.get("/officer", async (req : Request, res : Response) => {
    try {
        const snapshot = await officerCollection.get();
        const officers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(officers);
    } catch (error) {
        console.error("Error fetching officers:", error);
        res.status(500).json({ error: "Failed to fetch officers" });
    }
});

// ADD A COURSE
router.post("/course", async (req : Request, res : Response) => {
    const { courseName, type, module } = req.body;
    if (!courseName || !type) {
        return res.status(400).json({ error: "Missing courseName or type" });
    }
    try {
        let documentToAdd : {courseName: string, type: string, module?: string} = { courseName, type };
        if(module) {
            documentToAdd['module'] = module;
        }
        const courseRef = await firestore.collection("courses").add(documentToAdd);
        res.status(201).json({ id: courseRef.id, message: "Course added successfully" });
    } catch (error) {
        console.error("Error adding course:", error);
        res.status(500).json({ error: "Failed to add course" });
    }
});

// ADD MULTIPLE COURSES
router.post("/courses/bulk", async (req: Request, res: Response) => {
    const courses = req.body; // expecting array of courses
    if (!Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ error: "Invalid or empty courses array" });
    }
    try {
        const batch = firestore.batch();
        courses.forEach((course : { courseName: string; type: string; module?: string; weightage?: number }) => {
            const courseRef = firestore.collection("courses").doc();
            batch.set(courseRef, course);
        });
        await batch.commit();
        res.status(201).json({ message: "Courses added successfully" });
    } catch (error) {
        console.error("Error adding courses in bulk:", error);
        res.status(500).json({ error: "Failed to add courses in bulk" });
    }
});

// UPDATE COURSE
router.put("/course/:id", async (req : Request, res : Response) => {
    const { id } = req.params;
    const updatedData = req.body;
    try {
        const courseRef = firestore.collection("courses").doc(id);
        if(courseRef) {
            await courseRef.update(updatedData);
        } else {
            return res.status(404).json({ error: "Course not found" });
        }
        res.status(200).json({ message: "Course updated successfully" });
    } catch (error) {
        console.error("Error updating course:", error);
        res.status(500).json({ error: "Failed to update course" });
    }
});

// GET ALL COURSES
router.get("/course", async (req : Request, res : Response) => {
    try {
        const snapshot = await firestore.collection("courses").get();
        const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(courses);
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ error: "Failed to fetch courses" });
    }
});

// GET ALL COMPULSORY COURSES
router.get("/course/compulsory", async (req : Request, res : Response) => {
    const { category } = req.query;
    try {
        let snapshot;
        if(category) {
            snapshot = await firestore.collection("courses").where("type", "==", "Compulsory").where("category", "==", category).get();
        }else {
            snapshot = await firestore.collection("courses").where("type", "==", "Compulsory").get();
        }
        if(snapshot.empty) {
            return res.status(200).json([]);
        }   
        const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(courses);
    } catch (error) {
        console.error("Error fetching compulsory courses:", error);
        res.status(500).json({ error: "Failed to fetch compulsory courses" });
    }
});

// GET ALL OPTIONAL COURSES
router.get("/course/optional", async (req : Request, res : Response) => {
    const { category } = req.query;
    try {
        let snapshot;
        if(category) {
            snapshot = await firestore.collection("courses").where("type", "==", "Optional").where("category", "==", category).get();
        }else {
            snapshot = await firestore.collection("courses").where("type", "==", "Optional").get();
        }
        if(snapshot.empty) {
            return res.status(200).json([]);
        }
        const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(courses);
    } catch (error) {
        console.error("Error fetching optional courses:", error);
        res.status(500).json({ error: "Failed to fetch optional courses" });
    }
});

// ADD A SINGLE OFFICER IN CLASS
router.post("/class/:classId/officer/:officerId", async (req : Request, res : Response) => {
    const { classId, officerId } = req.params;
    try {
        const officerRef = officerCollection.doc(officerId);
        const classRef = firestore.collection("class").doc(classId);        
        const classDoc = await classRef.get();
        if (!classDoc.exists) {
            return res.status(404).json({ error: "Class not found" });
        }
        const officerDoc = await officerRef.get();
        if (!officerDoc.exists) {
            return res.status(404).json({ error: "Officer not found" });
        }
        await firestore.collection("enrollments").add({
            classId,
            officerId
        });
        res.status(201).json({ message: "Officer added to class successfully" });
    } catch (error) {
        console.error("Error adding officer to class:", error);
        res.status(500).json({ error: "Failed to add officer to class" });
    }
});

// ADD MULTIPLE OFFICERS IN CLASS
router.post("/class/:classId/officers", async (req : Request, res : Response) => {
    const { classId } = req.params;
    const { officerIds } = req.body; // expecting array of officer IDs
    console.log("Officer IDs to add:", officerIds);
    if(!classId) {
        return res.status(400).json({ error: "Missing classId in parameter" });
    }
    if (!Array.isArray(officerIds) || officerIds.length === 0) {
        return res.status(400).json({ error: "Invalid or empty officerIds array" });
    }
    try {
        const classRef = firestore.collection("class").doc(classId);
        const classDoc = await classRef.get();
        if (!classDoc.exists) {
            return res.status(404).json({ error: "Class not found" });
        }
        const batch = firestore.batch();
        const enrollmentCollection = firestore.collection("enrollments");
        for(const officerId of officerIds) {
            const officerRef = officerCollection.doc(officerId);
            const officerDoc = await officerRef.get();
            if (!officerDoc.exists) {
                console.warn(`Officer with ID ${officerId} not found, skipping.`);
                continue;
            }
            const enrollmentsRef = enrollmentCollection.doc();
            batch.set(enrollmentsRef, {
                classId,
                officerId
            });
        }
        await batch.commit();
        res.status(201).json({ message: "Officers added to class successfully" });
    } catch (error) {
        console.error("Error adding officers to class:", error);
        res.status(500).json({ error: "Failed to add officers to class" });
    }
});

// ADD A CLASS
router.post("/class", async (req : Request, res : Response) => {
    const { name, instructorId } = req.body;
    if (!name || !instructorId) {
        return res.status(400).json({ error: "Missing class name or instructor ID" });
    }
    try {
        const classRef = await firestore.collection("class").add({ name, instructorId });
        res.status(201).json({ id: classRef.id, message: "Class added successfully" });
    } catch (error) {
        console.error("Error adding class:", error);
        res.status(500).json({ error: "Failed to add class" });
    }
});

// UPDATE A CLASS
router.put("/class/:id", async (req : Request, res : Response) => {
    const { id } = req.params;
    const updatedData = req.body;
    try {
        const classRef = firestore.collection("class").doc(id);
        await classRef.update(updatedData);
        res.status(200).json({ message: "Class updated successfully" });
    } catch (error) {
        console.error("Error updating class:", error);
        res.status(500).json({ error: "Failed to update class" });
    }
});

// DELETE A CLASS
router.delete("/class/:id", async (req : Request, res : Response) => {
    const { id } = req.params;
    try {
        const classRef = firestore.collection("class").doc(id);
        await classRef.delete();
        // delete all enrollments related to this class
        const enrollmentSnapshot = await firestore.collection("enrollments").where("classId", "==", id).get();
        const batch = firestore.batch();
        enrollmentSnapshot.docs.forEach(doc => {
            const officerRef = firestore.collection("officers").doc(doc.data().officerId);
            batch.delete(doc.ref);
            batch.delete(officerRef);
        });
        await batch.commit();
        res.status(200).json({ message: "Class deleted successfully" });
    } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).json({ error: "Failed to delete class" });
    }
});

// ADD A ASSESSMENT
router.post("/assessment/:courseId", async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { name, totalMarks } = req.body;
    if (!courseId || !name || !totalMarks) {
        return res.status(400).json({ error: "Missing courseId, name or totalMarks" });
    }
    try {
        const assessmentRef = await firestore.collection("assessments").add({
            courseId,
            assessmentName: name,
            totalMarks
        });
        res.status(201).json({ id: assessmentRef.id, message: "Assessment added successfully" });
    } catch (error) {
        console.error("Error adding assessment:", error);
        res.status(500).json({ error: "Failed to add assessment" });
    }
});

// UPDATE ASSESSMENT BY ASSESSMENT ID
router.put("/assessment/:assessmentId", async (req: Request, res: Response) => {
    const { assessmentId } = req.params;
    const updatedData = req.body;
    if (!assessmentId) {
        return res.status(400).json({ error: "Missing assessmentId in parameter" });
    }
    try {
        const assessmentRef = firestore.collection("assessments").doc(assessmentId);
        await assessmentRef.update(updatedData);
        res.status(200).json({ message: "Assessment updated successfully" });
    } catch (error) {
        console.error("Error updating assessment:", error);
        res.status(500).json({ error: "Failed to update assessment" });
    }
});

// GET ALL ASSESSMENTS BY COURSE ID
router.get("/assessment/:courseId", async (req: Request, res: Response) => {
    const { courseId } = req.params;
    if (!courseId) {
        return res.status(400).json({ error: "Missing courseId in parameter" });
    }
    try {
        const snapshot = await firestore.collection("assessments").where("courseId", "==", courseId).get();
        const assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(assessments);
    } catch (error) {
        console.error("Error fetching assessments:", error);
        res.status(500).json({ error: "Failed to fetch assessments" });
    }
});

// GET MARKS OF ALL OFFICERS FOR A SPECIFIC ASSESSMENT
router.get("/assessment/:assessmentId/marks", async (req: Request, res: Response) => {
    const { assessmentId } = req.params;
    if (!assessmentId) {
        return res.status(400).json({ error: "Missing assessmentId in parameter" });
    }
    try {
        const snapshot = await firestore.collection("marks").where("assessmentId", "==", assessmentId).get();
        const marks = snapshot.docs.map(doc => ({ marksId: doc.id, ...doc.data() }));
        res.status(200).json(marks);
    } catch (error) {
        console.error("Error fetching marks:", error);
        res.status(500).json({ error: "Failed to fetch marks" });
    }
});

// UPDATE MARKS FOR ONE OFFICER BY MARKS ID
router.put("/marks/:marksId/:assessmentId", async (req: Request, res: Response) => {
    const { marksId, assessmentId } = req.params;
    const { updatedMarks } = req.body;
    if (!marksId || !updatedMarks) {
        return res.status(400).json({ error: "Missing marksId or updatedMarks in parameter" });
    }
    if(!assessmentId) {
        return res.status(400).json({ error: "Missing assessmentId in parameter" });
    }
    try {
        const assessmentRef = firestore.collection("assessments").doc(assessmentId);
        const assessmentDoc = await assessmentRef.get();
        if (!assessmentDoc.exists) {
            return res.status(404).json({ error: "Assessment not found" });
        }
        const marksRef = firestore.collection("marks").doc(marksId);
        if (!marksRef) {
            return res.status(404).json({ error: "Marks record not found" });
        }
        // Check that new marks should be less than total marks
        const assessmentData = assessmentDoc.data();
        if (updatedMarks > assessmentData?.totalMarks) {
            return res.status(400).json({ error: "Updated marks exceed total marks for the assessment" });
        }
        await marksRef.update({ marks: updatedMarks });
        res.status(200).json({ message: "Marks updated successfully" });
    } catch (error) {
        console.error("Error updating marks:", error);
        res.status(500).json({ error: "Failed to update marks" });
    }
});

// UPDATE MARKS FOR MULTIPLE OFFICERS BY ASSESSMENT ID
router.put("/marks/update-all", async (req: Request, res: Response) => {
    const marksUpdates = req.body;
    // body = [{marksId: string, marks: number}]
    if (!Array.isArray(marksUpdates)) {
        return res.status(400).json({ error: "Invalid request" });
    }
    try {
        const batch = firestore.batch();
        marksUpdates.forEach(async ({ marksId, marks }) => {
            const marksRef = firestore.collection("marks").doc(marksId);
            batch.update(marksRef, { marks });
        });
        await batch.commit();
        res.status(200).json({ message: "Marks updated successfully for all officers" });
    } catch (error) {
        console.error("Error updating marks for all officers:", error);
        res.status(500).json({ error: "Failed to update marks for all officers" });
    }
});

// ADD MARKS FOR MULTIPLE OFFICERS BY ASSESSMENT ID
router.post("/marks/optional/update-all/:assessmentId", async (req: Request, res: Response) => {
    const { assessmentId } = req.params;
    const marksData = req.body; // expecting array of { officerId, marks }
    if (!assessmentId || !Array.isArray(marksData)) {
        return res.status(400).json({ error: "Invalid request" });
    }
    try {
        const assessmentRef = firestore.collection("assessments").doc(assessmentId);
        const assessmentDoc = await assessmentRef.get();
        if (!assessmentDoc.exists) {
            return res.status(404).json({ error: "Assessment not found" });
        }
        const assessmentData = assessmentDoc.data();
        const batch = firestore.batch();
        marksData.forEach(({ officerId, marks }) => {
            if (marks <= assessmentData?.totalMarks) {
                const marksRef = firestore.collection("marks").doc();
                batch.set(marksRef, {
                    assessmentId,
                    officerId,
                    marks
                });
            }
        });
        await batch.commit();
        res.status(201).json({ message: "Marks added successfully for all officers" });
    } catch (error) {
        console.error("Error adding marks for all officers:", error);
        res.status(500).json({ error: "Failed to add marks for all officers" });
    }
});

// UPDATE COMPULSORY MARKS FOR MULTIPLE OFFICERS
router.put("/compulsory-marks/update-all", async (req: Request, res: Response) => {
    const marksUpdates = req.body;
    // body = [{officerId; string, courseId: string, marks: Array<string>}]
    if (!Array.isArray(marksUpdates)) {
        return res.status(400).json({ error: "Invalid request" });
    }
    try {
        const batch = firestore.batch();
        for (const { officerId, courseId, marks } of marksUpdates) {
            const officerRef = firestore.collection("officers").doc(officerId);
            const officerDoc = await officerRef.get();
            if (!officerDoc.exists) {
                console.warn(`Officer with ID ${officerId} not found, skipping.`);
                continue;
            }
            const officerData = officerDoc.data();
            const compulsoryCourses = officerData?.compulsoryCourses || [];
            const index = compulsoryCourses.findIndex((c: any) => c.courseId === courseId);
            if (index >= 0) {
                compulsoryCourses[index].marksArray = marks; // update existing course
            }
            else {
                compulsoryCourses.push({ courseId, marksArray: marks }); // add new course
            }
            batch.update(officerRef, { compulsoryCourses });
        }
        await batch.commit();
        res.status(200).json({ message: "Compulsory marks updated successfully for all officers" });
    } catch (error) {
        console.error("Error updating compulsory marks for all officers:", error);
        res.status(500).json({ error: "Failed to update compulsory marks for all officers" });
    }

});

// ADD MARKS FOR MULTIPLE OFFICERS BY ASSESSMENT ID
router.post("/marks/:assessmentId", async (req: Request, res: Response) => {
    const { assessmentId } = req.params;
    const marksData = req.body; // expecting array of { officerId, marks }
    if (!assessmentId || !Array.isArray(marksData)) {
        return res.status(400).json({ error: "Invalid request" });
    }
    try {
        const assessmentRef = firestore.collection("assessments").doc(assessmentId);
        const assessmentDoc = await assessmentRef.get();
        if (!assessmentDoc.exists) {
            return res.status(404).json({ error: "Assessment not found" });
        }
        const assessmentData = assessmentDoc.data();
        const batch = firestore.batch();
        marksData.forEach(({ officerId, marks }) => {
            if (marks <= assessmentData?.totalMarks) {
                const marksRef = firestore.collection("marks").doc();
                batch.set(marksRef, {
                    assessmentId,
                    officerId,
                    marks
                });
            }
        });
        await batch.commit();
        res.status(201).json({ message: "Marks added successfully for all officers" });
    } catch (error) {
        console.error("Error adding marks for all officers:", error);
        res.status(500).json({ error: "Failed to add marks for all officers" });
    }
});

// GET FAILED COMPULSORY COURSES BY CLASS ID
router.get("/class/:classId/failed-compulsory-courses", async (req: Request, res: Response) => {
    const {classId} = req.params;
    if (!classId) {
        return res.status(400).json({ error: "Missing classId in parameter" });
    }
    try {
        // get all officers in the class
        const enrollmentSnapshot = await firestore.collection("enrollments").where("classId", "==", classId).get();
        const officerIds = enrollmentSnapshot.docs.map(doc => doc.data().officerId);
        const failedCoursesMap: {[key: string]: Set<FirebaseFirestore.DocumentData | undefined>} = {};
        for (const officerId of officerIds) {
            const officerDoc = await firestore.collection("officers").doc(officerId).get();
            if (officerDoc.exists && officerDoc.data()?.compulsoryCourses) {
               officerDoc.data()?.compulsoryCourses?.forEach(({courseId, marksArray} : {courseId: string, marksArray: Array<string>} ) => {
                 if((marksArray.includes("F") && !marksArray.includes("P")) || (marksArray.includes("NATT") && !marksArray.includes("ATT"))) {
                   if (!failedCoursesMap[courseId]) {
                       failedCoursesMap[courseId] = new Set<FirebaseFirestore.DocumentData | undefined>();
                   }
                   failedCoursesMap[courseId].add(officerDoc?.data());
                }
            })
        }
    }
        // Convert Sets to arrays for response
        const result = Object.fromEntries(
        Object.entries(failedCoursesMap).map(([k, v]) => [k, Array.from(v)])
        );
        res.status(200).json({ failedCourses: result });
        // res.status(200).json({ failedCourses: failedCoursesMap });
    } catch (error) {
        console.error("Error getting failed compulsory courses:", error);
        res.status(500).json({ error: "Failed to get failed compulsory courses" });
    }
});

// GET FAILED OPTIONAL COURSES BY CLASS ID
router.get("/class/:classId/failed-optional-courses", async (req: Request, res: Response) => {
    const {classId} = req.params;
    if(!classId) {
        return res.status(400).json({ error: "Missing classId in parameter" });
    } 
    try {
        let result : {[courseId: string] : Array<string>} = {}
        // get all optional courses
        const optionalCoursesSnapshot = await firestore.collection("courses").where("type", "==", "Optional").get();
        if(optionalCoursesSnapshot.empty) {
            return res.status(200).json({ failedOptionalCourses: {} });
        }
        for(const course of optionalCoursesSnapshot.docs) {
            const courseId = course.id;

            // Fetch all assessments of this course
            const assessmentsSnapshot = await firestore.collection("assessments").where("courseId", "==", courseId).get();
            if(assessmentsSnapshot.empty) {
                result[courseId] = []
                continue;
            }

            let officerTotals : any = {}

            for(const assessment of assessmentsSnapshot.docs){
                const assessmentId = assessment.id;
                let totalMarks = assessment.data().totalMarks;
                totalMarks = Number(totalMarks);

                const marksSnap = await firestore.collection("marks").where("assessmentId", "==", assessmentId).get()

                for (const marksDoc of marksSnap.docs) {
                    const {officerId, marks} = marksDoc.data()
                    if (!officerTotals[officerId]) {
                    officerTotals[officerId] = { obtained: 0, total: 0 };
                    }

                    officerTotals[officerId].obtained += marks;
                    officerTotals[officerId].total += totalMarks;
                }
            }

            const failedOfficers = Object.entries(officerTotals)
            .filter(([_, perf] : [any, any]) => (perf.obtained / perf.total) * 100 < 50)
            .map(([officerId]) => officerId);

            result[courseId] = failedOfficers;
        }

        const failedOfficersDetails : {[courseId: string] : FirebaseFirestore.DocumentData | undefined}= {};

        // get details of each failed officer
        for(const courseId in result) {
            const officerIds = result[courseId];
            const officerDetailsPromises = officerIds.map((officerId: string) => 
                firestore.collection("officers").doc(officerId).get()
            );
            const officerDocs = await Promise.all(officerDetailsPromises);
            const officerDetails = officerDocs
                .filter(doc => doc.exists)
                .map(doc => doc.data());
            failedOfficersDetails[courseId] = officerDetails;
        }

        res.status(200).json({ failedOfficersDetails })
    }
    catch(error) {
        console.error("Error getting failed optional courses", error);
        res.status(500).json({ error: "Failed to get failed optional courses" });
    }
});

// GET ALL ASSESSMENTS OF OFFICER
router.get("/officer/:officerId/assessments", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        // Get all marks records for the officer
        let result : {
            [assessmentName : string] : { courseId: string , assessmentMarks: number, obtainedMarks: number } 
        } = {}
        const marksSnapshot = await firestore.collection("marks").where("officerId", "==", officerId).get();
        if(marksSnapshot.empty) {
            return res.status(200).json({ result: {} });
        }
        for(const marksDoc of marksSnapshot.docs) {
            const { assessmentId, marks } = marksDoc.data();
            // Get assessment details
            const assessmentRef = firestore.collection("assessments").doc(assessmentId);
            const assessmentDoc = await assessmentRef.get();
            if(assessmentDoc.exists) {
                const assessmentData = assessmentDoc.data();
                if(assessmentData) {
                    result[assessmentData.assessmentName] = {
                        courseId: assessmentData.courseId,
                        assessmentMarks: Number(assessmentData.totalMarks),
                        obtainedMarks: Number(marks)
                    }
                }
            }
        }
        res.status(200).json({result});
    } catch (error) {
        console.error("Error fetching assessments for officer:", error);
        res.status(500).json({ error: "Failed to fetch assessments for officer" });
    }
});

// GET LEAVE DATA BY OFFICER ID
router.get("/officer/:officerId/leaves" , async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const leavesSnapshot = await firestore.collection("leaves").where("officerId", "==", officerId).get();
        if(leavesSnapshot.empty) {
            return res.status(200).json([]);
        }
        const leaves = leavesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(leaves);
    } catch (error) {
        console.error("Error fetching leaves for officer:", error);
        res.status(500).json({ error: "Failed to fetch leaves for officer" });
    }
})

// ADD A LEAVE RECORD FOR OFFICER
router.post("/officer/:officerId/leave", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const leaveData = req.body;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const leaveRef = await firestore.collection("leaves").add({
            officerId,
            ...leaveData
        });
        res.status(201).json({ id: leaveRef.id, message: "Leave record added successfully" });
    } catch (error) {
        console.error("Error adding leave record for officer:", error);
        res.status(500).json({ error: "Failed to add leave record for officer" });
    }
});

// ADD MULTIPLE LEAVE RECORDS FOR ONE OFFICER
router.post("/officer/:officerId/leaves", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const leaveRecordsData = req.body; // expecting array of leave records
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    if (!Array.isArray(leaveRecordsData) || leaveRecordsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty leave records array" });
    }
    try {
        const batch = firestore.batch();
        leaveRecordsData.forEach((leaveData : any) => {
            const leaveRef = firestore.collection("leaves").doc();
            batch.set(leaveRef, {
                officerId,
                ...leaveData
            });
        });
        await batch.commit();
        res.status(201).json({ message: "Leave records added successfully" });
    } catch (error) {
        console.error("Error adding leave records for officer:", error);
        res.status(500).json({ error: "Failed to add leave records for officer" });
    }
});

// UPDATE MULTIPLE LEAVE RECORDS BY ID
router.put("/leaves", async (req: Request, res: Response) => {
    const leaveUpdates = req.body; // expecting array of { id: string, ...updatedData }
    if (!Array.isArray(leaveUpdates) || leaveUpdates.length === 0) {
        return res.status(400).json({ error: "Invalid or empty leave updates array" });
    }
    try {
        const batch = firestore.batch();
        leaveUpdates.forEach((leaveRecord : { id: string, from: string, to: string, days: number, type: string, leaveAddress: string }) => {
            const leaveRef = firestore.collection("leaves").doc(leaveRecord.id);
            // remove id from leaveRecord before updating
            const payload = {
                from: leaveRecord.from,
                to: leaveRecord.to,
                days: leaveRecord.days,
                type: leaveRecord.type,
                leaveAddress: leaveRecord.leaveAddress
            }
            batch.update(leaveRef, payload);
        });
        await batch.commit();
        res.status(200).json({ message: "Leave records updated successfully" });
    } catch (error) {
        console.error("Error updating leave records:", error);
        res.status(500).json({ error: "Failed to update leave records" });
    }   
});

// DELETE LEAVE RECORD BY ID
router.delete("/:leaveId/leaves", async (req: Request, res: Response) => {
    const { leaveId } = req.params;
    if(!leaveId) {
        return res.status(400).json({ error: "Missing leaveId in parameter" });
    }
    try {
        const leaveRef = firestore.collection("leaves").doc(leaveId);
        await leaveRef.delete();
        res.status(200).json({ message: "Leave record deleted successfully" });
    } catch (error) {
        console.error("Error deleting leave record:", error);
        res.status(500).json({ error: "Failed to delete leave record" });
    }
});

// GET KIT ITEMS BY OFFICER ID
router.get("/officer/:officerId/kit-items" , async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const kitItemsSnapshot = await firestore.collection("kitItems").where("officerId", "==", officerId).get();
        if(kitItemsSnapshot.empty) {
            return res.status(200).json([]);
        }
        const kitItems = kitItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(kitItems);
    } catch (error) {
        console.error("Error fetching kit items for officer:", error);
        res.status(500).json({ error: "Failed to fetch kit items for officer" });
    }
});

// ADD MULTIPLE KIT ITEM RECORDS FOR ONE OFFICER
router.post("/officer/:officerId/kit-items", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const kitItemsData = req.body; // expecting array of kit item records
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    if (!Array.isArray(kitItemsData) || kitItemsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty kit items array" });
    }
    try {
        const batch = firestore.batch();
        kitItemsData.forEach((kitItemData : any) => {
            const kitItemRef = firestore.collection("kitItems").doc();
            batch.set(kitItemRef, {
                officerId,
                ...kitItemData
            });
        });
        await batch.commit();
        res.status(201).json({ message: "Kit item records added successfully" });
    } catch (error) {
        console.error("Error adding kit item records for officer:", error);
        res.status(500).json({ error: "Failed to add kit item records for officer" });
    }
});

// UPDATE MULTIPLE KIT ITEM RECORDS FOR ONE OFFICER
router.put("/kit-items", async (req: Request, res: Response) => {
    const kitItemsData = req.body; // expecting array of kit item records
    if(!Array.isArray(kitItemsData) || kitItemsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty kit items array" });
    }
    try {
        const batch = firestore.batch();
        kitItemsData.forEach((kitItemData : any) => {
            const kitItemRef = firestore.collection("kitItems").doc(kitItemData.id);
            // remove id from kitItemData before updating
            const payload = {
                item: kitItemData.item,
                quantity: kitItemData.quantity,
                issuedDate: kitItemData.issuedDate,
                dueDate: kitItemData.dueDate
            }
            batch.update(kitItemRef, payload);
        });
        await batch.commit();
        res.status(200).json({ message: "Kit item records updated successfully" });
    } catch (error) {
        console.error("Error updating kit item records for officer:", error);
        res.status(500).json({ error: "Failed to update kit item records for officer" });
    }
});

// DELETE KIT ITEM BY ID
router.delete("/kit-item/:kitItemId", async (req: Request, res: Response) => {
    const { kitItemId } = req.params;
    if(!kitItemId) {
        return res.status(400).json({ error: "Missing kitItemId in parameter" });
    }
    try {
        const kitItemRef = firestore.collection("kitItems").doc(kitItemId);
        await kitItemRef.delete();
        res.status(200).json({ message: "Kit item deleted successfully" });
    } catch (error) {
        console.error("Error deleting kit item:", error);
        res.status(500).json({ error: "Failed to delete kit item" });
    }
});

// ADD MULTIPLE MOVEMENT RECORDS FOR ONE OFFICER
router.post("/officer/:officerId/movements", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const movementsData = req.body; // expecting array of movement records
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    if (!Array.isArray(movementsData) || movementsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty movements array" });
    }
    try {
        const batch = firestore.batch();
        movementsData.forEach((movementData : any) => {
            const movementRef = firestore.collection("movements").doc();
            batch.set(movementRef, {
                officerId,
                ...movementData
            });
        });
        await batch.commit();
        res.status(201).json({ message: "Movement records added successfully" });
    } catch (error) {
        console.error("Error adding movement records for officer:", error);
        res.status(500).json({ error: "Failed to add movement records for officer" });
    }
});

// GET MOVEMENTS BY OFFICER ID
router.get("/officer/:officerId/movements" , async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const movementsSnapshot = await firestore.collection("movements").where("officerId", "==", officerId).get();
        if(movementsSnapshot.empty) {
            return res.status(200).json([]);
        }
        const movements = movementsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(movements);
    } catch (error) {
        console.error("Error fetching movements for officer:", error);
        res.status(500).json({ error: "Failed to fetch movements for officer" });
    }
});

// DELETE MOVEMENT BY ID
router.delete("/movement/:movementId", async (req: Request, res: Response) => {
    const { movementId } = req.params;
    if(!movementId) {
        return res.status(400).json({ error: "Missing movementId in parameter" });
    }
    try {
        const movementRef = firestore.collection("movements").doc(movementId);
        await movementRef.delete();
        res.status(200).json({ message: "Movement deleted successfully" });
    } catch (error) {
        console.error("Error deleting movement:", error);
        res.status(500).json({ error: "Failed to delete movement" });
    }
});

// UPDATE MOVEMENT RECORDS
router.put("/movements", async (req: Request, res: Response) => {
    const movementsData = req.body; // expecting array of movement records
    if(!Array.isArray(movementsData) || movementsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty movements array" });
    }
    try {
        const batch = firestore.batch();
        movementsData.forEach((movementData : any) => {
            const movementRef = firestore.collection("movements").doc(movementData.id);
            // remove id from movementData before updating
            const payload = {
                from: movementData.from,
                to: movementData.to,
                arrival: movementData.arrival,
                date: movementData.date,
                draft: movementData.draft
            }
            batch.update(movementRef, payload);
        });
        await batch.commit();
        res.status(200).json({ message: "Movement records updated successfully" });
    } catch (error) {
        console.error("Error updating movement records for officer:", error);
        res.status(500).json({ error: "Failed to update movement records for officer" });
    }
});

// GET MEDICAL RECORDS BY OFFICER ID
router.get("/officer/:officerId/medical" , async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const medicalSnapshot = await firestore.collection("medical").where("officerId", "==", officerId).get();
        if(medicalSnapshot.empty) {
            return res.status(200).json([]);
        }
        const medicalRecords = medicalSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(medicalRecords);
    } catch (error) {
        console.error("Error fetching medical records for officer:", error);
        res.status(500).json({ error: "Failed to fetch medical records for officer" });
    }
});

// ADD A MEDICAL RECORD FOR OFFICER
router.post("/officer/:officerId/medical", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const medicalData = req.body;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const medicalRef = await firestore.collection("medical").add({
            officerId,
            ...medicalData
        });
        res.status(201).json({ id: medicalRef.id, message: "Medical record added successfully" });
    } catch (error) {
        console.error("Error adding medical record for officer:", error);
        res.status(500).json({ error: "Failed to add medical record for officer" });
    }
});

// DELETE MEDICAL RECORD BY ID
router.delete("/medical/:medicalId", async (req: Request, res: Response) => {
    const { medicalId } = req.params;
    if(!medicalId) {
        return res.status(400).json({ error: "Missing medicalId in parameter" });
    }
    try {
        const medicalRef = firestore.collection("medical").doc(medicalId);
        await medicalRef.delete();
        res.status(200).json({ message: "Medical record deleted successfully" });
    } catch (error) {
        console.error("Error deleting medical record:", error);
        res.status(500).json({ error: "Failed to delete medical record" });
    }
});

// ADD MULTIPLE MEDICAL RECORDS FOR ONE OFFICER
router.post("/officer/:officerId/medical-records", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const medicalRecordsData = req.body; // expecting array of medical records
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    if (!Array.isArray(medicalRecordsData) || medicalRecordsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty medical records array" });
    }
    try {
        const batch = firestore.batch();
        medicalRecordsData.forEach((medicalData : any) => {
            const medicalRef = firestore.collection("medical").doc();
            batch.set(medicalRef, {
                officerId,
                ...medicalData
            });
        });
        await batch.commit();
        res.status(201).json({ message: "Medical records added successfully" });
    } catch (error) {
        console.error("Error adding medical records for officer:", error);
        res.status(500).json({ error: "Failed to add medical records for officer" });
    }
});

// GET WARNINGS BY OFFICER ID
router.get("/officer/:officerId/warnings" , async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const warningsSnapshot = await firestore.collection("warnings").where("officerId", "==", officerId).get();
        if(warningsSnapshot.empty) {
            return res.status(200).json([]);
        }
        const warnings = warningsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(warnings);
    } catch (error) {
        console.error("Error fetching warnings for officer:", error);
        res.status(500).json({ error: "Failed to fetch warnings for officer" });
    }
});

// ADD A WARNING RECORD FOR OFFICER
router.post("/officer/:officerId/warning", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const warningData = req.body;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const warningRef = await firestore.collection("warnings").add({
            officerId,
            ...warningData
        });
        res.status(201).json({ id: warningRef.id, message: "Warning record added successfully" });
    } catch (error) {
        console.error("Error adding warning record for officer:", error);
        res.status(500).json({ error: "Failed to add warning record for officer" });
    }
});

// ADD MULTIPLE WARNING RECORDS FOR ONE OFFICER
router.post("/officer/:officerId/warnings", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const warningsData = req.body; // expecting array of warning records
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    if (!Array.isArray(warningsData) || warningsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty warnings array" });
    }
    try {
        const batch = firestore.batch();
        warningsData.forEach((warningData : any) => {
            const warningRef = firestore.collection("warnings").doc();
            batch.set(warningRef, {
                officerId,
                ...warningData
            });
        });
        await batch.commit();
        res.status(201).json({ message: "Warning records added successfully" });
    } catch (error) {
        console.error("Error adding warning records for officer:", error);
        res.status(500).json({ error: "Failed to add warning records for officer" });
    }
});

// DELETE WARNING BY ID 
router.delete("/warning/:warningId", async (req: Request, res: Response) => {
    const { warningId } = req.params;
    if(!warningId) {
        return res.status(400).json({ error: "Missing warningId in parameter" });
    }
    try {
        const warningRef = firestore.collection("warnings").doc(warningId);
        await warningRef.delete();
        res.status(200).json({ message: "Warning record deleted successfully" });
    } catch (error) {
        console.error("Error deleting warning record:", error);
        res.status(500).json({ error: "Failed to delete warning record" });
    }
});

// UPDATE WARNING RECORD WITH IMAGE BY WARNING ID
router.put("/warning/:warningId", upload.single('image'), async (req: Request, res: Response) => {
    const { warningId } = req.params;
    const file = req.file;
    console.log("Received file for upload:", file ? file.originalname : "No file");
    if(!warningId || !file) {
        return res.status(400).json({ error: "Missing warningId in parameter or image file" });
    }
    try {
        const result = await uploadImageToCloudinary(file.buffer, warningId) as UploadApiResponse;
        if(result.secure_url) {
            const warningRef = firestore.collection("warnings").doc(warningId);
            await warningRef.update({ imageUrl: result.secure_url });
        }
        res.status(200).json({ imageUrl: result.secure_url ,message: "Warning record updated successfully" });
    } catch (error) {
        console.error("Error updating warning record:", error);
        res.status(500).json({ error: "Failed to update warning record" });
    }
});

// GET PET RECORD BY OFFICER ID
// EVERY OFFICER WILL HAVE ONLY ONE PET RECORD
router.get("/officer/:officerId/pet", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const petSnapshot = await firestore.collection("pets").where("officerId", "==", officerId).limit(1).get();
        if(petSnapshot.empty) {
            return res.status(200).json(null);
        }
        const pet = { id: petSnapshot.docs[0].id, ...petSnapshot.docs[0].data() };
        res.status(200).json(pet);
    } catch (error) {
        console.error("Error fetching pets for officer:", error);
        res.status(500).json({ error: "Failed to fetch pets for officer" });
    }
});

// ADD A PET RECORD FOR OFFICER
router.post("/officer/:officerId/pet", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const petData = req.body;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const petRef = await firestore.collection("pets").add({
            officerId,
            ...petData
        });
        res.status(201).json({ id: petRef.id, message: "Pet record added successfully" });
    } catch (error) {
        console.error("Error adding pet record for officer:", error);
        res.status(500).json({ error: "Failed to add pet record for officer" });
    }
});

// ADD TRAITS ASSESSMENT FOR OFFICER
router.post("/officer/:officerId/traits-assessments", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    const traitsData = req.body; //[{ traitName: string, score: number, tap: number, total: number }]

    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    if(!Array.isArray(traitsData) || traitsData.length === 0) {
        return res.status(400).json({ error: "Invalid or empty traits data" });
    }
    try {
        const batch = firestore.batch();
        traitsData.forEach((trait: {traitName: string, score: number, total: number, tap: 1 | 2}) => {
            const traitRef = firestore.collection("traits").doc();
            batch.set(traitRef, {
                officerId,
                tap: trait.tap,
                traitName: trait.traitName,
                score: trait.score,
                total: trait.total
            });
        });
        await batch.commit();
        res.status(201).json({ message: "Traits assessment added successfully" });
    } catch (error) {
        console.error("Error adding traits assessment for officer:", error);
        res.status(500).json({ error: "Failed to add traits assessment for officer" });
    }
})

// GET TRAITS ASSESSMENT BY OFFICER ID
router.get("/officer/:officerId/traits-assessments", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "Missing officerId in parameter" });
    }
    try {
        const traitsSnapshot = await firestore.collection("traits").where("officerId", "==", officerId).get();
        if(traitsSnapshot.empty) {
            return res.status(200).json([]);
        }
        const traitsAssessments = traitsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(traitsAssessments);
    } catch (error) {
        console.error("Error fetching traits assessments for officer:", error);
        res.status(500).json({ error: "Failed to fetch traits assessments for officer" });
    }
});

export { router as dataEntryRouter };