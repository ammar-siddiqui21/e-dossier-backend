import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { router } from "./routes/auth.routes";
import { dataEntryRouter } from "./routes/data-entry/data.entry.routes";
import { commonRouter } from "./routes/common/common.routes";

dotenv.config();
const app = express();

app.use(bodyParser.json());
app.use(cookieParser());
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use("/api/v1", router, commonRouter);
app.use("/api/v1/data-entry", dataEntryRouter);

app.use((req, res, next) => {
  console.log('Request sent from origin', req.headers?.origin);
  console.log("Configuration provided by .env are", process?.env?.DEPLOYED_ORIGIN, process?.env?.LOCAL_DEV_ORIGIN)
  next();
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
