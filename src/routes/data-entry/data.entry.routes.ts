import { Router,Request, Response } from "express";
import { firestore } from "../../firebase";
import dotenv from "dotenv";
import { authenticateToken } from "../../middleware/auth.middleware";
import { Officer } from "../../common/types/officer";
import multer from 'multer';
import { uploadImageToCloudinary } from "../../cloudinary";
import { UploadApiResponse } from "cloudinary";


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
    console.log("Received officer data:", req);
    try {
        const docRef = await officerCollection.add(officerData);
        res.status(201).json({ id: docRef.id, message: "Officer data saved successfully" });
    } catch (error) {
        console.error("Error saving officer data:", error);
        res.status(500).json({ error: "Failed to save officer data" });
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
    console.log("Class ID:", classId, "Officer ID:", officerId);
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
    if(!classId) {
        return res.status(400).json({ error: "Missing classId in parameter" });
    }
    if (!Array.isArray(officerIds) || officerIds.length === 0) {
        return res.status(400).json({ error: "Invalid or empty officerIds array" });
    }
    try {
        const classRef = firestore.collection("classes").doc(classId);
        const classDoc = await classRef.get();
        if (!classDoc.exists) {
            return res.status(404).json({ error: "Class not found" });
        }
        const batch = firestore.batch();
        officerIds.forEach((officerId : string) => {
            batch.set(firestore.collection("enrollments").doc(), {
                classId,
                officerId
            });
        });
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
                console.log("Officer Compulsory Courses:", officerDoc.data()?.compulsoryCourses);
               officerDoc.data()?.compulsoryCourses?.forEach(({courseId, marksArray} : {courseId: string, marksArray: Array<string>} ) => {
                 if(marksArray.includes("F") && !marksArray.includes("P")) {
                   if (!failedCoursesMap[courseId]) {
                       failedCoursesMap[courseId] = new Set<FirebaseFirestore.DocumentData | undefined>();
                   }
                   failedCoursesMap[courseId].add(officerDoc?.data());
                }
            })
        }
    }
        console.log("Failed Courses Map:", failedCoursesMap);
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

export { router as dataEntryRouter };