import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { firestore } from "../firebase";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { User } from "../common/types/user";
import bcrypt from "bcryptjs";

dotenv.config();
const router = Router();

const refreshTokensCollection = firestore.collection("refreshTokens");

// Generate access token (1h)
function generateAccessToken(user: User): string {
  return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET as string, {
    expiresIn: "1h",
  });
}

// Generate refresh token (7d)
async function generateRefreshToken(userDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>): Promise<string> {
  const refreshToken = jwt.sign(
    { uid: userDoc.id },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: "7d" }
  );
  await refreshTokensCollection.doc(userDoc.id).set({ token: refreshToken });
  return refreshToken;
}

async function getUserFromCollection(refreshToken: string): Promise<FirebaseFirestore.DocumentData | null> {
    const snapshot = await refreshTokensCollection
        .where("token", "==", refreshToken)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return doc.data();
}

// ✅ LOGIN
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  try {
    // Find user by email in Firestore
    const snapshot = await firestore.collection("credentials").where("email", "==", email).limit(1).get();
    if (snapshot.empty) return res.status(401).json({ error: "Invalid credentials" });

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    // Compare hashed passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = generateAccessToken(user as User);
    const refreshToken = await generateRefreshToken(userDoc);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // true in production
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      role: user?.role,
      id: user?.id || '',
      accessToken,
      expiresIn: "1h",
      message: "Login successful",
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Invalid Firebase token" });
  }
});

// ✅ REFRESH
router.post("/refresh", async (req: Request, res: Response) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ error: "No refresh token" });

    try {
        const user = await getUserFromCollection(token);
        if (!user) return  res.status(401).json({ error: "Invalid refresh token" });

        const newAccessToken = generateAccessToken(user as User);

        res.json({ accessToken: newAccessToken });
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired refresh token" });
    }
});

// ✅ LOGOUT
router.post("/logout", async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken)
    return res.status(400).json({ message: "No refresh token provided" });

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET as string
    ) as { uid: string };

    await refreshTokensCollection.doc(decoded.uid).delete();
    res.clearCookie("refreshToken");
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(400).json({ message: "Invalid token" });
  }
});

// ✅ PROFILE
// router.get("/profile", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const userRecord = await auth.getUser(req.user!.uid);
//     res.json({
//       message: "User profile",
//       uid: userRecord.uid,
//       email: userRecord.email,
//       displayName: userRecord.displayName,
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Failed to fetch profile" });
//   }
// });

router.post('/create', async (req: AuthenticatedRequest, res: Response) => {
    const { email, password } = req.body;

    console.log(email, password);

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await firestore.collection('credentials').add({
            email,
            password: hashedPassword
        });
        res.status(201).json({ message: "User created successfully" });
    }
    catch(error) {
        res.status(500).json({ message: "Failed to create user" });
    }
})

export { router };
