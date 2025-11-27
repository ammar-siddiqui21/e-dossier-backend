import { Pet } from "../common/types/officer";
import { firestore } from "../firebase";


const enrollmentCollection = firestore.collection("enrollments");
const officerCollection = firestore.collection("officers");

type WarningResponse = {
    [key: string]: string[]
}


class Utils {

    calculateAverageOfClass = async (classId: string) => {
        let classAverageMarks: number = 0;
        let numberOfStudents: number = 0;
        const snapshot = await enrollmentCollection.where("classId", "==", classId).get();
        if (snapshot.empty) {
            return 0;
        }
        numberOfStudents = Number(snapshot.size);
        for(const doc of snapshot.docs) {
            let studentTotalMarks: number = 0;
            const officerId = doc.data().officerId;
            const marksSnapshot = await firestore.collection("marks").where("officerId", "==", officerId).get();
            if(marksSnapshot.empty) {
                return 0;
            }
            for(const marksDoc of marksSnapshot.docs) {
                const { assessmentId, marks } = marksDoc.data();
                // Get assessment details
                studentTotalMarks += Number(marks);
            }
            classAverageMarks += studentTotalMarks;
        }
        const averageMarks = (classAverageMarks / numberOfStudents).toFixed(2);
        return Number(averageMarks);
    }

    getNumberOfOfficersInClass = async (classId: string) => {
        const snapshot = await enrollmentCollection.where("classId", "==", classId).get();
        if (snapshot.empty) {
            return 0;
        }
        return snapshot.size;
    }

    getFailedOfficersInClass = async(classId: string) => {
        let result : {[courseId: string] : number} = {}
        // get all optional courses
        const optionalCoursesSnapshot = await firestore.collection("courses").where("type", "==", "Optional").get();
        if(optionalCoursesSnapshot.empty) {
            return ({ failedOptionalCourses: {} });
        }
        for(const course of optionalCoursesSnapshot.docs) {
            const courseId = course.id;
            const courseName = course.data().courseName;

            // Fetch all assessments of this course
            const assessmentsSnapshot = await firestore.collection("assessments").where("courseId", "==", courseId).get();
            if(assessmentsSnapshot.empty) {
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

            result[courseName] = failedOfficers.length;
        }

        return result;
    }

    getPetMarksOfClass = async(classId: string) => {
        let totalPetMarks = 0;
        let obtainedPetMarks = 0
        const enrollmentSnapshot = await enrollmentCollection.where("classId", "==", classId).get();
        for (const enrollmentDoc of enrollmentSnapshot.docs) {
            const officerId = enrollmentDoc.data().officerId;
            const officerDoc = await firestore.collection("officers").doc(officerId).get();
            const officerData = officerDoc.data();
            if (officerData && officerData.pet) {
                totalPetMarks += officerData.pet.totalMarks;
                obtainedPetMarks += officerData.pet.obtainedMarks;
            }
        }
        return { totalPetMarks, obtainedPetMarks };
    }

    getDetailsOfOfficer = async (officerId: string) => {
        const officerDoc = await officerCollection.doc(officerId).get();
        if (!officerDoc.exists) {
            throw new Error("Officer not found");
        }
        return officerDoc.data();
    }

    getAvgMarksOfOfficer = async (officerId: string) => {
        let totalMarksObtained: number = 0;
        let totalMarks: number = 0;
        
        const marksSnapshot = await firestore.collection("marks").where("officerId", "==", officerId).get();
        if (marksSnapshot.empty) {
            return 0;
        }
        for (const marksDoc of marksSnapshot.docs) {
            const { assessmentId, marks } = marksDoc.data();
            const assessmentDoc = await firestore.collection("assessments").doc(assessmentId).get();
            if (assessmentDoc.exists) {
                const assessmentData = assessmentDoc.data();
                totalMarks += Number(assessmentData?.totalMarks);
                totalMarksObtained += Number(marks);
            }
        }
        if (totalMarks === 0) {
            return 0;
        }
        const average = (totalMarksObtained / totalMarks) * 100;
        return Number(average.toFixed(2));  
    }

    getTraitsOfOfficer = async (officerId: string) => {
        const traitsSnapshot = await firestore.collection("traits").where("officerId", "==", officerId).get();
        const traits: any[] = [];
        for (const traitDoc of traitsSnapshot.docs) {
            traits.push(traitDoc.data());
        }
        return traits.filter((_, index) => index < 5); // return top 5 traits
    }

    getWarningsOfOfficer = async (officerId: string) => {
        const warningsSnapshot = await firestore.collection("warnings").where("officerId", "==", officerId).get();
        let result : WarningResponse = { 'green-slip': [], 'red-slip': [] };
        for (const warningDoc of warningsSnapshot.docs) {
            const {type, punishment, offense} = warningDoc.data();
            if(type === 'observations') {
                if(punishment.toLowerCase().includes('green slip')){
                    result['green-slip'].push(offense);
                } else if(punishment.toLowerCase().includes('red slip')){
                    result['red-slip'].push(offense); 
                }
            }
        }
        return result;
    }

    getNumberOfTimesSailorGotSick = async (officerId: string) => {
        const medicalSnapshot = await firestore.collection("medical").where("officerId", "==", officerId).get();
        return medicalSnapshot.size;
    }

    isObjectEmpty = (obj: Object) => {
        return Object.keys(obj).length === 0;
    }
}

export const utils = new Utils();