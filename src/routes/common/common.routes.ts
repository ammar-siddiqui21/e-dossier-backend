import { Router, Request, Response } from "express";
import { firestore } from "../../firebase";
import dotenv from "dotenv";
import { Pet } from "../../common/types/officer";
import { utils } from "../utils";
import { openai } from "../../openai";

dotenv.config();
const router = Router();
// TODO: Add middleware here 
// router.use(); 
const enrollmentCollection = firestore.collection("enrollments");
const officerCollection = firestore.collection("officers");

router.get("/ping", (req: Request, res: Response) => {
    res.status(200).json({ message: "Pong from common routes!" });
})

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

// GET CLASS BY ID
router.get("/class/:classId", async (req, res) => {
    const { classId } = req.params;
    try {
        const classDoc = await firestore.collection("class").doc(classId).get();
        if (!classDoc.exists) {
            return res.status(404).json({ error: "Class not found" });
        }
        res.status(200).json({ id: classDoc.id, ...classDoc.data() });
    } catch (error) {
        console.error("Error fetching class:", error);
        res.status(500).json({ error: "Failed to fetch class" });
    }
});

// GET ALL INSTRUCTORS
router.get("/instructors", async (req, res) => {
    try {
        const snapshot = await firestore.collection("instructor").get();
        const instructors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(instructors);
    } catch (error) {
        console.error("Error fetching instructors:", error);
        res.status(500).json({ error: "Failed to fetch instructors" });
    }
});

// GET AVERAGE MARKS OF A CLASS
router.get("/class/:classId/average", async (req, res) => {
    let classAverageMarks: number = 0;
    let numberOfStudents: number = 0;
    const { classId } = req.params;
    try {
        const snapshot = await enrollmentCollection.where("classId", "==", classId).get();
        if (snapshot.empty) {
            return res.status(200).json({ averageMarks: 0 });
        }
        numberOfStudents = Number(snapshot.size);
        for(const doc of snapshot.docs) {
            let studentTotalMarks: number = 0;
            const officerId = doc.data().officerId;
            const marksSnapshot = await firestore.collection("marks").where("officerId", "==", officerId).get();
            if(marksSnapshot.empty) {
                return res.status(200).json([]);
            }
            for(const marksDoc of marksSnapshot.docs) {
                const { assessmentId, marks } = marksDoc.data();
                // Get assessment details
                studentTotalMarks += Number(marks);
            }
            classAverageMarks += studentTotalMarks;
        }
        const averageMarks = (classAverageMarks / numberOfStudents).toFixed(2);
        res.status(200).json({ averageMarks : Number(averageMarks) });
    } catch (error) {
        console.error("Error calculating average marks:", error);
        res.status(500).json({ error: "Failed to calculate average marks" });
    }
});

// GET AVERAGE MARKS FOR ALL CLASSES
router.get("/classes/average", async (req, res) => {
    try {
        const classSnapshot = await firestore.collection("class").get();
        const classAverages: { classId: string; className: string; averageMarks: number }[] = [];
        for (const classDoc of classSnapshot.docs) {
            const classId = classDoc.id;
            const className = classDoc.data().name;
            let classAverageMarks: number = 0;
            let numberOfStudents: number = 0;
            const enrollmentSnapshot = await enrollmentCollection.where("classId", "==", classId).get();
            if (enrollmentSnapshot.empty) {
                classAverages.push({ classId, className, averageMarks: 0 });
                continue;
            }
            numberOfStudents = Number(enrollmentSnapshot.size);
            for (const enrollmentDoc of enrollmentSnapshot.docs) {
                let studentTotalMarks: number = 0;
                const officerId = enrollmentDoc.data().officerId;
                const marksSnapshot = await firestore.collection("marks").where("officerId", "==", officerId).get();
                if (marksSnapshot.empty) {
                    continue;
                }
                for (const marksDoc of marksSnapshot.docs) {
                    const { marks } = marksDoc.data();
                    studentTotalMarks += Number(marks);
                }
                classAverageMarks += studentTotalMarks;
            }
            const averageMarks = (classAverageMarks / numberOfStudents).toFixed(2);
            classAverages.push({ classId, className, averageMarks: Number(averageMarks) });
        }
        res.status(200).json(classAverages);
    } catch (error) {
        console.error("Error fetching average marks for all classes:", error);
        res.status(500).json({ error: "Failed to fetch average marks for all classes" });
    }
});

// GET PET MARKS FOR ALL OFFCIERS OF ALL CLASSES
router.get("/classes/pet", async (req, res) => {
    try {
        const classSnapshot = await firestore.collection("class").get();
        const petMarksData: { classId: string; className: string; officerId: string; petMarks: Pet[] }[] = [];
        for (const classDoc of classSnapshot.docs) {
            const classId = classDoc.id;
            const className = classDoc.data().name;
            const enrollmentSnapshot = await enrollmentCollection.where("classId", "==", classId).get();
            for (const enrollmentDoc of enrollmentSnapshot.docs) {
                const officerId = enrollmentDoc.data().officerId;
                const officerDoc = await firestore.collection("officers").doc(officerId).get();
                const officerData = officerDoc.data();
                if (officerData && officerData.pet) {
                    petMarksData.push({ classId, className, officerId, petMarks: officerData.pet });
                } else {
                    petMarksData.push({ classId, className, officerId, petMarks: [] });
                }
            }
        }
        res.status(200).json(petMarksData);
    } catch (error) {
        console.error("Error fetching pet marks for all officers:", error);
        res.status(500).json({ error: "Failed to fetch pet marks for all officers" });
    }
})

// GET WARNING COUNTS FOR ALL OFFICERS
router.get("/officers/warnings", async (req: Request, res: Response) => {
    try {
        let result = {
            warningCounts : 0,
            punishments : 0,
            observations: 0
        }
        const warnings = await firestore.collection("warnings").get();
        if(warnings.empty){
            res.status(200).json(result);
        }
        for(const doc of warnings.docs){
            const data = doc.data();
            if(data.type === "observations"){
                result.observations += 1;
            } else if (data.type === "punishment") {
                result.punishments += 1;
            } else if(data.type === "warningSlips") {
                result.warningCounts += 1;
            }
        }
        res.status(200).json(result);
    }
    catch(error){
        console.error("Error fetching warning counts for all officers:", error);
        res.status(500).json({ error: "Failed to fetch warning counts for all officers" });
    }
})

// DELETE ALL OFFICERS
router.delete("/officers", async (req, res) => {
    try {
        const officersSnapshot = await firestore.collection("officers").get();
        const batch = firestore.batch();
        officersSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        res.status(200).json({ message: "All officers deleted successfully" });
    } catch (error) {
        console.error("Error deleting all officers:", error);
        res.status(500).json({ error: "Failed to delete all officers" });
    }
});

// DELETE ALL ENROLLMENTS
router.delete("/enrollments", async (req, res) => {
    try {
        const enrollmentsSnapshot = await enrollmentCollection.get();
        const batch = firestore.batch();
        enrollmentsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        res.status(200).json({ message: "All enrollments deleted successfully" });
    } catch (error) {
        console.error("Error deleting all enrollments:", error);
        res.status(500).json({ error: "Failed to delete all enrollments" });
    }
});

// GET AI SUMMARY FOR A CLASS BY CLASS ID
router.get("/class/:classId/ai-summary", async (req: Request, res: Response) => {
    const { classId } = req.params;
    try {
        if(!classId) {
            return res.status(400).json({ error: "classId parameter is required" });
        }
        const avgOfClass = utils.calculateAverageOfClass(classId);
        const numberOfOfficers = utils.getNumberOfOfficersInClass(classId);
        const failedOfficers = utils.getFailedOfficersInClass(classId);
        const petMarks = utils.getPetMarksOfClass(classId);
        const [averageMarks, totalOfficers, failedInClass, {totalPetMarks, obtainedPetMarks}] = await Promise.all([avgOfClass, numberOfOfficers, failedOfficers, petMarks]);
        const areOfficersNotFailed = utils.isObjectEmpty(failedInClass);
        if(averageMarks === 0 || totalPetMarks === 0 || obtainedPetMarks === 0 || totalOfficers === 0) {
            return res.status(200).json({ aiSummary: "No data available to generate summary." });
        }
        // Generate AI summary using OpenAi
        const prompt = `
        You are an educational performance analyzer. Summarize: - Class performance - Weak areas - Improvement recommendations - Special notes Use short bullet points. Avoid technical/exam terms. Be concise Give heading to each section. 
        Here are the class . Failed officers shows course name and number of officers failed in it.
        - Average Marks: ${averageMarks}
        - Total Officers: ${totalOfficers}
        - Failed Officers: ${areOfficersNotFailed ? "None" : JSON.stringify(failedInClass)}
        - PET Marks: ${totalPetMarks} (Obtained: ${obtainedPetMarks})
        `

        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [{
                role: "user",
                content: prompt
            }],
            max_completion_tokens: 500,
        })
        const aiSummary = response.choices[0].message?.content || "No summary generated.";
        res.status(200).json({ aiSummary });
    }
    catch (error) {
        console.error("Error generating AI summary for class:", error);
        res.status(500).json({ error: "Failed to generate AI summary for class" });
    }
})

// GET AI SUMMARY FOR AN OFFICER BY OFFICER ID
router.get("/officer/:officerId/ai-summary", async (req: Request, res: Response) => {
    const { officerId } = req.params;
    try {
        if(!officerId) {
            return res.status(400).json({ error: "officerId parameter is required" });
        }
        const officerDetails = utils.getDetailsOfOfficer(officerId);
        const averageMarks = utils.getAvgMarksOfOfficer(officerId);
        const traits = utils.getTraitsOfOfficer(officerId);
        const warnings = utils.getWarningsOfOfficer(officerId);
        const numberOfTimesSick = utils.getNumberOfTimesSailorGotSick(officerId);
        const [details, avgMarks, officerTraits, warningRecords, sickCount] = await Promise.all([officerDetails, averageMarks, traits, warnings, numberOfTimesSick]);
        if(avgMarks === 0 || officerTraits.length === 0) {
            return res.status(200).json({ aiSummary: "No data available to generate summary." });
        }
        const formattedTraits = officerTraits.map(trait => `${trait.traitName}: Score ${Number((trait.score/trait.total).toFixed(2))}`).join("; ");
        let formattedWarnings = '';
        if(!utils.isObjectEmpty(warningRecords)){
            formattedWarnings = `Observations - Green Slips: ${warningRecords['green-slip'].length > 0 ? warningRecords['green-slip'].join(", ") : "None"}; Red Slips: ${warningRecords['red-slip'].length > 0 ? warningRecords['red-slip'].join(", ") : "None"}.`;
        }
        const prompt = `
        You are an educational performance analyzer. Summarize: - Sailor performance - Weak areas - Improvement recommendations - Special notes Use short bullet points. Avoid technical/exam terms. Be concise. Give heading to each section.
        Green slip means good behavior while red slip means bad behavior in Observations. Health status Fit ex means sailor is on extended medical leave.
        Also use sailor instead of officer in the summary.
        Here are the sailor details:
        - Name: ${details?.name}
        - Health Status: ${details?.medicalCategory ? details.medicalCategory : "Not Available"}
        - Average Marks: ${avgMarks}
        - Traits: ${formattedTraits}
        - Observations: ${!!formattedWarnings ? formattedWarnings : "None"}
        - Times Sick: ${sickCount}
        `
        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [{
                role: "user",
                content: prompt
            }],
            max_completion_tokens: 800,
        })
        const aiSummary = response.choices[0].message?.content || "No summary generated.";
        res.status(200).json({ aiSummary });
    }
    catch (error) {
        console.error("Error generating AI summary for officer:", error);
        res.status(500).json({ error: "Failed to generate AI summary for officer" });
    }
});

export { router as commonRouter };