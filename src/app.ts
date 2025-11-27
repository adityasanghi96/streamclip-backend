import express from "express";
import clipRoute from "./routes/clip.route";

const app = express();
app.use(express.json());
app.use("/api", clipRoute);

export default app;
