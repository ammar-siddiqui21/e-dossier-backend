import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

function convertBase64ToJson() {
    const base64Key = process.env.FIREBASE_BASE64_KEY;
    if (!base64Key) throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 not set");

    // Decode from base64 to JSON
    const jsonKey = Buffer.from(base64Key, "base64").toString("utf-8");
    return JSON.parse(jsonKey);
}
const firebaseConfig = convertBase64ToJson();

if(!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: firebaseConfig.project_id,
            clientEmail: firebaseConfig.client_email,
            privateKey: firebaseConfig.private_key?.replace(/\\n/g, '\n'),
        }),
    });
}

export const firestore = admin.firestore();