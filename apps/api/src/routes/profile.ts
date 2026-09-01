import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const profileRouter = Router();

profileRouter.get("/profile", requireAuth, (req, res) => {
  res.json(req.user);
});
