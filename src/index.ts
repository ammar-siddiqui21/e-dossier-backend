import express from "express";
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

app.use("/api/v1", router, commonRouter);
app.use("/api/v1/data-entry", dataEntryRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
