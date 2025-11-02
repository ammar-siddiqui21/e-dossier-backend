import { Router } from "express";
import { firestore } from "../../firebase";
import dotenv from "dotenv";

dotenv.config();
const router = Router();
// TODO: Add middleware here 
// router.use(); 
const enrollmentCollection = firestore.collection("enrollments");
const officerCollection = firestore.collection("officers");

// GET ALL OFFICERS OF A CLASS
router.get("/class/:classId/officers", async (req, res) => {
    const { classId } = req.params;
    if(!classId) {
        return res.status(400).json({ error: "classId parameter is required" });
    }
    try {
        const snapshot = await enrollmentCollection.where("classId", "==", classId).get();
        if(snapshot.empty) {
            return res.status(200).json([]);
        }
        const officerIds = snapshot.docs.map(doc => doc.data().officerId);
        const officerPromises = officerIds.map(id => officerCollection.doc(id).get());
        const officerDocs = await Promise.all(officerPromises);
        const officers = officerDocs
            .filter(doc => doc.exists)
            .map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json(officers);
    } catch (error) {
        console.error("Error fetching officers:", error);
        return res.status(500).json({ error: "Failed to fetch officers" });
    }
});

// GET ALL CLASSES OF OFFICER
router.get("/officer/:officerId/classes", async (req, res) => {
    const { officerId } = req.params;
    if(!officerId) {
        return res.status(400).json({ error: "officerId parameter is required" });
    }
    try {
        const snapshot = await enrollmentCollection.where("officerId", "==", officerId).get();
        const classIds = snapshot.docs.map(doc => doc.data().classId);
        const classPromises = classIds.map(id => firestore.collection("class").doc(id).get());
        const classDocs = await Promise.all(classPromises);
        const classes = classDocs
            .filter(doc => doc.exists)
            .map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(classes);
    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({ error: "Failed to fetch classes" });
    }
});

// GET ALL CLASSES
router.get("/classes", async (req, res) => {
    try {
        const snapshot = await firestore.collection("class").get();
        // get number of students in each class
        const classIds = snapshot.docs.map(doc => doc.id);
        const enrollmentPromises = classIds.map(classId =>
            enrollmentCollection.where("classId", "==", classId).get()
        );
        const enrollmentSnapshots = await Promise.all(enrollmentPromises);
        const classes = snapshot.docs.map((doc, index) => ({
            id: doc.id,
            ...doc.data(),
            numberOfStudents: enrollmentSnapshots[index].size
        }));
        res.status(200).json(classes);
    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({ error: "Failed to fetch classes" });
    }
});

export { router as commonRouter };