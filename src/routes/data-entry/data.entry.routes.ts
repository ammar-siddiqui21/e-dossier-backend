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
    const { courseName, type } = req.body;
    if (!courseName || !type) {
        return res.status(400).json({ error: "Missing courseName or type" });
    }
    try {
        const courseRef = await firestore.collection("courses").add({ courseName, type });
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

export { router as dataEntryRouter };