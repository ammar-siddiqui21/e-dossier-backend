export type Officer = {
    name: string;
    fatherName: string;
    cnic: string;
    dateOfBirth: Date;
    bloodGroup: string;
    contactNumber: string;
    maritalStatus: 'Married' | 'Single' | 'Divorced' | 'Widowed';
    classId: string[];
    emergencyContact: FamilyInformation;
    additionalFamilyInformation?: FamilyInformation[];
    marks? : Course[];
    pet: Pet[];
}

export type FamilyInformation = {
    name: string;
    relationship: string;
    contactNumber: string;
    cnic: string;
}

export type Course = {
    courseId: string;
    marks: number;
}

export type Pet = {
    totalMarks: number;
    obtainedMarks: number;
    remarks?: string;
}